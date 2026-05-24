import time
from datetime import UTC, datetime, timedelta

import structlog
from anthropic import APIStatusError, AsyncAnthropic, RateLimitError

from src.application.ports.ai_service import AIAnalysisRequest, AIAnalysisResponse, AIService
from src.application.services.ai_provider_credential_service import (
    AIRuntimeCredential,
    AIProviderCredentialService,
)
from src.core.settings import settings
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError

logger = structlog.get_logger(__name__)


class ClaudeAdapter(AIService):
    def __init__(self, model_id: str) -> None:
        self._model_id = model_id

    async def analyze(self, request: AIAnalysisRequest) -> AIAnalysisResponse:
        credentials, configured_key_count = await self._get_runtime_credentials()
        if not credentials:
            if configured_key_count > 0:
                raise self._build_rate_limited_error(
                    retry_after_seconds=float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS),
                    configured_key_count=configured_key_count,
                )
            raise RuntimeError("No Anthropic credentials configured")

        last_rate_limit: Exception | None = None
        for index, credential in enumerate(credentials):
            try:
                response = await self._analyze_with_credential(request, credential)
                if credential.id is not None:
                    await self._mark_credential_used(credential.id)
                if index > 0:
                    logger.warning(
                        "claude.key_failover_success",
                        model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
                        key_label=credential.label,
                    )
                return response
            except RateLimitError as exc:
                last_rate_limit = exc
                retry_after_seconds = self._extract_retry_after_seconds(exc)
                cooldown_seconds = retry_after_seconds or float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS)
                cooldown_until = datetime.now(UTC) + timedelta(seconds=max(1.0, cooldown_seconds))
                if credential.id is not None:
                    await self._mark_credential_rate_limited(credential.id, cooldown_until=cooldown_until)
                logger.warning(
                    "ai_provider.key_rate_limited",
                    provider="anthropic",
                    model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
                    key_label=credential.label,
                    retry_after_seconds=retry_after_seconds,
                    cooldown_seconds=int(cooldown_seconds + 0.999),
                    fallback_available=index + 1 < len(credentials),
                )
                continue
            except APIStatusError as exc:
                if exc.status_code in {401, 403} and credential.id is not None:
                    await self._mark_credential_invalid(credential.id, error_type="unauthorized")
                    continue
                raise

        retry_after_seconds = (
            self._extract_retry_after_seconds(last_rate_limit)
            if last_rate_limit is not None
            else float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS)
        )
        raise self._build_rate_limited_error(
            retry_after_seconds=retry_after_seconds or float(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS),
            configured_key_count=configured_key_count,
        ) from last_rate_limit

    async def _analyze_with_credential(
        self,
        request: AIAnalysisRequest,
        credential: AIRuntimeCredential,
    ) -> AIAnalysisResponse:
        start_ms = int(time.monotonic() * 1000)
        client = AsyncAnthropic(api_key=credential.api_key)

        # System prompt is marked ephemeral so Anthropic caches it across calls.
        # ~80% of tokens are in the system prompt → significant cost reduction.
        system = [
            {
                "type": "text",
                "text": request.system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        response = await client.messages.create(
            model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system=system,  # type: ignore[arg-type]
            messages=[{"role": "user", "content": request.prompt_template}],
        )

        elapsed_ms = int(time.monotonic() * 1000) - start_ms
        content = response.content[0].text if response.content else ""

        usage = response.usage
        cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        cache_write = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)

        logger.info(
            "claude.response",
            model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            elapsed_ms=elapsed_ms,
        )

        return AIAnalysisResponse(
            content=content,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            processing_time_ms=elapsed_ms,
        )

    async def _get_runtime_credentials(self) -> tuple[list[AIRuntimeCredential], int]:
        model_id = self._model_id or settings.ANTHROPIC_DEFAULT_MODEL
        try:
            credentials = await AIProviderCredentialService.load_available_runtime_credentials(
                provider="anthropic",
                model_id=model_id,
            )
            configured_count = await AIProviderCredentialService.count_runtime_matching_credentials(
                provider="anthropic",
                model_id=model_id,
            )
        except Exception as exc:
            if settings.is_production:
                raise
            logger.warning(
                "claude.credentials_db_unavailable_falling_back_to_env",
                model=model_id,
                error_type=type(exc).__name__,
            )
            credentials = []
            configured_count = 0

        if credentials or configured_count > 0:
            return credentials, configured_count

        if settings.APP_ENV == "development" and settings.ANTHROPIC_API_KEY:
            return [
                AIRuntimeCredential(
                    id=None,
                    provider="anthropic",
                    model_id=model_id,
                    label="env_anthropic_key",
                    api_key=settings.ANTHROPIC_API_KEY,
                    key_last4=settings.ANTHROPIC_API_KEY[-4:],
                    is_persisted=False,
                )
            ], 1

        return [], 0

    def _build_rate_limited_error(
        self,
        *,
        retry_after_seconds: float,
        configured_key_count: int,
    ) -> AIProviderRateLimitedError:
        retry_seconds = max(1.0, float(retry_after_seconds))
        return AIProviderRateLimitedError(
            "All configured Anthropic API keys are in rate-limit cooldown.",
            provider="anthropic",
            model_id=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
            retry_after_seconds=retry_seconds,
            cooldown_until=datetime.now(UTC) + timedelta(seconds=retry_seconds),
            status_code=429,
            provider_error_type="rate_limited",
            configured_key_count=configured_key_count,
            available_key_count=0,
        )

    def _extract_retry_after_seconds(self, exc: Exception | None) -> float | None:
        response = getattr(exc, "response", None)
        headers = getattr(response, "headers", None)
        if headers is None:
            return None
        retry_after = headers.get("retry-after")
        if retry_after:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                return None
        return None

    async def _mark_credential_rate_limited(self, credential_id, *, cooldown_until: datetime) -> None:
        try:
            await AIProviderCredentialService.mark_runtime_rate_limited(
                credential_id,
                cooldown_until=cooldown_until,
                error_type="rate_limited",
            )
        except Exception as exc:
            logger.warning(
                "claude.credential_rate_limit_persist_skipped",
                model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
                error_type=type(exc).__name__,
            )

    async def _mark_credential_invalid(self, credential_id, *, error_type: str) -> None:
        try:
            await AIProviderCredentialService.mark_runtime_invalid(credential_id, error_type=error_type)
        except Exception as exc:
            logger.warning(
                "claude.credential_invalid_persist_skipped",
                model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
                error_type=type(exc).__name__,
            )

    async def _mark_credential_used(self, credential_id) -> None:
        try:
            await AIProviderCredentialService.mark_runtime_used(credential_id)
        except Exception as exc:
            logger.warning(
                "claude.credential_used_persist_skipped",
                model=self._model_id or settings.ANTHROPIC_DEFAULT_MODEL,
                error_type=type(exc).__name__,
            )
