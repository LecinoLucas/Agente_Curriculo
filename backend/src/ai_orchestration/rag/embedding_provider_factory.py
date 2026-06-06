"""
Embedding Provider Factory: Centraliza a criação de provedores de embedding.

Permite alternar entre Fake e Gemini via configuração (AI-RAG-7).
"""
from __future__ import annotations

import logging
from src.ai_orchestration.rag.embedding_contract import EmbeddingProviderContract
from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider
from src.ai_orchestration.rag.gemini_embedding_provider import GeminiEmbeddingProvider
from src.core.settings import settings

logger = logging.getLogger(__name__)


def get_embedding_provider() -> EmbeddingProviderContract:
    """Retorna o provedor de embedding configurado no sistema.

    Fallback automático para FakeEmbeddingProvider se Gemini não estiver habilitado
    ou se houver erro de configuração.
    """
    provider_type = (settings.RAG_EMBEDDING_PROVIDER or "fake").lower()

    if provider_type == "gemini":
        if not settings.RAG_GEMINI_EMBEDDING_ENABLED:
            logger.warning("RAG_EMBEDDING_PROVIDER=gemini mas RAG_GEMINI_EMBEDDING_ENABLED=false. Usando 'fake'.")
            return FakeEmbeddingProvider()

        if not settings.GOOGLE_API_KEY_1:
            logger.error("Gemini embedding habilitado mas GOOGLE_API_KEY_1 está vazia. Usando 'fake'.")
            return FakeEmbeddingProvider()

        return GeminiEmbeddingProvider()

    # Default: Fake
    return FakeEmbeddingProvider()
