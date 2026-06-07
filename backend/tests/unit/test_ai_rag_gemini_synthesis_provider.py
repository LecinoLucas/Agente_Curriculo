import pytest
import httpx
from unittest.mock import patch, MagicMock
from src.ai_orchestration.rag.gemini_rag_synthesis_provider import GeminiRagSynthesisProvider, GeminiSynthesisError
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
            assert exc.value.error_code == "PROVIDER_UNAVAILABLE"
            assert exc.value.provider_message is not None
            assert "[REDACTED]" in exc.value.provider_message

    async def test_generate_response_classifies_503_as_provider_unavailable(self):
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.json.return_value = {
            "error": {"message": "Temporary outage", "code": 503}
        }

        sleep_calls: list[float] = []

        async def fake_sleep(seconds: float) -> None:
            sleep_calls.append(seconds)

        with patch("httpx.AsyncClient.post", return_value=mock_response) as post_mock:
            provider = GeminiRagSynthesisProvider(
                api_key="fake-key",
                model="gemini-pro",
                max_retries=2,
                sleep=fake_sleep,
            )

            with pytest.raises(GeminiSynthesisError) as exc:
                await provider.generate_response("Pergunta teste")

            assert exc.value.error_code == "PROVIDER_UNAVAILABLE"
            assert "temporariamente indisponível" in exc.value.user_message
            assert "fake-key" not in str(exc.value)
            assert post_mock.call_count == 3
            assert sleep_calls == [0.5, 1.0]

    async def test_generate_response_classifies_429_as_rate_limited(self):
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.json.return_value = {
            "error": {"message": "Rate limited", "code": 429}
        }

        async def fake_sleep(_seconds: float) -> None:
            return None

        with patch("httpx.AsyncClient.post", return_value=mock_response):
            provider = GeminiRagSynthesisProvider(
                api_key="fake-key",
                model="gemini-pro",
                max_retries=0,
                sleep=fake_sleep,
            )

            with pytest.raises(GeminiSynthesisError) as exc:
                await provider.generate_response("Pergunta teste")

            assert exc.value.error_code == "PROVIDER_RATE_LIMITED"
            assert "limite temporário" in exc.value.user_message

    async def test_generate_response_retries_timeout_then_succeeds(self):
        first_error = httpx.ReadTimeout("Request timed out")
        success_response = MagicMock()
        success_response.status_code = 200
        success_response.json.return_value = {
            "candidates": [{"content": {"parts": [{"text": "Resposta após retry"}]}}],
            "usageMetadata": {
                "promptTokenCount": 20,
                "candidatesTokenCount": 10,
                "totalTokenCount": 30,
            },
        }

        sleep_calls: list[float] = []

        async def fake_sleep(seconds: float) -> None:
            sleep_calls.append(seconds)

        with patch("httpx.AsyncClient.post", side_effect=[first_error, success_response]) as post_mock:
            provider = GeminiRagSynthesisProvider(
                api_key="fake-key",
                model="gemini-pro",
                max_retries=2,
                sleep=fake_sleep,
            )

            result = await provider.generate_response("Pergunta teste")

            assert result.text == "Resposta após retry"
            assert result.total_tokens == 30
            assert post_mock.call_count == 2
            assert sleep_calls == [0.5]
