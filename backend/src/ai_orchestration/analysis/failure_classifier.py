import re
from dataclasses import dataclass
from datetime import datetime

import httpx

from src.core.log_sanitizer import sanitize_log_text
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError


@dataclass(slots=True)
class AnalysisFailureDetails:
    finish_reason: str | None = None
    raw_llm_response: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    processing_time_ms: int | None = None
    max_tokens_used: int | None = None
    system_prompt_chars: int | None = None
    user_prompt_chars: int | None = None
    prompt_chars_total: int | None = None
    prompt_version_used: str | None = None
    provider: str | None = None
    model_id: str | None = None
    ai_response_validation_error: str | None = None
    ai_response_validation_fields: list[str] | None = None
    sensitive_output_detected: bool = False


@dataclass(slots=True)
class AnalysisErrorClassification:
    provider_error_type: str
    is_temporary: bool
    status_code: int | None = None
    retry_after_seconds: float | None = None
    cooldown_until: datetime | None = None
    configured_key_count: int | None = None
    available_key_count: int | None = None


class AnalysisExecutionError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        details: AnalysisFailureDetails,
    ) -> None:
        super().__init__(message)
        self.details = details

    @property
    def is_non_retryable(self) -> bool:
        finish_reason = (self.details.finish_reason or "").upper()
        message = str(self).lower()
        return finish_reason == "MAX_TOKENS" or "truncated" in message


def _iter_exception_chain(exc: BaseException) -> list[BaseException]:
    chain: list[BaseException] = []
    current: BaseException | None = exc
    seen: set[int] = set()

    while current is not None and id(current) not in seen:
        chain.append(current)
        seen.add(id(current))
        current = current.__cause__ or current.__context__

    return chain


def _extract_retry_after_from_http_error(error: httpx.HTTPStatusError) -> float | None:
    retry_after = error.response.headers.get("retry-after")
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass

    sanitized_error = sanitize_log_text(str(error)) or ""
    match = re.search(
        r"retry(?:_after_seconds| in)\s*=?\s*([0-9]+(?:\.[0-9]+)?)",
        sanitized_error,
        re.IGNORECASE,
    )
    if match:
        try:
            return max(0.0, float(match.group(1)))
        except ValueError:
            return None

    return None


def extract_rate_limit_retry_after_seconds(error: str) -> float | None:
    sanitized_error = sanitize_log_text(error) or ""
    if "status_code=429" not in sanitized_error:
        return None

    retry_after_match = re.search(r"retry_after_seconds=([0-9]+(?:\.[0-9]+)?)", sanitized_error)
    if retry_after_match:
        try:
            return max(0.0, float(retry_after_match.group(1)))
        except ValueError:
            return None

    from src.core.settings import settings
    cooldown_seconds = max(1, int(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS))
    return float(cooldown_seconds)


def classify_analysis_exception(exc: Exception) -> AnalysisErrorClassification:
    from src.ai_orchestration.analysis.prompt_validator import AnalysisPromptTooLargeError

    if isinstance(exc, AnalysisPromptTooLargeError):
        return AnalysisErrorClassification(
            provider_error_type="prompt_too_large",
            is_temporary=False,
        )

    if isinstance(exc, AnalysisExecutionError) and exc.is_non_retryable:
        return AnalysisErrorClassification(
            provider_error_type="payload_invalid",
            is_temporary=False,
        )

    for current in _iter_exception_chain(exc):
        if isinstance(current, AIProviderRateLimitedError):
            return AnalysisErrorClassification(
                provider_error_type=current.provider_error_type,
                is_temporary=True,
                status_code=current.status_code,
                retry_after_seconds=current.retry_after_seconds,
                cooldown_until=current.cooldown_until,
                configured_key_count=current.configured_key_count,
                available_key_count=current.available_key_count,
            )

        if isinstance(current, httpx.HTTPStatusError):
            status_code = int(current.response.status_code)
            retry_after_seconds = _extract_retry_after_from_http_error(current)

            if status_code == 429:
                return AnalysisErrorClassification(
                    provider_error_type="rate_limited",
                    is_temporary=True,
                    status_code=status_code,
                    retry_after_seconds=retry_after_seconds,
                )
            if status_code in {500, 502, 503, 504}:
                return AnalysisErrorClassification(
                    provider_error_type="provider_unavailable",
                    is_temporary=True,
                    status_code=status_code,
                )
            if status_code == 400:
                msg = ""
                try:
                    payload = current.response.json()
                    if isinstance(payload, dict):
                        msg = (payload.get("error") or {}).get("message") or ""
                except Exception:
                    pass

                if not msg:
                    msg = str(current) or ""

                invalid_key_markers = (
                    "api key not valid",
                    "invalid api key",
                    "all configured gemini api keys are invalid",
                )
                if any(m in msg.lower() for m in invalid_key_markers):
                    return AnalysisErrorClassification(
                        provider_error_type="invalid_api_key",
                        is_temporary=False,
                        status_code=status_code,
                    )
                return AnalysisErrorClassification(
                    provider_error_type="bad_request",
                    is_temporary=False,
                    status_code=status_code,
                )
            if status_code == 401:
                return AnalysisErrorClassification(
                    provider_error_type="unauthorized",
                    is_temporary=False,
                    status_code=status_code,
                )
            if status_code == 403:
                return AnalysisErrorClassification(
                    provider_error_type="forbidden",
                    is_temporary=False,
                    status_code=status_code,
                )
            if status_code == 404:
                return AnalysisErrorClassification(
                    provider_error_type="not_found",
                    is_temporary=False,
                    status_code=status_code,
                )
            return AnalysisErrorClassification(
                provider_error_type="provider_http_error",
                is_temporary=False,
                status_code=status_code,
            )

        if isinstance(
            current,
            TimeoutError | httpx.ReadTimeout | httpx.ConnectTimeout | httpx.PoolTimeout,
        ):
            return AnalysisErrorClassification(
                provider_error_type="timeout",
                is_temporary=True,
            )

        if isinstance(current, httpx.ConnectError):
            return AnalysisErrorClassification(
                provider_error_type="connection_error",
                is_temporary=True,
            )

    message = str(exc).lower()
    payload_error_markers = (
        "failed to parse ai response",
        "invalid json body",
        "response is too large",
        "returned no candidates",
        "without content parts",
        "missing required fields",
        "payload invalid",
        "ai_response_",
    )
    if any(marker in message for marker in payload_error_markers):
        return AnalysisErrorClassification(
            provider_error_type="payload_invalid",
            is_temporary=False,
        )

    if "timed out" in message or "timeout" in message:
        return AnalysisErrorClassification(
            provider_error_type="timeout",
            is_temporary=True,
        )

    return AnalysisErrorClassification(
        provider_error_type="unexpected_error",
        is_temporary=False,
    )
