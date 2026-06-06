"""
Unit tests — Gemini RAG Synthesis Provider (AI-RAG-10).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from src.ai_orchestration.rag.gemini_rag_synthesis_provider import GeminiRagSynthesisProvider


@pytest.mark.asyncio
class TestGeminiRagSynthesisProvider:
    async def test_generate_response_success(self) -> None:
        """Test: GeminiRagSynthesisProvider chama client mockado e retorna texto."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [{
                "content": {"parts": [{"text": "Resposta sintetizada."}]}
            }]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiRagSynthesisProvider(api_key="test-key")
            answer = await provider.generate_response("Prompt de teste")
            
            assert answer == "Resposta sintetizada."
            
            # Verifica chamada
            args, kwargs = mock_post.call_args
            assert "generateContent" in args[0]
            assert kwargs["params"]["key"] == "test-key"
            assert "Prompt de teste" in str(kwargs["json"])

    async def test_handles_api_error_without_leaking_key(self) -> None:
        """Test: Trata erro da API sem vazar segredo."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 400
        mock_response.json.return_value = {
            "error": {"message": "Invalid model name", "code": 400}
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiRagSynthesisProvider(api_key="SECRET_123")
            with pytest.raises(RuntimeError) as exc_info:
                await provider.generate_response("X")
            
            assert "SECRET_123" not in str(exc_info.value)
            assert "Gemini Synthesis API failed" in str(exc_info.value)

    async def test_handles_empty_response(self) -> None:
        """Test: Trata resposta vazia (sem candidates)."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"candidates": []}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            
            provider = GeminiRagSynthesisProvider()
            with pytest.raises(RuntimeError, match="sem candidates"):
                await provider.generate_response("X")

    async def test_generate_response_timeout(self) -> None:
        with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Timeout")):
            provider = GeminiRagSynthesisProvider()
            with pytest.raises(RuntimeError, match="Network error"):
                await provider.generate_response("X")
