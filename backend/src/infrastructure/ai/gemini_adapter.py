import asyncio
import time
from typing import Any

import httpx
import structlog

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.core.settings import settings

logger = structlog.get_logger(__name__)

# HTTP status codes that warrant a retry
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
MAX_RETRIES = 2
RETRY_DELAY_MS = 100


class GeminiAdapter(AIService):
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        if not settings.GOOGLE_API_KEY:
            raise RuntimeError("GOOGLE_API_KEY is not configured")

        start_ms = int(time.monotonic() * 1000)
        url = (
            f"{settings.GEMINI_API_BASE_URL}/models/{self._model_id}:generateContent"
            f"?key={settings.GOOGLE_API_KEY}"
        )
        payload = {
            "systemInstruction": {
                "parts": [{"text": request.system_prompt}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": request.prompt_template}],
                }
            ],
            "generationConfig": {
                "temperature": request.temperature,
                "maxOutputTokens": request.max_tokens,
                "responseMimeType": "application/json",
            },
        }

        # Attempt with retries for transient failures
        last_error = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                body = await self._call_gemini_api(url, payload)
                elapsed_ms = int(time.monotonic() * 1000) - start_ms
                return self._parse_response(body, elapsed_ms)

            except httpx.HTTPStatusError as e:
                last_error = e
                should_retry = e.response.status_code in RETRYABLE_STATUS_CODES
                if should_retry and attempt < MAX_RETRIES:
                    delay_ms = RETRY_DELAY_MS * (attempt + 1)
                    logger.warning(
                        "gemini.retry",
                        attempt=attempt + 1,
                        status_code=e.response.status_code,
                        delay_ms=delay_ms,
                        model=self._model_id,
                    )
                    await asyncio.sleep(delay_ms / 1000.0)
                else:
                    # No retry or non-retryable error
                    elapsed_ms = int(time.monotonic() * 1000) - start_ms
                    if should_retry:
                        # Max retries exceeded for this transient error
                        logger.error(
                            "gemini.max_retries_exceeded",
                            status_code=e.response.status_code,
                            attempts=attempt + 1,
                            elapsed_ms=elapsed_ms,
                            model=self._model_id,
                        )
                        raise RuntimeError("Max retries exceeded for Gemini API") from e
                    else:
                        # Non-retryable error
                        logger.error(
                            "gemini.http_error",
                            status_code=e.response.status_code,
                            elapsed_ms=elapsed_ms,
                            model=self._model_id,
                        )
                        raise

            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                last_error = e
                elapsed_ms = int(time.monotonic() * 1000) - start_ms
                logger.error(
                    "gemini.connection_error",
                    error_type=type(e).__name__,
                    elapsed_ms=elapsed_ms,
                    model=self._model_id,
                )
                raise RuntimeError(f"Failed to connect to Gemini API: {type(e).__name__}") from e

            except Exception as e:
                elapsed_ms = int(time.monotonic() * 1000) - start_ms
                logger.error(
                    "gemini.unexpected_error",
                    error_type=type(e).__name__,
                    elapsed_ms=elapsed_ms,
                    model=self._model_id,
                )
                raise

    async def _call_gemini_api(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Call Gemini API with timeout handling."""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                body = response.json()
                return body
        except httpx.HTTPStatusError as e:
            # Attempt to extract error details for logging (sanitized)
            try:
                error_body = e.response.json()
                logger.error(
                    "gemini.api_error_details",
                    status_code=e.response.status_code,
                    error_message=error_body.get("error", {}).get("message", "unknown"),
                )
            except Exception:
                # If response is not JSON, log just the status
                logger.error(
                    "gemini.api_error_no_details",
                    status_code=e.response.status_code,
                )
            raise

    def _parse_response(self, body: dict[str, Any], elapsed_ms: int) -> AIAnalysisResponse:
        """Parse Gemini API response and validate it."""
        # Validate structure
        candidates = body.get("candidates", [])
        if not candidates:
            logger.error(
                "gemini.empty_candidates",
                elapsed_ms=elapsed_ms,
                model=self._model_id,
            )
            raise RuntimeError("Gemini API returned no candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            logger.error(
                "gemini.empty_parts",
                elapsed_ms=elapsed_ms,
                model=self._model_id,
            )
            raise RuntimeError("Gemini API returned empty content parts")

        # Extract text content
        content = "\n".join(part.get("text", "") for part in parts if part.get("text"))
        if not content or not content.strip():
            logger.error(
                "gemini.empty_content",
                elapsed_ms=elapsed_ms,
                model=self._model_id,
            )
            raise RuntimeError("Gemini API returned empty text content")

        # Parse usage metadata
        usage = body.get("usageMetadata", {})
        if not usage:
            logger.warning(
                "gemini.missing_usage_metadata",
                elapsed_ms=elapsed_ms,
                model=self._model_id,
            )

        input_tokens = int(usage.get("promptTokenCount", 0) or 0)
        output_tokens = int(usage.get("candidatesTokenCount", 0) or 0)

        logger.info(
            "gemini.response",
            model=self._model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            elapsed_ms=elapsed_ms,
        )

        return AIAnalysisResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=elapsed_ms,
        )
