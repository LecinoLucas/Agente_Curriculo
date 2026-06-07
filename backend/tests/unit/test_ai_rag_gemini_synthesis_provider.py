import pytest
import httpx
from unittest.mock import patch, MagicMock
from src.ai_orchestration.rag.gemini_rag_synthesis_provider import GeminiRagSynthesisProvider
from src.ai_orchestration.rag.answer_schemas import RagSynthesisProviderResult

@pytest.mark.asyncio
class TestGeminiRagSynthesisProvider:
    
    async def test_generate_response_extracts_usage_metadata(self):
        """Testa se o provider extrai metadados de uso corretamente."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [{
                "content": {"parts": [{"text": "Resposta sintética"}]}
            }],
            "usageMetadata": {
                "promptTokenCount": 100,
                "candidatesTokenCount": 50,
                "totalTokenCount": 150
            }
        }

        with patch("httpx.AsyncClient.post", return_value=mock_response):
            provider = GeminiRagSynthesisProvider(api_key="fake-key", model="gemini-pro")
            result = await provider.generate_response("Pergunta teste")

            assert isinstance(result, RagSynthesisProviderResult)
            assert result.text == "Resposta sintética"
            assert result.input_tokens == 100
            assert result.output_tokens == 50
            assert result.total_tokens == 150
            assert result.usage_available is True

    async def test_generate_response_handles_missing_usage_metadata(self):
        """Testa o fallback quando usageMetadata não vem na resposta."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [{
                "content": {"parts": [{"text": "Resposta sem usage"}]}
            }]
            # usageMetadata ausente
        }

        with patch("httpx.AsyncClient.post", return_value=mock_response):
            provider = GeminiRagSynthesisProvider(api_key="fake-key", model="gemini-pro")
            result = await provider.generate_response("Pergunta teste")

            assert result.text == "Resposta sem usage"
            assert result.input_tokens == 0
            assert result.output_tokens == 0
            assert result.total_tokens == 0
            assert result.usage_available is False

    async def test_generate_response_handles_partial_usage_metadata(self):
        """Testa comportamento com usageMetadata parcial."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [{
                "content": {"parts": [{"text": "Uso parcial"}]}
            }],
            "usageMetadata": {
                "promptTokenCount": 42
                # totalTokenCount ausente
            }
        }

        with patch("httpx.AsyncClient.post", return_value=mock_response):
            provider = GeminiRagSynthesisProvider(api_key="fake-key", model="gemini-pro")
            result = await provider.generate_response("Pergunta teste")

            assert result.input_tokens == 42
            assert result.total_tokens == 0
            assert result.usage_available is False

    async def test_generate_response_error_sanitizes_api_key(self):
        """Garante que erros de rede não vazam a API key."""
        with patch("httpx.AsyncClient.post", side_effect=httpx.RequestError("Error calling API with key=SECRET_KEY")):
            provider = GeminiRagSynthesisProvider(api_key="SECRET_KEY", model="gemini-pro")
            
            with pytest.raises(RuntimeError) as exc:
                await provider.generate_response("Pergunta")
            
            assert "SECRET_KEY" not in str(exc.value)
            assert "[REDACTED]" in str(exc.value)
