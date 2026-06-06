"""
Gemini Embedding Provider: Implementação real para geração de embeddings via Google AI.

Implementa EmbeddingProviderContract (AI-RAG-7).
Utiliza a API do Gemini para gerar vetores de alta qualidade.
Suporta chamadas individuais (:embedContent) e em lote (:batchEmbedContents).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from src.ai_orchestration.rag.embedding_contract import (
    EmbeddingBatch,
    EmbeddingProviderContract,
)
from src.core.settings import settings
from src.core.log_sanitizer import sanitize_log_text

logger = logging.getLogger(__name__)


class GeminiEmbeddingProvider(EmbeddingProviderContract):
    """Provedor de embeddings utilizando Google Gemini (AI-RAG-7).

    Recomendado para produção devido ao custo-benefício.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        dimensions: int | None = None,
    ):
        self._api_key = api_key or settings.GOOGLE_API_KEY_1
        self._model_name = model or settings.RAG_GEMINI_EMBEDDING_MODEL
        self._dimensions = dimensions or settings.RAG_GEMINI_EMBEDDING_DIMENSIONS
        self._provider_name = "gemini"
        
        if not self._api_key:
            logger.warning("GeminiEmbeddingProvider inicializado sem API Key (GOOGLE_API_KEY_1 vazia).")

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimensions(self) -> int:
        return self._dimensions

    async def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        """Gera embeddings em lote via :batchEmbedContents."""
        if not texts:
            raise ValueError("texts cannot be empty")

        # Filtra textos vazios para evitar erros da API (retornando vetor zero)
        # Gemini API geralmente falha com partes vazias
        processed_texts = [t.strip() or "[empty]" for t in texts]
        
        payload = {
            "requests": [
                {
                    "model": f"models/{self._model_name}",
                    "content": {"parts": [{"text": t}]},
                }
                for t in processed_texts
            ]
        }

        try:
            async with httpx.AsyncClient(timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{settings.GEMINI_API_BASE_URL}/models/{self._model_name}:batchEmbedContents",
                    params={"key": self._api_key},
                    json=payload,
                )
                
                if response.status_code != 200:
                    self._handle_api_error(response)

                data = response.json()
                embeddings = data.get("embeddings", [])
                
                if len(embeddings) != len(texts):
                    raise RuntimeError(f"Gemini API returned {len(embeddings)} embeddings for {len(texts)} texts")

                vectors = [emb["values"] for i, emb in enumerate(embeddings)]
                
                # Validação de dimensão (Hardening AI-RAG-6A)
                for i, v in enumerate(vectors):
                    if len(v) != self._dimensions:
                        raise RuntimeError(
                            f"Gemini API returned invalid dimension: {len(v)} vs expected {self._dimensions} (text index {i})"
                        )

                return EmbeddingBatch(
                    texts=texts,
                    vectors=vectors,
                    model=self._model_name,
                    provider=self._provider_name,
                    dimensions=self._dimensions,
                    total_tokens=0, # Gemini v1beta não retorna tokens no batchEmbed
                )

        except httpx.RequestError as exc:
            raise RuntimeError(f"Network error calling Gemini Embedding API: {exc}")

    async def embed_query(self, text: str) -> list[float]:
        """Gera embedding para query via :embedContent."""
        if not text or not text.strip():
            raise ValueError("text cannot be empty")

        payload = {
            "model": f"models/{self._model_name}",
            "content": {"parts": [{"text": text}]},
        }

        try:
            async with httpx.AsyncClient(timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    f"{settings.GEMINI_API_BASE_URL}/models/{self._model_name}:embedContent",
                    params={"key": self._api_key},
                    json=payload,
                )

                if response.status_code != 200:
                    self._handle_api_error(response)

                data = response.json()
                vector = data.get("embedding", {}).get("values", [])
                
                if not vector:
                    raise RuntimeError("Gemini API returned empty embedding values")
                
                if len(vector) != self._dimensions:
                    raise RuntimeError(
                        f"Gemini API returned invalid dimension: {len(vector)} vs expected {self._dimensions}"
                    )

                return vector

        except httpx.RequestError as exc:
            raise RuntimeError(f"Network error calling Gemini Embedding API: {exc}")

    async def health_check(self) -> bool:
        """Verifica se a chave e o modelo estão ativos com uma chamada mínima."""
        if not self._api_key:
            return False
        try:
            await self.embed_query("health check")
            return True
        except Exception:
            return False

    def _handle_api_error(self, response: httpx.Response) -> None:
        """Trata erros da API sem vazar segredos."""
        try:
            error_data = response.json().get("error", {})
            message = error_data.get("message", "Unknown Gemini API error")
            code = error_data.get("code", response.status_code)
        except Exception:
            message = response.text or "Unknown error"
            code = response.status_code

        sanitized_msg = sanitize_log_text(message)
        logger.error(f"Gemini Embedding API Error (HTTP {code}): {sanitized_msg}")
        raise RuntimeError(f"Gemini Embedding API failed: {sanitized_msg}")
