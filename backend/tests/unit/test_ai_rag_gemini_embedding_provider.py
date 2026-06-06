"""
Unit tests — Gemini Embedding Provider (AI-RAG-7).
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from src.ai_orchestration.rag.gemini_embedding_provider import GeminiEmbeddingProvider


@pytest.mark.asyncio
class TestGeminiEmbeddingProvider:
    async def test_embed_query_calls_correct_endpoint(self) -> None:
        """Test 5: GeminiEmbeddingProvider chama client mockado em embed_query."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embedding": {"values": [0.1] * 768}
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiEmbeddingProvider(api_key="test-key", dimensions=768)
            vector = await provider.embed_query("teste")
            
            assert len(vector) == 768
            assert vector[0] == 0.1
            
            # Verifica chamada
            args, kwargs = mock_post.call_args
            assert "embedContent" in args[0]
            assert kwargs["params"]["key"] == "test-key"
            assert kwargs["json"]["content"]["parts"][0]["text"] == "teste"

    async def test_embed_texts_calls_batch_endpoint(self) -> None:
        """Test 4: GeminiEmbeddingProvider chama client mockado em embed_texts."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embeddings": [
                {"values": [0.1] * 768},
                {"values": [0.2] * 768}
            ]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiEmbeddingProvider(api_key="test-key", dimensions=768)
            batch = await provider.embed_texts(["texto 1", "texto 2"])
            
            assert len(batch.vectors) == 2
            assert batch.vectors[0][0] == 0.1
            assert batch.vectors[1][0] == 0.2
            
            # Test 6: Preserva ordem
            assert batch.texts == ["texto 1", "texto 2"]
            
            # Verifica chamada
            args, kwargs = mock_post.call_args
            assert "batchEmbedContents" in args[0]
            assert len(kwargs["json"]["requests"]) == 2

    async def test_rejection_on_invalid_dimension(self) -> None:
        """Test 7: Valida dimensão retornada."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "embedding": {"values": [0.1, 0.2]} # Apenas 2 dims
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiEmbeddingProvider(dimensions=768) # Espera 768
            with pytest.raises(RuntimeError, match="invalid dimension"):
                await provider.embed_query("X")

    async def test_handles_empty_response(self) -> None:
        """Test 8: Trata resposta vazia do provider."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"embedding": {}} # Sem values

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiEmbeddingProvider()
            with pytest.raises(RuntimeError, match="empty embedding values"):
                await provider.embed_query("X")

    async def test_handles_api_error_without_leaking_key(self) -> None:
        """Test 9: Trata erro sem vazar segredo."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 403
        mock_response.json.return_value = {
            "error": {"message": "API key expired for model X", "code": 403}
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiEmbeddingProvider(api_key="SECRET_KEY_123")
            with pytest.raises(RuntimeError) as exc_info:
                await provider.embed_query("X")
            
            assert "SECRET_KEY_123" not in str(exc_info.value)
            assert "Gemini Embedding API failed" in str(exc_info.value)

    async def test_health_check_returns_false_if_no_key(self) -> None:
        with patch("src.core.settings.settings.GOOGLE_API_KEY_1", ""):
            provider = GeminiEmbeddingProvider(api_key="")
            assert await provider.health_check() is False

    async def test_network_error_sanitizes_api_key(self) -> None:
        """Test H-02: Falha de rede não vaza API key presente na URL."""
        sensitive_url = "https://generativelanguage.googleapis.com/v1beta/models/m?key=EMBEDDING-SECRET"
        mock_exc = httpx.ConnectError(f"Failed to connect to {sensitive_url}")
        
        with patch("httpx.AsyncClient.post", side_effect=mock_exc):
            provider = GeminiEmbeddingProvider(api_key="EMBEDDING-SECRET")
            # Testa embed_query
            with pytest.raises(RuntimeError) as exc_info:
                await provider.embed_query("teste")
            assert "EMBEDDING-SECRET" not in str(exc_info.value)
            
            # Testa embed_texts
            with pytest.raises(RuntimeError) as exc_info:
                await provider.embed_texts(["t1"])
            assert "EMBEDDING-SECRET" not in str(exc_info.value)

