"""
Unit tests — Fake Embedding Provider (AI-RAG-4).
"""
from __future__ import annotations

import pytest
from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider


@pytest.mark.asyncio
class TestFakeEmbeddingProvider:
    async def test_returns_expected_dimensions(self) -> None:
        provider = FakeEmbeddingProvider(dimensions=8)
        vector = await provider.embed_query("teste")
        assert len(vector) == 8
        
        provider_16 = FakeEmbeddingProvider(dimensions=16)
        v16 = await provider_16.embed_query("teste")
        assert len(v16) == 16

    async def test_same_text_same_vector(self) -> None:
        provider = FakeEmbeddingProvider()
        text = "O céu é azul."
        v1 = await provider.embed_query(text)
        v2 = await provider.embed_query(text)
        assert v1 == v2

    async def test_different_text_different_vector(self) -> None:
        provider = FakeEmbeddingProvider()
        v1 = await provider.embed_query("Texto A")
        v2 = await provider.embed_query("Texto B")
        assert v1 != v2

    async def test_embed_texts_preserves_order(self) -> None:
        provider = FakeEmbeddingProvider()
        texts = ["Primeiro", "Segundo", "Terceiro"]
        batch = await provider.embed_texts(texts)
        
        assert len(batch.vectors) == 3
        assert batch.vectors[0] == await provider.embed_query("Primeiro")
        assert batch.vectors[1] == await provider.embed_query("Segundo")
        assert batch.vectors[2] == await provider.embed_query("Terceiro")

    async def test_empty_text_returns_zero_vector(self) -> None:
        provider = FakeEmbeddingProvider(dimensions=4)
        vector = await provider.embed_query("   ")
        assert vector == [0.0, 0.0, 0.0, 0.0]

    async def test_batch_tokens_estimation(self) -> None:
        provider = FakeEmbeddingProvider()
        batch = await provider.embed_texts(["um dois", "tres quatro cinco"])
        assert batch.total_tokens == 5

    async def test_health_check_always_true(self) -> None:
        provider = FakeEmbeddingProvider()
        assert await provider.health_check() is True
