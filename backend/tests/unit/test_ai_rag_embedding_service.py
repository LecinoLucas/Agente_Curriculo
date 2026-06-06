"""
Unit tests — Embedding Service (AI-RAG-4).
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from src.ai_orchestration.rag.embedding_service import EmbeddingService
from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider
from src.ai_orchestration.rag.schemas import KnowledgeChunk


def _make_chunk(content: str) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=str(uuid4()),
        document_id=str(uuid4()),
        chunk_index=0,
        content=content,
        metadata={},
    )


@pytest.mark.asyncio
class TestEmbeddingService:
    async def test_generate_embeddings_success(self) -> None:
        provider = FakeEmbeddingProvider(dimensions=4)
        service = EmbeddingService(provider=provider)
        
        chunks = [_make_chunk("Texto 1"), _make_chunk("Texto 2")]
        result = await service.generate_and_save_embeddings(chunks)
        
        assert result.ok is True
        assert result.embeddings_created == 2
        assert result.provider == "fake"
        assert result.dimensions == 4

    async def test_empty_chunks_returns_ok(self) -> None:
        service = EmbeddingService(provider=FakeEmbeddingProvider())
        result = await service.generate_and_save_embeddings([])
        assert result.ok is True
        assert result.embeddings_created == 0

    async def test_provider_error_handled(self) -> None:
        class ErrorProvider(FakeEmbeddingProvider):
            async def embed_texts(self, texts):
                raise RuntimeError("API Offline")
        
        service = EmbeddingService(provider=ErrorProvider())
        result = await service.generate_and_save_embeddings([_make_chunk("X")])
        
        assert result.ok is False
        assert "embedding_error" in result.error
        assert "API Offline" in result.error

    async def test_rejection_on_dimension_mismatch(self) -> None:
        """Test: Rejeita se o provider retornar vetor com dimensão errada."""
        class MismatchProvider(FakeEmbeddingProvider):
            async def embed_texts(self, texts):
                batch = await super().embed_texts(texts)
                # Força um vetor errado
                batch.vectors[0] = [0.1] * (self.dimensions + 1)
                return batch
        
        provider = MismatchProvider(dimensions=4)
        service = EmbeddingService(provider=provider)
        
        result = await service.generate_and_save_embeddings([_make_chunk("X")])
        
        assert result.ok is False
        assert result.error == "INVALID_EMBEDDING_DIMENSION"

    async def test_rejection_on_quantity_mismatch(self) -> None:
        """Test: Rejeita se a quantidade de vetores não bater com a de chunks."""
        class QuantityMismatchProvider(FakeEmbeddingProvider):
            async def embed_texts(self, texts):
                batch = await super().embed_texts(texts)
                batch.vectors = batch.vectors[:-1] # Remove um
                return batch
        
        provider = QuantityMismatchProvider(dimensions=4)
        service = EmbeddingService(provider=provider)
        
        result = await service.generate_and_save_embeddings([_make_chunk("A"), _make_chunk("B")])
        
        assert result.ok is False
        assert result.error == "embedding_quantity_mismatch"

    async def test_embed_query_delegates_to_provider(self) -> None:
        provider = FakeEmbeddingProvider(dimensions=4)
        service = EmbeddingService(provider=provider)
        
        q_vector = await service.embed_query("busca")
        assert len(q_vector) == 4
        assert q_vector == await provider.embed_query("busca")
