"""
Postgres Vector Store: Implementação definitiva para busca vetorial RAG.

Gerencia a persistência de embeddings e a busca por similaridade (cosine distance).
Inclui fallback controlado quando pgvector não está disponível.

Enquanto a tabela ainda persiste vetores em `vector_json`, o modo pgvector usa
cast em SQL para empurrar ORDER BY/LIMIT ao banco. O fallback JSON permanece
compatível, mas agora com teto defensivo de candidatos para evitar varredura
linear sem controle.
"""
from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.pgvector_support import (
    JSON_FALLBACK_CANDIDATE_LIMIT,
    build_json_fallback_limited_warning,
    get_vector_extension_status,
    is_pgvector_available,
    build_pgvector_unavailable_warning,
)
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)
from src.ai_orchestration.rag.vector_store_contract import (
    EmbeddingVector,
    VectorSearchOptions,
    VectorStoreContract,
)
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeDocumentModel,
    AIKnowledgeEmbeddingModel,
    AIKnowledgeChunkModel,
)

# Only these filter keys are accepted in similarity_search to prevent injection
_ALLOWED_SEARCH_FILTERS: frozenset[str] = frozenset({"source_type"})
_JSON_FALLBACK_OVERSAMPLE_MULTIPLIER = 20


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors. Returns 0.0 if inputs are invalid."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(x * x for x in b) ** 0.5
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


