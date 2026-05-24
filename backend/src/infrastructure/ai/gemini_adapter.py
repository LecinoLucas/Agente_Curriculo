import asyncio
import io
import json
import random
import re
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
import structlog

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.application.services.ai_provider_credential_service import (
    AIRuntimeCredential,
    AIProviderCredentialService,
)
from src.core.log_sanitizer import sanitize_log_text, sanitize_url
from src.core.settings import settings
from src.infrastructure.cache.redis_client import get_redis

logger = structlog.get_logger(__name__)

RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

BASE_RETRY_DELAY_MS = 800

HTTP_TIMEOUT_SECONDS = 20.0
MAX_RESPONSE_CHARS = 20_000
RATE_LIMIT_DELAY_MULTIPLIER = 2
_DISTRIBUTED_LOCK_UNAVAILABLE_REASONS = (
    "session_unavailable_or_loop_mismatch",
    "redis_unreachable",
)
_THINKING_BUDGET_DISABLED = 0


class GeminiResponseFormatError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        finish_reason: str | None = None,
        raw_response: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        processing_time_ms: int | None = None,
    ) -> None:
        super().__init__(message)
        self.finish_reason = finish_reason
        self.raw_response = raw_response
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.processing_time_ms = processing_time_ms


class AIProviderRateLimitedError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        provider: str,
        model_id: str,
        retry_after_seconds: float,
        cooldown_until: datetime,
        status_code: int = 429,
        provider_error_type: str = "rate_limited",
        configured_key_count: int | None = None,
        available_key_count: int | None = None,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.model_id = model_id
        self.retry_after_seconds = retry_after_seconds
        self.cooldown_until = cooldown_until
        self.status_code = status_code
        self.provider_error_type = provider_error_type
        self.configured_key_count = configured_key_count
        self.available_key_count = available_key_count


def _safe_float_setting(value: Any, default: float) -> float:
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _safe_int_setting(value: Any, default: int) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return default
    return default


def _sanitize_http_status_error(error: httpx.HTTPStatusError) -> httpx.HTTPStatusError:
    request = error.request
    response = error.response
    sanitized_request = httpx.Request(
        request.method,
        sanitize_url(str(request.url)),
        headers={
            key: value
            for key, value in request.headers.items()
            if key.lower() not in {"authorization", "x-goog-api-key"}
        },
    )
    # Use stream= to avoid automatic content decoding which can fail for malformed responses
    content_stream = io.BytesIO(response.content) if response.content else io.BytesIO(b"")
    content_stream.seek(0)  # Ensure stream is at the beginning
    sanitized_response = httpx.Response(
        response.status_code,
        headers=response.headers,
        stream=content_stream,
        request=sanitized_request,
        extensions=response.extensions,
    )
    return httpx.HTTPStatusError(
        sanitize_log_text(str(error)) or f"HTTP {response.status_code} from Gemini API",
        request=sanitized_request,
        response=sanitized_response,
    )

_ACQUIRE_SLOT_LUA = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])

local current = tonumber(redis.call("GET", key) or "0")
if current >= limit then
    return -1
end

current = redis.call("INCR", key)
if current == 1 then
    redis.call("PEXPIRE", key, ttl_ms)
end

return current
"""

_RELEASE_SLOT_LUA = """
local key = KEYS[1]
local current = tonumber(redis.call("GET", key) or "0")
if current <= 1 then
    redis.call("DEL", key)
    return 0
end

