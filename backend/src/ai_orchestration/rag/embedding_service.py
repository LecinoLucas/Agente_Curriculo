"""
Embedding Service: Coordena a geração e persistência de embeddings para chunks RAG.

Intermedeia o EmbeddingProviderContract e o VectorStoreContract.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from src.ai_orchestration.rag.embedding_contract import EmbeddingProviderContract
from src.ai_orchestration.rag.schemas import KnowledgeChunk
from src.ai_orchestration.rag.vector_store_contract import (
    EmbeddingVector,
    VectorStoreContract,
)

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingServiceResult:
    """Resultado da operação de geração de embeddings."""
    ok: bool
    embeddings_created: int = 0
    provider: str | None = None
    model: str | None = None
    dimensions: int | None = None
    error: str | None = None
    warnings: list[str] = field(default_factory=list)


class EmbeddingService:
    """Serviço que orquestra a vetorização de chunks (AI-RAG-4)."""

    def __init__(
        self,
        provider: EmbeddingProviderContract,
        vector_store: VectorStoreContract | None = None,
    ):
        self._provider = provider
        self._vector_store = vector_store

    async def generate_and_save_embeddings(
        self, chunks: list[KnowledgeChunk]
    ) -> EmbeddingServiceResult:
        """Gera embeddings para uma lista de chunks e salva no vector store.

        Se vector_store não for fornecido, apenas retorna os embeddings gerados
        sem persistir.
        """
        if not chunks:
            return EmbeddingServiceResult(ok=True, embeddings_created=0)

        try:
            # 1. Extrair textos para embedding
            texts = [c.content for c in chunks]

            # 2. Gerar embeddings via provider
            batch = await self._provider.embed_texts(texts)

            # 3. Converter para objetos EmbeddingVector
            embedding_vectors = []
            for i, chunk in enumerate(chunks):
                ev = EmbeddingVector(
                    chunk_id=chunk.id,
                    document_id=chunk.document_id,
                    provider=batch.provider,
                    model=batch.model,
                    dimensions=batch.dimensions,
                    vector=batch.vectors[i],
                    metadata={"content_hash": getattr(chunk, "content_hash", None)},
                )
                embedding_vectors.append(ev)

            # 4. Salvar no vector store (se disponível)
            created_count = len(embedding_vectors)
            if self._vector_store:
                created_count = await self._vector_store.upsert_embeddings(
                    embedding_vectors
                )

            return EmbeddingServiceResult(
                ok=True,
                embeddings_created=created_count,
                provider=batch.provider,
                model=batch.model,
                dimensions=batch.dimensions,
                warnings=batch.warnings,
            )

        except Exception as exc:
            logger.error(f"Erro no EmbeddingService: {exc}", exc_info=True)
            return EmbeddingServiceResult(
                ok=False,
                error=f"embedding_error: {exc}",
            )

    async def embed_query(self, query_text: str) -> list[float]:
        """Gera o embedding para uma query de busca."""
        return await self._provider.embed_query(query_text)
