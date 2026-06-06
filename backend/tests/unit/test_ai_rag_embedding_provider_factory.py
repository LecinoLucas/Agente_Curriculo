"""
Unit tests — Embedding Provider Factory (AI-RAG-7).
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from src.ai_orchestration.rag.embedding_provider_factory import get_embedding_provider
from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider
from src.ai_orchestration.rag.gemini_embedding_provider import GeminiEmbeddingProvider


class TestEmbeddingProviderFactory:
    def test_factory_returns_fake_by_default(self) -> None:
        """Test 1: Factory retorna FakeEmbeddingProvider por default."""
        with patch("src.core.settings.settings.RAG_EMBEDDING_PROVIDER", "fake"):
            provider = get_embedding_provider()
            assert isinstance(provider, FakeEmbeddingProvider)

    def test_factory_returns_gemini_when_enabled(self) -> None:
        """Test 2: Factory retorna GeminiEmbeddingProvider quando config habilita Gemini."""
        with patch("src.core.settings.settings.RAG_EMBEDDING_PROVIDER", "gemini"), \
             patch("src.core.settings.settings.RAG_GEMINI_EMBEDDING_ENABLED", True), \
             patch("src.core.settings.settings.GOOGLE_API_KEY_1", "valid-key"):
            
            provider = get_embedding_provider()
            assert isinstance(provider, GeminiEmbeddingProvider)

    def test_factory_falls_back_to_fake_if_gemini_disabled(self) -> None:
        """Test 3: Factory retorna Fake se Gemini selecionado mas desabilitado."""
        with patch("src.core.settings.settings.RAG_EMBEDDING_PROVIDER", "gemini"), \
             patch("src.core.settings.settings.RAG_GEMINI_EMBEDDING_ENABLED", False):
            
            provider = get_embedding_provider()
            assert isinstance(provider, FakeEmbeddingProvider)

    def test_factory_falls_back_to_fake_if_gemini_missing_key(self) -> None:
        """Test 3: Factory retorna Fake se Gemini selecionado mas sem chave."""
        with patch("src.core.settings.settings.RAG_EMBEDDING_PROVIDER", "gemini"), \
             patch("src.core.settings.settings.RAG_GEMINI_EMBEDDING_ENABLED", True), \
             patch("src.core.settings.settings.GOOGLE_API_KEY_1", ""):
            
            provider = get_embedding_provider()
            assert isinstance(provider, FakeEmbeddingProvider)