class PostgresVectorStore(VectorStoreContract):
    """Vector Store para Postgres/pgvector com suporte a fallback JSON (AI-RAG-5)."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def upsert_embeddings(self, embeddings: list[EmbeddingVector]) -> int:
        """Persiste ou atualiza embeddings em lote.
        
        Garante idempotência por (chunk_id, provider, model).
        Rejeita vetores com dimensão inconsistente.
        """
        if not embeddings:
            return 0

        count = 0
        for ev in embeddings:
            # Validação defensiva
            if len(ev.vector) != ev.dimensions:
                continue

            stmt = sa.select(AIKnowledgeEmbeddingModel).where(
                AIKnowledgeEmbeddingModel.chunk_id == UUID(ev.chunk_id),
                AIKnowledgeEmbeddingModel.provider == ev.provider,
                AIKnowledgeEmbeddingModel.model == ev.model,
            )
            existing = await self._session.scalar(stmt)

            if existing:
                existing.vector_json = ev.vector
                existing.dimensions = ev.dimensions
                existing.content_hash = ev.metadata.get("content_hash", "legacy")
            else:
                new_emb = AIKnowledgeEmbeddingModel(
                    chunk_id=UUID(ev.chunk_id),
                    provider=ev.provider,
                    model=ev.model,
                    dimensions=ev.dimensions,
                    vector_json=ev.vector,
                    content_hash=ev.metadata.get("content_hash", "legacy"),
                )
                self._session.add(new_emb)
            count += 1
        
        await self._session.flush()
        return count

    async def similarity_search(
        self,
        query: RetrievalQuery,
        query_vector: list[float],
        options: VectorSearchOptions | None = None,
    ) -> RetrievalResult:
        """Busca chunks semanticamente similares via cosine similarity.

        Quando pgvector estiver disponível, aplica similaridade/ORDER BY/LIMIT em SQL.
        Quando pgvector não estiver disponível, usa fallback JSON com teto defensivo.

        Filtros aceitos (whitelist): source_type.
        Não retorna embedding bruto — apenas chunk content + metadata + score.
        """
        is_available = await is_pgvector_available(self._session)
        warnings: list[str] = []
        if not is_available:
            warnings.append(build_pgvector_unavailable_warning())

        # Validação de query vector
        if not query_vector:
            return RetrievalResult(
                query=query.query,
                chunks=[],
                warnings=["empty_query_embedding"],
            )

        if is_available:
            return await self._similarity_search_with_pgvector(
                query=query,
                query_vector=query_vector,
                warnings=warnings,
            )

        return await self._similarity_search_with_json_fallback(
            query=query,
            query_vector=query_vector,
            warnings=warnings,
        )

    async def _similarity_search_with_pgvector(
        self,
        *,
        query: RetrievalQuery,
        query_vector: list[float],
        warnings: list[str],
    ) -> RetrievalResult:
        vector_literal = self._format_pgvector_literal(query_vector)
        params: dict[str, object] = {
            "query_vector": vector_literal,
            "query_dimensions": len(query_vector),
            "limit": max(1, query.limit),
            "min_score": query.min_score,
        }

        sql_parts = [
            """
            SELECT
                c.id AS chunk_id,
                c.document_id AS document_id,
                c.chunk_index AS chunk_index,
                c.content AS content,
                c.metadata_json AS metadata_json,
                c.source_title AS source_title,
                d.title AS doc_title,
                d.source_type AS doc_source_type,
                GREATEST(
                    0.0,
                    1 - (
                        CAST(e.vector_json::text AS vector)
                        <=> CAST(:query_vector AS vector)
                    )
                ) AS score
            FROM ai_knowledge_embeddings e
            JOIN ai_knowledge_chunks c
              ON e.chunk_id = c.id
            JOIN ai_knowledge_documents d
              ON c.document_id = d.id
            WHERE d.archived_at IS NULL
              AND d.status IN ('active', 'published')
              AND jsonb_array_length(e.vector_json) = :query_dimensions
            """
        ]

        if query.filters and "source_type" in query.filters:
            sql_parts.append("AND d.source_type = :source_type")
            params["source_type"] = query.filters["source_type"]

        if query.min_score > 0.0:
            sql_parts.append(
                """
                AND GREATEST(
                    0.0,
                    1 - (
                        CAST(e.vector_json::text AS vector)
                        <=> CAST(:query_vector AS vector)
                    )
                ) >= :min_score
                """
            )

        sql_parts.append(
            """
            ORDER BY CAST(e.vector_json::text AS vector) <=> CAST(:query_vector AS vector) ASC
            LIMIT :limit
            """
        )

        result = await self._session.execute(sa.text("\n".join(sql_parts)), params)
        rows = result.mappings().all()

        chunks = [
            RetrievedChunk(
                chunk=KnowledgeChunk(
                    id=str(row["chunk_id"]),
                    document_id=str(row["document_id"]),
                    chunk_index=row["chunk_index"],
                    content=row["content"],
                    metadata=dict(row["metadata_json"] or {}),
                    source_title=row["doc_title"],
                ),
                score=round(max(0.0, float(row["score"])), 4),
                match_reason="vector_similarity",
            )
            for row in rows
        ]

        return RetrievalResult(
            query=query.query,
            chunks=chunks,
            total=len(chunks),
            warnings=warnings,
        )

    async def _similarity_search_with_json_fallback(
        self,
        *,
        query: RetrievalQuery,
        query_vector: list[float],
        warnings: list[str],
    ) -> RetrievalResult:
        candidate_limit = min(
            JSON_FALLBACK_CANDIDATE_LIMIT,
            max(
                max(1, query.limit) * _JSON_FALLBACK_OVERSAMPLE_MULTIPLIER,
                max(1, query.limit),
            ),
        )
        fetch_limit = candidate_limit + 1

        # JOIN: embeddings → chunks → documents (exclude archived docs)
        stmt = (
            sa.select(
                AIKnowledgeEmbeddingModel.vector_json,
                AIKnowledgeEmbeddingModel.dimensions,
                AIKnowledgeChunkModel.id.label("chunk_id"),
                AIKnowledgeChunkModel.chunk_index,
                AIKnowledgeChunkModel.content,
                AIKnowledgeChunkModel.metadata_json,
                AIKnowledgeChunkModel.source_title,
                AIKnowledgeChunkModel.document_id,
                AIKnowledgeDocumentModel.title.label("doc_title"),
                AIKnowledgeDocumentModel.source_type.label("doc_source_type"),
            )
            .select_from(AIKnowledgeEmbeddingModel)
            .join(
                AIKnowledgeChunkModel,
                AIKnowledgeEmbeddingModel.chunk_id == AIKnowledgeChunkModel.id,
            )
            .join(
                AIKnowledgeDocumentModel,
                AIKnowledgeChunkModel.document_id == AIKnowledgeDocumentModel.id,
            )
            .where(
                AIKnowledgeDocumentModel.archived_at.is_(None),
                AIKnowledgeDocumentModel.status.in_(("active", "published")),
            )
            .order_by(AIKnowledgeEmbeddingModel.created_at.desc())
            .limit(fetch_limit)
        )

        # Apply whitelisted filters only — unknown keys are silently ignored
        if query.filters:
            if "source_type" in query.filters:
                stmt = stmt.where(
                    AIKnowledgeDocumentModel.source_type == query.filters["source_type"]
                )

        rows = (await self._session.execute(stmt)).all()
        if len(rows) > candidate_limit:
            warnings.append(build_json_fallback_limited_warning())
            rows = rows[:candidate_limit]

        # Compute cosine similarity in Python (bridge: no native vector column yet)
        scored: list[tuple[float, object]] = []
        skipped_count = 0

        for row in rows:
            vector = row.vector_json
            if not isinstance(vector, list) or len(vector) != len(query_vector):
                skipped_count += 1
                continue
            
            raw_sim = _cosine_similarity(query_vector, vector)
            # Clamp to [0, 1]: negative cosine → semantically unrelated, treat as 0
            score = max(0.0, raw_sim)
            if query.min_score > 0.0 and score < query.min_score:
                continue
            scored.append((score, row))

        if skipped_count > 0:
            warnings.append(f"embedding_dimension_mismatch: skipped {skipped_count} chunks")

        scored.sort(key=lambda x: -x[0])
        scored = scored[: query.limit]

        chunks = [
            RetrievedChunk(
                chunk=KnowledgeChunk(
                    id=str(row.chunk_id),
                    document_id=str(row.document_id),
                    chunk_index=row.chunk_index,
                    content=row.content,
                    metadata=dict(row.metadata_json or {}),
                    source_title=row.doc_title,
                ),
                score=round(score, 4),
                match_reason="vector_similarity",
            )
            for score, row in scored
        ]

        return RetrievalResult(
            query=query.query,
            chunks=chunks,
            total=len(chunks),
            warnings=warnings,
        )

    @staticmethod
    def _format_pgvector_literal(vector: list[float]) -> str:
        """Serializa um vetor no formato textual aceito pelo cast para pgvector."""
        return "[" + ",".join(f"{float(value):.12g}" for value in vector) + "]"

    async def delete_embeddings_by_document(self, document_id: str) -> int:
        """Remove todos os embeddings vinculados a um documento."""
        subq = sa.select(AIKnowledgeChunkModel.id).where(
            AIKnowledgeChunkModel.document_id == UUID(document_id)
        )
        
        stmt = sa.delete(AIKnowledgeEmbeddingModel).where(
            AIKnowledgeEmbeddingModel.chunk_id.in_(subq)
        )
        
        result = await self._session.execute(stmt)
        return result.rowcount

    async def health_check(self) -> dict:
        """Relatório de saúde do vector store."""
        status = await get_vector_extension_status(self._session)
        
        # Teste de conexão simples
        try:
            await self._session.execute(sa.text("SELECT 1"))
            status["ok"] = True
        except Exception as exc:
            status["ok"] = False
            status["warnings"].append(f"database_connection_failed: {exc}")
            
        return status

    async def count_embeddings(self, document_id: str | None = None) -> int:
        """Conta embeddings totais ou por documento."""
        if document_id:
            stmt = sa.select(sa.func.count()).select_from(AIKnowledgeEmbeddingModel).join(
                AIKnowledgeChunkModel, AIKnowledgeEmbeddingModel.chunk_id == AIKnowledgeChunkModel.id
            ).where(AIKnowledgeChunkModel.document_id == UUID(document_id))
        else:
            stmt = sa.select(sa.func.count()).select_from(AIKnowledgeEmbeddingModel)
            
        return await self._session.scalar(stmt) or 0
