"""
Postgres Vector Store: Implementação definitiva para busca vetorial RAG.

Gerencia a persistência de embeddings e a busca por similaridade (cosine distance).
Inclui fallback controlado quando pgvector não está disponível.

Nota AI-RAG-6 (bridge): A tabela ai_knowledge_embeddings armazena vetores em
vector_json (JSONB), pois ainda não há coluna vector(N) nativa do pgvector.
A similarity_search computa cosine similarity em Python sobre os vetores JSON.
Quando uma migração adicionar a coluna vector real (AI-RAG-7+), a query SQL
será reescrita para usar o operador <=> do pgvector.
"""
from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.pgvector_support import (
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
        """
        if not embeddings:
            return 0

        count = 0
        for ev in embeddings:
            stmt = sa.select(AIKnowledgeEmbeddingModel).where(
                AIKnowledgeEmbeddingModel.chunk_id == UUID(ev.chunk_id),
                AIKnowledgeEmbeddingModel.provider == ev.provider,
                AIKnowledgeEmbeddingModel.model == ev.model,
            )
            existing = await self._session.scalar(stmt)

            if existing:
                existing.vector_json = ev.vector
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

        Bridge AI-RAG-6: computa cosine similarity em Python sobre vector_json (JSONB).
        Quando pgvector não estiver disponível retorna resultado controlado com aviso.
        Quando pgvector estiver disponível executa JOIN e rankeia em Python.

        Filtros aceitos (whitelist): source_type.
        Não retorna embedding bruto — apenas chunk content + metadata + score.
        """
        is_available = await is_pgvector_available(self._session)

        if not is_available:
            return RetrievalResult(
                query=query.query,
                chunks=[],
                warnings=[build_pgvector_unavailable_warning()],
            )

        # JOIN: embeddings → chunks → documents (exclude archived docs)
        stmt = (
            sa.select(
                AIKnowledgeEmbeddingModel.vector_json,
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
            .where(AIKnowledgeDocumentModel.archived_at.is_(None))
        )

        # Apply whitelisted filters only — unknown keys are silently ignored
        if query.filters:
            if "source_type" in query.filters:
                stmt = stmt.where(
                    AIKnowledgeDocumentModel.source_type == query.filters["source_type"]
                )

        rows = (await self._session.execute(stmt)).all()

        # Compute cosine similarity in Python (bridge: no native vector column yet)
        scored: list[tuple[float, object]] = []
        for row in rows:
            vector = row.vector_json
            if not isinstance(vector, list) or len(vector) != len(query_vector):
                continue
            raw_sim = _cosine_similarity(query_vector, vector)
            # Clamp to [0, 1]: negative cosine → semantically unrelated, treat as 0
            score = max(0.0, raw_sim)
            if query.min_score > 0.0 and score < query.min_score:
                continue
            scored.append((score, row))

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
            warnings=[],
        )

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
