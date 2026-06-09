"""Behavioral AI exception classification.

Extracted from BehavioralAIEvaluationService static methods.
Maps provider/runtime exceptions to stable error-type strings used in the DB
and the usage log.
"""
from __future__ import annotations

import httpx

from src.ai_orchestration.behavioral.response_parser import BehavioralAIProviderResponseInvalidError

# Retry back-off per retry count (seconds).
BEHAVIORAL_AI_RETRY_BACKOFF_SECONDS: dict[int, int] = {1: 15, 2: 45, 3: 120}


def classify_provider_error(exc: Exception) -> str:
    """Map a provider-level exception to a stable error-type string."""
    from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError  # lazy import

    if isinstance(exc, AIProviderRateLimitedError):
        return exc.provider_error_type or "rate_limited"
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = int(exc.response.status_code)
        if status_code == 429:
            return "rate_limited"
        if status_code in {400, 401, 403}:
            return "ai_credential_invalid"
        if status_code in {500, 502, 503, 504}:
            return "provider_unavailable"
        return "provider_http_error"
    if isinstance(exc, httpx.TimeoutException):
        return "provider_timeout"
    if isinstance(exc, httpx.ConnectError):
        return "connection_error"
    return "temporary_error"


def is_retryable_provider_error(provider_error_type: str) -> bool:
    """Return True when the error type qualifies for an automatic retry."""
    return provider_error_type in {
        "rate_limited",
        "provider_unavailable",
        "provider_timeout",
        "connection_error",
        "temporary_error",
    }


def classify_unexpected_failure(exc: Exception) -> str:
    """Classify non-provider exceptions that bubble up from the AI pipeline."""
    if isinstance(exc, BehavioralAIProviderResponseInvalidError):
        return "provider_response_invalid"
    message = str(exc).lower()
    if (
        "no gemini credentials configured" in message
        or "no ai credentials configured" in message
    ):
        return "no_ai_credential_available"
    if "timeout" in message or "timed out" in message:
        return "provider_timeout"
    if "api key" in message or "credential" in message or "credentials" in message:
        return "ai_credential_invalid"
    return "unexpected_error"


def get_provider_status_code(exc: Exception) -> int | None:
    """Extract HTTP status code from provider exceptions, or None."""
    from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError  # lazy import

    if isinstance(exc, AIProviderRateLimitedError):
        return exc.status_code
    if isinstance(exc, httpx.HTTPStatusError):
        return int(exc.response.status_code)
    return None


def get_retry_after_seconds(exc: Exception, *, retry_count: int) -> int:
    """Compute how long to wait before the next retry attempt."""
    from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError  # lazy import

    if isinstance(exc, AIProviderRateLimitedError):
        return max(1, int(exc.retry_after_seconds or 0))
    if isinstance(exc, httpx.HTTPStatusError):
        retry_after = exc.response.headers.get("retry-after")
        if retry_after:
            try:
                return max(1, int(float(retry_after)))
            except ValueError:
                pass
    return BEHAVIORAL_AI_RETRY_BACKOFF_SECONDS.get(retry_count, 300)
