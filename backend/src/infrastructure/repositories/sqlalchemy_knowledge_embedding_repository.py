"""
SQLAlchemy Knowledge Embedding Repository: Persistência de vetores (JSON fallback).

Implementa operações de vector store usando SQLAlchemy.
Nota: Similarity search real (cosine) exige pgvector e será implementado na Fase AI-RAG-5.
Nesta fase, usamos armazenamento JSON e busca exata ou mockada.
"""
from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.schemas import RetrievalQuery, RetrievalResult
from src.ai_orchestration.rag.vector_store_contract import (
    EmbeddingVector,
    VectorSearchOptions,
    VectorStoreContract,
)
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeEmbeddingModel,
)


class SQLAlchemyKnowledgeEmbeddingRepository(VectorStoreContract):
    """Implementação Postgres/SQLAlchemy para armazenamento de embeddings (AI-RAG-4)."""

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
            # Validação defensiva no repositório
            if len(ev.vector) != ev.dimensions:
                continue

            # Tenta encontrar existente
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
        """Busca de similaridade (FALSO/MOCK para AI-RAG-4).
        
        Sem pgvector, não conseguimos fazer busca vetorial eficiente no DB.
        Retorna lista vazia ou levanta erro informativo.
        """
        # TODO: Implementar busca via pgvector na Fase AI-RAG-5
        return RetrievalResult(
            query=query.query,
            chunks=[],
            warnings=["similarity_search_not_implemented_no_pgvector"],
        )

    async def delete_embeddings_by_document(self, document_id: str) -> int:
        """Remove todos os embeddings vinculados a chunks de um documento."""
        # Precisamos de um JOIN para filtrar por document_id do chunk
        from src.infrastructure.database.models.ai_knowledge_models import (
            AIKnowledgeChunkModel,
        )
        
        subq = sa.select(AIKnowledgeChunkModel.id).where(
            AIKnowledgeChunkModel.document_id == UUID(document_id)
        )
        
        stmt = sa.delete(AIKnowledgeEmbeddingModel).where(
            AIKnowledgeEmbeddingModel.chunk_id.in_(subq)
        )
        
        result = await self._session.execute(stmt)
        return result.rowcount

    async def health_check(self) -> bool:
        """Verifica se a tabela de embeddings está acessível."""
        try:
            await self._session.execute(sa.text("SELECT 1 FROM ai_knowledge_embeddings LIMIT 1"))
            return True
        except Exception:
            return False

    async def count_embeddings(self, document_id: str | None = None) -> int:
        """Conta embeddings, opcionalmente filtrando por documento."""
        if document_id:
            from src.infrastructure.database.models.ai_knowledge_models import (
                AIKnowledgeChunkModel,
            )
            stmt = sa.select(sa.func.count()).select_from(AIKnowledgeEmbeddingModel).join(
                AIKnowledgeChunkModel, AIKnowledgeEmbeddingModel.chunk_id == AIKnowledgeChunkModel.id
            ).where(AIKnowledgeChunkModel.document_id == UUID(document_id))
        else:
            stmt = sa.select(sa.func.count()).select_from(AIKnowledgeEmbeddingModel)
            
        return await self._session.scalar(stmt) or 0
