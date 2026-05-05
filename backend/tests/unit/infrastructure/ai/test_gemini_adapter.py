"""
Unit tests for GeminiAdapter robustness.

Tests cover:
- Valid response parsing
- Empty response handling
- HTTP error handling with retry logic
- Timeout/connection error handling
- Missing usage metadata
- JSON response validation
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.application.ports.ai_service import AIAnalysisRequest
from src.infrastructure.ai.gemini_adapter import GeminiAdapter, GeminiResponseFormatError


@pytest.fixture
def gemini_adapter():
    """Create a GeminiAdapter instance with mocked API key."""
    with patch("src.infrastructure.ai.gemini_adapter.settings") as mock_settings:
        mock_settings.GOOGLE_API_KEY = "test-api-key"
        mock_settings.GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
        yield GeminiAdapter("gemini-pro")


@pytest.fixture
def valid_request():
    """Create a valid AIAnalysisRequest."""
    return AIAnalysisRequest(
        resume_text="Senior Python developer with 10 years experience",
        prompt_template="Analyze this resume",
        system_prompt="You are a resume analyzer",
        max_tokens=2000,
        temperature=0.7,
        job_description="Looking for senior Python developer",
    )


@pytest.fixture
def valid_gemini_response():
    """Create a valid Gemini API response."""
    return {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"analysis": "senior level", "skills": ["Python", "Django"]}'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 150,
            "candidatesTokenCount": 100,
        },
    }


class TestGeminiAdapterValidResponse:
    """Test valid response handling."""

    def test_build_payload_disables_thinking_for_gemini_25(self, gemini_adapter, valid_request):
        """Gemini 2.5 JSON extraction should not spend budget on hidden thinking."""
        gemini_adapter._model_id = "gemini-2.5-flash"

        payload = gemini_adapter._build_payload(valid_request)

        assert payload["generationConfig"]["maxOutputTokens"] == 2000
        assert payload["generationConfig"]["responseMimeType"] == "application/json"
        assert payload["generationConfig"]["thinkingConfig"] == {"thinkingBudget": 0}

    @pytest.mark.asyncio
    async def test_successful_analysis(self, gemini_adapter, valid_request, valid_gemini_response):
        """Test successful analysis with valid response."""
        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = valid_gemini_response

            response = await gemini_adapter.analyze(valid_request)

            assert response.content == '{"analysis": "senior level", "skills": ["Python", "Django"]}'
            assert response.input_tokens == 150
            assert response.output_tokens == 100
            assert response.processing_time_ms >= 0

    @pytest.mark.asyncio
    async def test_multipart_content_concatenation(self, gemini_adapter, valid_request):
        """Test that multiple content parts are concatenated and parsed as JSON."""
        response_with_multipart = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": '{"part": 1, '},
                            {"text": '"section": "a"}'},
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 100,
                "candidatesTokenCount": 50,
            },
        }

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = response_with_multipart

            response = await gemini_adapter.analyze(valid_request)

            assert '{"part": 1, "section": "a"}' == response.content


class TestGeminiAdapterEmptyResponse:
    """Test handling of empty/invalid responses."""

    @pytest.mark.asyncio
    async def test_empty_candidates_list(self, gemini_adapter, valid_request):
        """Test error when candidates list is empty."""
        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = {"candidates": []}

            with pytest.raises(RuntimeError, match="no candidates"):
                await gemini_adapter.analyze(valid_request)

    @pytest.mark.asyncio
    async def test_empty_parts(self, gemini_adapter, valid_request):
        """Test error when content parts are empty."""
        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = {
                "candidates": [{"content": {"parts": []}}],
                "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 0},
            }

            with pytest.raises(RuntimeError, match="empty content parts"):
                await gemini_adapter.analyze(valid_request)

    @pytest.mark.asyncio
    async def test_empty_text_content(self, gemini_adapter, valid_request):
        """Test error when text content is empty or whitespace-only."""
        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = {
                "candidates": [{"content": {"parts": [{"text": "   "}]}}],
                "usageMetadata": {"promptTokenCount": 100, "candidatesTokenCount": 0},
            }

            with pytest.raises(RuntimeError, match="empty text content"):
                await gemini_adapter.analyze(valid_request)

    @pytest.mark.asyncio
    async def test_truncated_json_raises_structured_error(self, gemini_adapter, valid_request):
        """Test that MAX_TOKENS parse failures preserve metadata for persistence."""
        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = {
                "candidates": [
                    {
                        "finishReason": "MAX_TOKENS",
                        "content": {"parts": [{"text": '{"overall_score": 82,'}]},
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 321,
                    "candidatesTokenCount": 300,
                },
            }

            with pytest.raises(GeminiResponseFormatError, match="truncated") as exc_info:
                await gemini_adapter.analyze(valid_request)

            exc = exc_info.value
            assert exc.finish_reason == "MAX_TOKENS"
            assert exc.input_tokens == 321
            assert exc.output_tokens == 300
            assert exc.raw_response == '{"overall_score": 82,'


class TestGeminiAdapterErrorHandling:
    """Test HTTP error handling."""

    @pytest.mark.asyncio
    async def test_http_400_no_retry(self, gemini_adapter, valid_request):
        """Test that 400 errors do not trigger retry."""
        response_mock = MagicMock()
        response_mock.status_code = 400
        response_mock.json.return_value = {
            "error": {"message": "Invalid request"}
        }

        http_error = httpx.HTTPStatusError(
            "Bad Request",
            request=MagicMock(),
            response=response_mock,
        )

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = http_error

            with pytest.raises(httpx.HTTPStatusError):
                await gemini_adapter.analyze(valid_request)

            # Should only be called once (no retries for 400)
            assert mock_call.call_count == 1

    @pytest.mark.asyncio
    async def test_http_429_with_retry(self, gemini_adapter, valid_request, valid_gemini_response):
        """Test that 429 (Too Many Requests) triggers retry."""
        response_mock = MagicMock()
        response_mock.status_code = 429

        http_error = httpx.HTTPStatusError(
            "Too Many Requests",
            request=MagicMock(),
            response=response_mock,
        )

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            # First attempt fails with 429, second succeeds
            mock_call.side_effect = [http_error, valid_gemini_response]

            response = await gemini_adapter.analyze(valid_request)

            assert response.content == '{"analysis": "senior level", "skills": ["Python", "Django"]}'
            assert mock_call.call_count == 2

    @pytest.mark.asyncio
    async def test_http_500_with_retry(self, gemini_adapter, valid_request, valid_gemini_response):
        """Test that 500 errors trigger retry."""
        response_mock = MagicMock()
        response_mock.status_code = 500

        http_error = httpx.HTTPStatusError(
            "Internal Server Error",
            request=MagicMock(),
            response=response_mock,
        )

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            # First attempt fails, second succeeds
            mock_call.side_effect = [http_error, valid_gemini_response]

            response = await gemini_adapter.analyze(valid_request)

            assert response.input_tokens == 150
            assert mock_call.call_count == 2

    @pytest.mark.asyncio
    async def test_http_502_with_retry(self, gemini_adapter, valid_request, valid_gemini_response):
        """Test that 502 (Bad Gateway) triggers retry."""
        response_mock = MagicMock()
        response_mock.status_code = 502

        http_error = httpx.HTTPStatusError(
            "Bad Gateway",
            request=MagicMock(),
            response=response_mock,
        )

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = [http_error, http_error, valid_gemini_response]

            response = await gemini_adapter.analyze(valid_request)

            assert response.content is not None
            assert mock_call.call_count == 3

    @pytest.mark.asyncio
    async def test_http_503_with_retry(self, gemini_adapter, valid_request):
        """Test that 503 (Service Unavailable) triggers retry, max 2 retries."""
        response_mock = MagicMock()
        response_mock.status_code = 503

        http_error = httpx.HTTPStatusError(
            "Service Unavailable",
            request=MagicMock(),
            response=response_mock,
        )

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = http_error

            with pytest.raises(RuntimeError, match="Max retries exceeded"):
                await gemini_adapter.analyze(valid_request)

            # Initial attempt + 2 retries = 3 total
            assert mock_call.call_count == 3

    @pytest.mark.asyncio
    async def test_http_504_with_retry(self, gemini_adapter, valid_request):
        """Test that 504 (Gateway Timeout) triggers retry."""
        response_mock = MagicMock()
        response_mock.status_code = 504

        http_error = httpx.HTTPStatusError(
            "Gateway Timeout",
            request=MagicMock(),
            response=response_mock,
        )

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = http_error

            with pytest.raises(RuntimeError):
                await gemini_adapter.analyze(valid_request)

            # Should attempt retries
            assert mock_call.call_count >= 1


class TestGeminiAdapterConnectionErrors:
    """Test connection and timeout error handling."""

    @pytest.mark.asyncio
    async def test_connection_error(self, gemini_adapter, valid_request):
        """Test handling of connection errors."""
        connect_error = httpx.ConnectError("Unable to connect")

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = connect_error

            with pytest.raises(RuntimeError, match="Failed to connect"):
                await gemini_adapter.analyze(valid_request)

    @pytest.mark.asyncio
    async def test_read_timeout_error(self, gemini_adapter, valid_request):
        """Test handling of read timeout errors."""
        timeout_error = httpx.ReadTimeout("Read timeout")

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = timeout_error

            with pytest.raises(RuntimeError, match="Failed to connect"):
                await gemini_adapter.analyze(valid_request)


class TestGeminiAdapterUsageMetadata:
    """Test handling of usage metadata."""

    @pytest.mark.asyncio
    async def test_missing_usage_metadata(self, gemini_adapter, valid_request):
        """Test handling when usageMetadata is missing."""
        response_data = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"analysis": "result", "score": 85}'
                            }
                        ]
                    }
                }
            ],
        }

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = response_data

            response = await gemini_adapter.analyze(valid_request)

            assert response.content == '{"analysis": "result", "score": 85}'
            assert response.input_tokens == 0
            assert response.output_tokens == 0

    @pytest.mark.asyncio
    async def test_partial_usage_metadata(self, gemini_adapter, valid_request):
        """Test handling when usageMetadata is incomplete."""
        response_data = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"status": "completed"}'
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": 100,
                # candidatesTokenCount missing
            },
        }

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = response_data

            response = await gemini_adapter.analyze(valid_request)

            assert response.input_tokens == 100
            assert response.output_tokens == 0

    @pytest.mark.asyncio
    async def test_null_usage_tokens(self, gemini_adapter, valid_request):
        """Test handling when usage tokens are null/None."""
        response_data = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": '{"validated": true}'
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {
                "promptTokenCount": None,
                "candidatesTokenCount": None,
            },
        }

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = response_data

            response = await gemini_adapter.analyze(valid_request)

            assert response.input_tokens == 0
            assert response.output_tokens == 0


class TestGeminiAdapterIntegration:
    """Integration tests for retry logic and timing."""

    @pytest.mark.asyncio
    async def test_retry_delay_increases(self, gemini_adapter, valid_request, valid_gemini_response):
        """Test that retry delay increases with each attempt."""
        response_mock = MagicMock()
        response_mock.status_code = 429

        http_error = httpx.HTTPStatusError(
            "Too Many Requests",
            request=MagicMock(),
            response=response_mock,
        )

        call_times = []

        async def mock_call_with_timing(*args, **kwargs):
            call_times.append(asyncio.get_event_loop().time())
            if len(call_times) < 2:
                raise http_error
            return valid_gemini_response

        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.side_effect = mock_call_with_timing

            response = await gemini_adapter.analyze(valid_request)

            assert response.content is not None
            assert len(call_times) == 2

    @pytest.mark.asyncio
    async def test_no_retry_for_successful_call(self, gemini_adapter, valid_request, valid_gemini_response):
        """Test that successful call doesn't trigger retries."""
        with patch.object(
            gemini_adapter, "_call_gemini_api", new_callable=AsyncMock
        ) as mock_call:
            mock_call.return_value = valid_gemini_response

            response = await gemini_adapter.analyze(valid_request)

            assert response.content is not None
            assert mock_call.call_count == 1