return redis.call("DECR", key)
"""

_LOCAL_GEMINI_SEMAPHORE = asyncio.Semaphore(
    max(1, settings.GEMINI_MAX_CONCURRENT_REQUESTS)
)
_GEMINI_KEY_COOLDOWNS: dict[int, float] = {}
_GEMINI_INVALID_KEYS: set[int] = set()


def _get_google_api_keys() -> list[str]:
    return list(settings.google_api_keys)


async def _get_google_runtime_credentials(model_id: str) -> tuple[list[AIRuntimeCredential], int]:
    try:
        credentials = await AIProviderCredentialService.load_available_runtime_credentials(
            provider="google",
            model_id=model_id,
        )
        configured_count = await AIProviderCredentialService.count_runtime_matching_credentials(
            provider="google",
            model_id=model_id,
        )
    except Exception as exc:
        if settings.is_production:
            raise
        logger.warning(
            "gemini.credentials_db_unavailable_falling_back_to_env",
            model=model_id,
            error_type=type(exc).__name__,
        )
        credentials = []
        configured_count = 0

    if credentials or configured_count > 0:
        return credentials, configured_count

    if settings.APP_ENV == "development":
        env_credentials = [
            AIRuntimeCredential(
                id=None,
                provider="google",
                model_id=model_id,
                label=_key_label(index),
                api_key=api_key,
                key_last4=api_key[-4:],
                is_persisted=False,
            )
            for index, api_key in enumerate(_get_google_api_keys())
        ]
        return env_credentials, len(env_credentials)

    return [], 0


def _key_label(index: int) -> str:
    return f"key_{index + 1}"


def _runtime_api_key(credential: str | AIRuntimeCredential) -> str:
    return credential if isinstance(credential, str) else credential.api_key


def _runtime_key_label(credential: str | AIRuntimeCredential, index: int) -> str:
    return _key_label(index) if isinstance(credential, str) else credential.label


def _runtime_credential_id(credential: str | AIRuntimeCredential):
    return None if isinstance(credential, str) else credential.id


def _runtime_is_persisted(credential: str | AIRuntimeCredential) -> bool:
    return not isinstance(credential, str) and credential.is_persisted and credential.id is not None


def _build_gemini_url(model_id: str, api_key: str) -> str:
    return (
        f"{settings.GEMINI_API_BASE_URL}/models/{model_id}:generateContent"
        f"?key={api_key}"
    )


def _cooldown_seconds_for_key(index: int, *, now: float | None = None) -> float:
    current = time.monotonic() if now is None else now
    cooldown_until = _GEMINI_KEY_COOLDOWNS.get(index)
    if cooldown_until is None:
        return 0.0
    remaining = cooldown_until - current
    if remaining <= 0:
        _GEMINI_KEY_COOLDOWNS.pop(index, None)
        return 0.0
    return remaining


def _is_invalid_key_error(error: httpx.HTTPStatusError) -> bool:
    if error.response.status_code != 400:
        return False
    # Extract error message from response body to check if it's an invalid key error
    try:
        payload = error.response.json()
        if isinstance(payload, dict):
            msg = payload.get("error", {})
            if isinstance(msg, dict):
                message = msg.get("message", "")
            else:
                message = str(msg)
        else:
            message = ""
    except Exception:
        message = ""

    message_lower = message.lower()
    return ("api key not valid" in message_lower or
            "invalid api key" in message_lower or
            "all configured gemini api keys are invalid" in message_lower)


def get_gemini_key_health() -> dict[str, Any]:
    keys = _get_google_api_keys()
    now = time.monotonic()
    cooldowns = [
        {
            "key_label": _key_label(index),
            "retry_after_seconds": int(_cooldown_seconds_for_key(index, now=now) + 0.999),
        }
        for index in range(len(keys))
        if _cooldown_seconds_for_key(index, now=now) > 0
    ]
    cooldown_count = len(cooldowns)
    invalid_key_count = len(_GEMINI_INVALID_KEYS)
    available_count = max(0, len(keys) - cooldown_count - invalid_key_count)
    return {
        "configured_key_count": len(keys),
        "available_key_count": available_count,
        "cooldown_key_count": cooldown_count,
        "cooldowns": cooldowns,
        "invalid_key_count": invalid_key_count,
        "invalid_keys": [_key_label(i) for i in sorted(_GEMINI_INVALID_KEYS)],
    }


def _build_all_keys_rate_limited_error(model_id: str, retry_after_seconds: float) -> httpx.HTTPStatusError:
    sanitized_url = sanitize_url(_build_gemini_url(model_id, "[REDACTED]"))
    response = httpx.Response(
        status_code=429,
        headers={"retry-after": str(max(1, int(retry_after_seconds + 0.999)))},
        json={"error": {"message": "All configured Gemini API keys are in rate-limit cooldown."}},
        request=httpx.Request("POST", sanitized_url),
    )
    return httpx.HTTPStatusError(
        "All configured Gemini API keys are in rate-limit cooldown.",
        request=response.request,
        response=response,
    )


def _build_provider_rate_limited_error(
    *,
    model_id: str,
    retry_after_seconds: float,
    configured_key_count: int,
    available_key_count: int = 0,
) -> AIProviderRateLimitedError:
    retry_seconds = max(1.0, float(retry_after_seconds))
    return AIProviderRateLimitedError(
        "All configured Gemini API keys are in rate-limit cooldown.",
        provider="google",
        model_id=model_id,
        retry_after_seconds=retry_seconds,
        cooldown_until=datetime.now(UTC) + timedelta(seconds=retry_seconds),
        status_code=429,
        provider_error_type="rate_limited",
        configured_key_count=configured_key_count,
        available_key_count=available_key_count,
    )


def _build_all_keys_invalid_error(model_id: str) -> httpx.HTTPStatusError:
    sanitized_url = sanitize_url(_build_gemini_url(model_id, "[REDACTED]"))
    response = httpx.Response(
        status_code=400,
        json={"error": {"message": "All configured Gemini API keys are invalid."}},
        request=httpx.Request("POST", sanitized_url),
    )
    return httpx.HTTPStatusError(
        "All configured Gemini API keys are invalid.",
        request=response.request,
        response=response,
    )


class GeminiAdapter(AIService):
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                timeout=HTTP_TIMEOUT_SECONDS,
                connect=5.0,
                read=HTTP_TIMEOUT_SECONDS,
                write=10.0,
                pool=5.0,
            )
        )

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        credentials, configured_key_count = await _get_google_runtime_credentials(self._model_id)
        if not credentials:
            if configured_key_count > 0:
                raise _build_provider_rate_limited_error(
                    model_id=self._model_id,
                    retry_after_seconds=float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS),
                    configured_key_count=configured_key_count,
                    available_key_count=0,
                )
            raise RuntimeError("No Gemini credentials configured")

        start_ms = int(time.monotonic() * 1000)
        queue_name = request.queue_name or "unknown"
        timeout_seconds = max(
            1.0,
            _safe_float_setting(
                getattr(settings, "AI_PROVIDER_TIMEOUT_SECONDS", 90.0),
                90.0,
            ),
        )

        payload = self._build_payload(request)

        logger.info(
            "gemini.request_started",
            model=self._model_id,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            timeout_seconds=timeout_seconds,
            system_prompt_chars=len(request.system_prompt or ""),
            user_prompt_chars=len(request.prompt_template or ""),
            queue_name=queue_name,
        )

        try:
            return await self._run_with_concurrency_limit(
                queue_name=queue_name,
                run_call=lambda: asyncio.wait_for(
                    self._analyze_with_key_failover(
                        api_keys=credentials,
                        configured_key_count=configured_key_count,
                        payload=payload,
                        start_ms=start_ms,
                        queue_name=queue_name,
                    ),
                    timeout=timeout_seconds,
                ),
            )

        except asyncio.TimeoutError as e:
            elapsed_ms = int(time.monotonic() * 1000) - start_ms

            logger.error(
                "gemini.global_timeout",
                model=self._model_id,
                elapsed_ms=elapsed_ms,
                timeout_seconds=timeout_seconds,
                queue_name=queue_name,
            )

            raise RuntimeError("Gemini analysis timed out") from e

    async def close(self) -> None:
        if not self._client.is_closed:
            await self._client.aclose()

    async def __aenter__(self) -> "GeminiAdapter":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.close()

    def _build_payload(self, request: AIAnalysisRequest) -> dict[str, Any]:
        generation_config: dict[str, Any] = {
            "temperature": request.temperature,
            "maxOutputTokens": request.max_tokens,
            "responseMimeType": "application/json",
        }

        # Gemini 2.5 Flash enables dynamic thinking by default. For compact JSON
        # extraction, that burns tokens before the object is closed.
        if self._model_id.startswith("gemini-2.5"):
            generation_config["thinkingConfig"] = {
                "thinkingBudget": _THINKING_BUDGET_DISABLED,
            }

        return {
            "systemInstruction": {
                "parts": [{"text": request.system_prompt}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": request.prompt_template}],
                }
            ],
            "generationConfig": generation_config,
        }

    async def _analyze_with_key_failover(
        self,
        *,
        api_keys: list[str | AIRuntimeCredential],
        payload: dict[str, Any],
        start_ms: int,
        queue_name: str,
        configured_key_count: int | None = None,
    ) -> AIAnalysisResponse:
        last_rate_limit_error: httpx.HTTPStatusError | None = None
        last_invalid_key_error: httpx.HTTPStatusError | None = None
        skipped_cooldowns: list[float] = []

        effective_configured_count = configured_key_count if configured_key_count is not None else len(api_keys)

        for index, credential in enumerate(api_keys):
            credential_id = _runtime_credential_id(credential)
            key_label = _runtime_key_label(credential, index)
            if not _runtime_is_persisted(credential) and index in _GEMINI_INVALID_KEYS:
                logger.error(
                    "gemini.key_skipped_invalid",
                    model=self._model_id,
                    key_label=key_label,
                    queue_name=queue_name,
                )
                continue

            remaining_cooldown = 0.0 if _runtime_is_persisted(credential) else _cooldown_seconds_for_key(index)
            if remaining_cooldown > 0:
                skipped_cooldowns.append(remaining_cooldown)
                logger.warning(
                    "gemini.key_skipped_cooldown",
                    model=self._model_id,
                    key_label=key_label,
                    retry_after_seconds=int(remaining_cooldown + 0.999),
                    queue_name=queue_name,
                )
                continue

            try:
                response = await self._analyze_with_retries(
                    url=_build_gemini_url(self._model_id, _runtime_api_key(credential)),
                    payload=payload,
                    start_ms=start_ms,
                    queue_name=queue_name,
                    key_label=key_label,
                )
                if credential_id is not None:
                    await self._mark_credential_used(credential_id)
                if index > 0:
                    logger.warning(
                        "gemini.key_failover_success",
                        model=self._model_id,
                        key_label=key_label,
                        queue_name=queue_name,
                    )
                return response

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    last_rate_limit_error = exc
                    retry_after_seconds = self._extract_retry_after_seconds(exc.response)
                    cooldown_seconds = (
                        retry_after_seconds
                        if retry_after_seconds is not None
                        else float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS)
                    )
                    cooldown_until = datetime.now(UTC) + timedelta(seconds=max(1.0, float(cooldown_seconds)))
                    if credential_id is not None:
                        await self._mark_credential_rate_limited(
                            credential_id,
                            cooldown_until=cooldown_until,
                        )
                    else:
                        _GEMINI_KEY_COOLDOWNS[index] = time.monotonic() + cooldown_seconds
                    logger.warning(
                        "ai_provider.key_rate_limited",
                        provider="google",
                        model=self._model_id,
                        key_label=key_label,
                        retry_after_seconds=retry_after_seconds,
                        cooldown_seconds=int(cooldown_seconds + 0.999),
                        fallback_available=index + 1 < len(api_keys),
                        queue_name=queue_name,
                    )
                elif _is_invalid_key_error(exc):
                    if credential_id is not None:
                        await self._mark_credential_invalid(credential_id)
                    else:
                        _GEMINI_INVALID_KEYS.add(index)
                    last_invalid_key_error = exc
                    logger.error(
                        "gemini.key_invalid",
                        model=self._model_id,
                        key_label=key_label,
                        fallback_available=index + 1 < len(api_keys),
                        queue_name=queue_name,
                    )
                else:
                    raise

        if last_invalid_key_error is not None and last_rate_limit_error is None:
            logger.error(
                "gemini.keys_exhausted_invalid",
                model=self._model_id,
                configured_key_count=effective_configured_count,
                queue_name=queue_name,
            )
            raise _build_all_keys_invalid_error(self._model_id)

        if last_rate_limit_error is not None:
            retry_after_seconds = self._extract_retry_after_seconds(last_rate_limit_error.response)
            if retry_after_seconds is None and skipped_cooldowns:
                retry_after_seconds = min(skipped_cooldowns)
            if retry_after_seconds is None:
                retry_after_seconds = float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS)
            logger.error(
                "gemini.keys_exhausted_rate_limited",
                model=self._model_id,
                configured_key_count=effective_configured_count,
                available_key_count=0,
                retry_after_seconds=int(float(retry_after_seconds) + 0.999),
                queue_name=queue_name,
            )
            raise _build_provider_rate_limited_error(
                model_id=self._model_id,
                retry_after_seconds=float(retry_after_seconds),
                configured_key_count=effective_configured_count,
                available_key_count=0,
            ) from last_rate_limit_error

        next_retry_seconds = min(skipped_cooldowns) if skipped_cooldowns else float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS)
        logger.error(
            "ai_provider.all_keys_in_cooldown",
            provider="google",
            model=self._model_id,
            configured_key_count=effective_configured_count,
            retry_after_seconds=int(next_retry_seconds + 0.999),
            queue_name=queue_name,
        )
        raise _build_provider_rate_limited_error(
            model_id=self._model_id,
            retry_after_seconds=next_retry_seconds,
            configured_key_count=effective_configured_count,
            available_key_count=0,
        )

    async def _mark_credential_rate_limited(self, credential_id, *, cooldown_until: datetime) -> None:
        try:
            await AIProviderCredentialService.mark_runtime_rate_limited(
                credential_id,
                cooldown_until=cooldown_until,
                error_type="rate_limited",
            )
        except Exception as exc:
            logger.warning(
                "gemini.credential_rate_limit_persist_skipped",
                model=self._model_id,
                error_type=type(exc).__name__,
            )

    async def _mark_credential_invalid(self, credential_id) -> None:
        try:
            await AIProviderCredentialService.mark_runtime_invalid(
                credential_id,
                error_type="invalid_api_key",
            )
        except Exception as exc:
            logger.warning(
                "gemini.credential_invalid_persist_skipped",
                model=self._model_id,
                error_type=type(exc).__name__,
            )

    async def _mark_credential_used(self, credential_id) -> None:
        try:
            await AIProviderCredentialService.mark_runtime_used(credential_id)
        except Exception as exc:
            logger.warning(
                "gemini.credential_used_persist_skipped",
                model=self._model_id,
                error_type=type(exc).__name__,
            )

    async def _analyze_with_retries(
        self,
        *,
        url: str,
        payload: dict[str, Any],
        start_ms: int,
        queue_name: str,
        key_label: str | None = None,
    ) -> AIAnalysisResponse:
        last_error: Exception | None = None
        max_retries = 0

        for attempt in range(max_retries + 1):
            elapsed_ms = int(time.monotonic() * 1000) - start_ms
            logger.info(
                "gemini.retry_attempt",
                model=self._model_id,
                attempt=attempt + 1,
                max_attempts=max_retries + 1,
                elapsed_ms=elapsed_ms,
                queue_name=queue_name,
                key_label=key_label,
            )
            try:
                body = await self._call_gemini_api(url=url, payload=payload)

                elapsed_ms = int(time.monotonic() * 1000) - start_ms

                return self._parse_response(
                    body=body,
                    elapsed_ms=elapsed_ms,
                )

            except httpx.HTTPStatusError as e:
                last_error = e
                status_code = e.response.status_code
                should_retry = status_code in RETRYABLE_STATUS_CODES
                elapsed_ms = int(time.monotonic() * 1000) - start_ms
                retry_after_seconds = self._extract_retry_after_seconds(e.response)

                if status_code == 429:
                    logger.error(
                        "gemini.final_failure_429",
                        model=self._model_id,
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        elapsed_ms=elapsed_ms,
                        retry_after_seconds=retry_after_seconds,
                        queue_name=queue_name,
                        key_label=key_label,
                    )

                logger.error(
                    "gemini.http_error_final",
                    model=self._model_id,
                    status_code=status_code,
                    retryable=should_retry,
                    attempts=attempt + 1,
                    elapsed_ms=elapsed_ms,
                    queue_name=queue_name,
                    key_label=key_label,
                )

                raise e

            except (
                httpx.ConnectError,
                httpx.ReadTimeout,
                httpx.ConnectTimeout,
                httpx.PoolTimeout,
            ) as e:
                last_error = e
                elapsed_ms = int(time.monotonic() * 1000) - start_ms

                logger.error(
                    "gemini.connection_error_final",
                    model=self._model_id,
                    error_type=type(e).__name__,
                    attempts=attempt + 1,
                    elapsed_ms=elapsed_ms,
                    queue_name=queue_name,
                )

                raise e

            except RuntimeError:
                raise

            except Exception as e:
                last_error = e
                elapsed_ms = int(time.monotonic() * 1000) - start_ms

                logger.error(
                    "gemini.unexpected_error",
                    model=self._model_id,
                    error_type=type(e).__name__,
                    attempts=attempt + 1,
                    elapsed_ms=elapsed_ms,
                    queue_name=queue_name,
                )

                raise RuntimeError(
                    f"Unexpected Gemini adapter error: {type(e).__name__}"
                ) from e

        raise RuntimeError("Gemini analysis failed") from last_error

    async def _call_gemini_api(
        self,
        *,
        url: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        response = await self._client.post(url, json=payload)

        if response.status_code >= 400:
            self._log_api_error_details(response)

        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise _sanitize_http_status_error(exc) from None

        try:
            body = response.json()
            logger.info(
                "gemini.api_response_body",
                model=self._model_id,
                body_keys=list(body.keys()),
                body_chars=len(response.text or ""),
            )
            return body
        except json.JSONDecodeError as e:
            logger.error(
                "gemini.invalid_api_json",
                model=self._model_id,
                response_chars=len(response.text or ""),
            )
            raise RuntimeError("Gemini API returned invalid JSON body") from e

    def _parse_response(
        self,
        *,
        body: dict[str, Any],
        elapsed_ms: int,
    ) -> AIAnalysisResponse:
        content = self._extract_content(body=body, elapsed_ms=elapsed_ms)
        finish_reason = self._get_finish_reason(body)
        usage = body.get("usageMetadata") or {}
        input_tokens = int(usage.get("promptTokenCount", 0) or 0)
        output_tokens = int(usage.get("candidatesTokenCount", 0) or 0)

        if len(content) > MAX_RESPONSE_CHARS:
            logger.error(
                "gemini.response_too_large",
                model=self._model_id,
                content_chars=len(content),
                max_response_chars=MAX_RESPONSE_CHARS,
                elapsed_ms=elapsed_ms,
            )
            raise GeminiResponseFormatError(
                "Gemini model response is too large",
                finish_reason=finish_reason,
                raw_response=content[:MAX_RESPONSE_CHARS],
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                processing_time_ms=elapsed_ms,
            )

        try:
            parsed = self._safe_parse_json(
                content,
                finish_reason=finish_reason,
            )
        except RuntimeError as exc:
            raise GeminiResponseFormatError(
                str(exc),
                finish_reason=finish_reason,
                raw_response=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                processing_time_ms=elapsed_ms,
            ) from exc

        logger.info(
            "gemini.response_success",
            model=self._model_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            elapsed_ms=elapsed_ms,
            finish_reason=finish_reason,
            content_chars=len(content),
        )

        return AIAnalysisResponse(
            content=json.dumps(parsed, ensure_ascii=False),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=0,
            cache_write_tokens=0,
            processing_time_ms=elapsed_ms,
            finish_reason=finish_reason,
        )

    def _extract_content(
        self,
        *,
        body: dict[str, Any],
        elapsed_ms: int,
    ) -> str:
        candidates = body.get("candidates") or []

        if not candidates:
            logger.error(
                "gemini.empty_candidates",
                model=self._model_id,
                elapsed_ms=elapsed_ms,
            )
            raise RuntimeError("Gemini API returned no candidates")

        first_candidate = candidates[0]

        finish_reason = first_candidate.get("finishReason")

        if finish_reason and finish_reason not in {"STOP", "MAX_TOKENS"}:
            logger.warning(
                "gemini.non_standard_finish_reason",
                model=self._model_id,
                finish_reason=finish_reason,
                elapsed_ms=elapsed_ms,
            )

        parts = first_candidate.get("content", {}).get("parts") or []

        if not parts:
            if finish_reason in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"}:
                logger.error(
                    "gemini.content_blocked_by_finish_reason",
                    model=self._model_id,
                    finish_reason=finish_reason,
                    elapsed_ms=elapsed_ms,
                )
                raise RuntimeError(
                    f"Gemini content blocked or unavailable (finishReason={finish_reason})"
                )
            logger.error(
                "gemini.empty_parts",
                model=self._model_id,
                finish_reason=finish_reason,
                elapsed_ms=elapsed_ms,
            )
            raise RuntimeError("Gemini API returned empty content parts")

        content = "\n".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict) and part.get("text")
        ).strip()

        if not content:
            if finish_reason in {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"}:
                logger.error(
                    "gemini.empty_content_blocked_by_finish_reason",
                    model=self._model_id,
                    finish_reason=finish_reason,
                    elapsed_ms=elapsed_ms,
                )
                raise RuntimeError(
                    f"Gemini content blocked or unavailable (finishReason={finish_reason})"
                )
            logger.error(
                "gemini.empty_content",
                model=self._model_id,
                finish_reason=finish_reason,
                elapsed_ms=elapsed_ms,
            )
            raise RuntimeError("Gemini API returned empty text content")

        logger.info(
            "gemini.content_extracted",
            model=self._model_id,
            content_length=len(content),
            parts_count=len(parts),
            finish_reason=finish_reason,
        )

        return content

    def _safe_parse_json(
        self,
        content: str,
        *,
        finish_reason: str | None = None,
    ) -> dict[str, Any]:
        cleaned = self._strip_markdown_json_fence(content)

        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            self._log_json_parse_failure(
                content=content,
                cleaned=cleaned,
                finish_reason=finish_reason,
            )
            parsed = self._extract_json_object(
                cleaned,
                finish_reason=finish_reason,
            )

        if not isinstance(parsed, dict):
            logger.error(
                "gemini.model_json_not_object",
                model=self._model_id,
                parsed_type=type(parsed).__name__,
            )
            raise RuntimeError("Gemini model JSON response must be an object")

        return parsed

    def _strip_markdown_json_fence(self, content: str) -> str:
        cleaned = content.strip()

        fence_match = re.search(
            r"```(?:json)?\s*(.*?)\s*```",
            cleaned,
            re.DOTALL | re.IGNORECASE,
        )

        if fence_match:
            return fence_match.group(1).strip()

        return cleaned

    def _extract_json_object(
        self,
        content: str,
        *,
        finish_reason: str | None = None,
    ) -> dict[str, Any]:
        start_positions = [
            match.start()
            for match in re.finditer(r"\{", content)
        ]

        if not start_positions:
            logger.error(
                "gemini.no_json_start_brace",
                model=self._model_id,
                finish_reason=finish_reason,
                **self._get_content_log_fields(content),
                content_length=len(content),
            )
            if finish_reason == "MAX_TOKENS":
                raise RuntimeError(
                    "Gemini model output was truncated (finishReason=MAX_TOKENS) "
                    "before emitting a complete JSON object."
                )
            raise RuntimeError("Gemini model returned invalid JSON content")

        for start in start_positions:
            depth = 0
            in_string = False
            escape = False

            for i, ch in enumerate(content[start:], start):
                if escape:
                    escape = False
                    continue

                if ch == "\\":
                    escape = True
                    continue

                if ch == '"':
                    in_string = not in_string
                    continue

                if in_string:
                    continue

                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1

                    if depth == 0:
                        candidate = content[start : i + 1]

                        try:
                            parsed = json.loads(candidate)
                        except json.JSONDecodeError:
                            continue

                        if isinstance(parsed, dict):
                            return parsed

                        logger.warning(
                            "gemini.extracted_json_not_object",
                            model=self._model_id,
                            parsed_type=type(parsed).__name__,
                        )

                        continue

        logger.error(
            "gemini.invalid_model_json",
            model=self._model_id,
            finish_reason=finish_reason,
            **self._get_content_log_fields(content),
            content_length=len(content),
        )
        if finish_reason == "MAX_TOKENS":
            raise RuntimeError(
                "Gemini model output was truncated (finishReason=MAX_TOKENS) "
                "and did not contain valid JSON."
            )
        raise RuntimeError("Gemini model returned invalid JSON content")

    def _log_json_parse_failure(
        self,
        *,
        content: str,
        cleaned: str,
        finish_reason: str | None,
        ) -> None:
        log_fields = self._get_content_log_fields(content)

        logger.error(
            "gemini.json_decode_failed_raw_content",
            model=self._model_id,
            finish_reason=finish_reason,
            **log_fields,
            content_length=len(content),
            cleaned_content_length=len(cleaned),
            cleaned_content_chars=len(cleaned),
        )

    def _get_content_log_fields(self, content: str) -> dict[str, str]:
        return {"content_chars": str(len(content or ""))}

    def _get_finish_reason(self, body: dict[str, Any]) -> str | None:
        candidates = body.get("candidates") or []
        if not candidates:
            return None
        return candidates[0].get("finishReason")

    async def _run_with_concurrency_limit(
        self,
        *,
        queue_name: str,
        run_call,
    ) -> AIAnalysisResponse:
        wait_timeout_seconds = max(
            1.0,
            _safe_float_setting(
                getattr(settings, "GEMINI_CONCURRENCY_WAIT_TIMEOUT_SECONDS", 30.0),
                30.0,
            ),
        )

        await asyncio.wait_for(
            _LOCAL_GEMINI_SEMAPHORE.acquire(),
            timeout=wait_timeout_seconds,
        )

        lock_key = self._build_concurrency_key()
        slot_token = str(uuid4())
        distributed_slot_acquired = False

        try:
            if self._is_distributed_concurrency_enabled():
                try:
                    await self._acquire_distributed_slot(
                        lock_key=lock_key,
                        slot_token=slot_token,
                        queue_name=queue_name,
                    )
                    distributed_slot_acquired = True
                except Exception:
                    logger.warning(
                        "gemini.distributed_slot_unavailable",
                        model=self._model_id,
                        queue_name=queue_name,
                        reason=_DISTRIBUTED_LOCK_UNAVAILABLE_REASONS[1],
                    )
            return await run_call()
        finally:
            try:
                if distributed_slot_acquired:
                    await self._release_distributed_slot(lock_key=lock_key)
            finally:
                _LOCAL_GEMINI_SEMAPHORE.release()

    def _is_distributed_concurrency_enabled(self) -> bool:
        raw = getattr(settings, "GEMINI_DISTRIBUTED_CONCURRENCY_ENABLED", False)
        if isinstance(raw, bool):
            return raw
        if isinstance(raw, (int, float)):
            return raw != 0
        if isinstance(raw, str):
            return raw.strip().lower() in {"1", "true", "yes", "on"}
        return False

    def _build_concurrency_key(self) -> str:
        return f"gemini:inflight:{self._model_id}"

    async def _acquire_distributed_slot(
        self,
        *,
        lock_key: str,
        slot_token: str,
        queue_name: str,
    ) -> None:
        limit = max(
            1,
            _safe_int_setting(
                getattr(settings, "GEMINI_MAX_CONCURRENT_REQUESTS", 2),
                2,
            ),
        )
        ttl_seconds = max(
            1,
            _safe_int_setting(
                getattr(settings, "GEMINI_CONCURRENCY_SLOT_TTL_SECONDS", 300),
                300,
            ),
        )
        ttl_ms = max(5_000, int(ttl_seconds * 1000))
        retry_interval_seconds = max(
            0.05,
            _safe_float_setting(
                getattr(settings, "GEMINI_CONCURRENCY_RETRY_INTERVAL_MS", 200),
                200.0,
            )
            / 1000,
        )
        wait_timeout_seconds = max(
            1.0,
            _safe_float_setting(
                getattr(settings, "GEMINI_CONCURRENCY_WAIT_TIMEOUT_SECONDS", 30.0),
                30.0,
            ),
        )
        deadline = time.monotonic() + wait_timeout_seconds

        while True:
            remaining_seconds = deadline - time.monotonic()
            if remaining_seconds <= 0:
                raise RuntimeError(
                    "Timed out waiting for Gemini concurrency slot"
                )

            redis = await get_redis()

            try:
                acquired_count = await redis.eval(
                    _ACQUIRE_SLOT_LUA,
                    1,
                    lock_key,
                    limit,
                    ttl_ms,
                )
            finally:
                await redis.aclose()

            if int(acquired_count) >= 0:
                logger.info(
                    "gemini.concurrency_slot_acquired",
                    model=self._model_id,
                    queue_name=queue_name,
                    slot_token=slot_token,
                    inflight=int(acquired_count),
                    inflight_limit=limit,
                )
                return

            await asyncio.sleep(min(retry_interval_seconds, remaining_seconds))

    async def _release_distributed_slot(self, *, lock_key: str) -> None:
        redis = await get_redis()
        try:
            await redis.eval(
                _RELEASE_SLOT_LUA,
                1,
                lock_key,
            )
        finally:
            await redis.aclose()

    def _calculate_retry_delay_ms(
        self,
        attempt: int,
        *,
        is_rate_limit: bool = False,
        retry_after_seconds: float | None = None,
    ) -> int:
        exponential_delay = BASE_RETRY_DELAY_MS * (2**attempt)
        jitter = random.randint(0, 500)
        delay_ms = exponential_delay + jitter

        if is_rate_limit:
            delay_ms *= RATE_LIMIT_DELAY_MULTIPLIER

        if retry_after_seconds is not None:
            delay_ms = max(delay_ms, int(retry_after_seconds * 1000))

        return delay_ms

    def _extract_retry_after_seconds(self, response: httpx.Response) -> float | None:
        retry_after_header = response.headers.get("retry-after")
        if retry_after_header:
            try:
                return max(0.0, float(retry_after_header))
            except ValueError:
                pass

        message = self._extract_error_message(response)
        if not message:
            return None

        retry_in_match = re.search(
            r"retry in\s+([0-9]+(?:\.[0-9]+)?)s",
            message,
            flags=re.IGNORECASE,
        )
        if retry_in_match:
            return float(retry_in_match.group(1))

        return None

    def _extract_error_message(self, response: httpx.Response) -> str | None:
        try:
            payload = response.json()
            if isinstance(payload, dict):
                error_payload = payload.get("error")
                if isinstance(error_payload, dict):
                    message = error_payload.get("message")
                    if isinstance(message, str):
                        return message
        except Exception:
            return None
        return None

    def _log_api_error_details(self, response: httpx.Response) -> None:
        try:
            error_body = response.json()

            error_message = (
                error_body.get("error", {}).get("message")
                if isinstance(error_body, dict)
                else None
            )

            logger.error(
                "gemini.api_error_details",
                model=self._model_id,
                status_code=response.status_code,
                error_message=sanitize_log_text(error_message) or "unknown",
            )

        except Exception:
            logger.error(
                "gemini.api_error_no_details",
                model=self._model_id,
                status_code=response.status_code,
                response_chars=len(response.text or ""),
            )
