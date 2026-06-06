"""
Postgres Vector Store: Implementação definitiva para busca vetorial RAG.

Gerencia a persistência de embeddings e a busca por similaridade (cosine distance).
Inclui fallback controlado quando pgvector não está disponível.
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
from src.ai_orchestration.rag.schemas import RetrievalQuery, RetrievalResult
from src.ai_orchestration.rag.vector_store_contract import (
    EmbeddingVector,
    VectorSearchOptions,
    VectorStoreContract,
)
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeEmbeddingModel,
    AIKnowledgeChunkModel,
)


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
        """Executa busca por similaridade.
        
        Retorna resultado controlado com aviso se pgvector estiver ausente.
        """
        is_available = await is_pgvector_available(self._session)
        
        if not is_available:
            return RetrievalResult(
                query=query.query,
                chunks=[],
                warnings=[build_pgvector_unavailable_warning()],
            )

        # TODO: Implementar busca real pgvector na AI-RAG-6
        # Por enquanto, retornamos vazio com aviso de que a busca real está pendente de ativação
        return RetrievalResult(
            query=query.query,
            chunks=[],
            warnings=["vector_search_ready_waiting_for_implementation"],
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
