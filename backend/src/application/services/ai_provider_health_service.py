from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.infrastructure.ai.gemini_adapter import get_gemini_key_health
from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel

logger = structlog.get_logger(__name__)


def _normalize_provider(provider: str | None) -> str:
    normalized = (provider or settings.AI_PROVIDER).strip().lower()
    return "google" if normalized == "gemini" else normalized


def _provider_key_counts(provider: str) -> tuple[int, int | None]:
    if provider == "google":
        key_health = get_gemini_key_health()
        return (
            int(key_health.get("configured_key_count") or 0),
            int(key_health.get("available_key_count") or 0),
        )
    if provider == "anthropic":
        configured = 1 if settings.ANTHROPIC_API_KEY else 0
        return configured, configured
    return 0, None


def _ensure_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class AIProviderHealthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def record_available(
        self,
        *,
        provider: str,
        model_id: str,
    ) -> AIProviderHealthModel:
        provider = _normalize_provider(provider)
        configured_key_count, available_key_count = _provider_key_counts(provider)
        health = await self._get_or_create(provider=provider, model_id=model_id)
        now = datetime.now(UTC)
        health.status = "available"
        health.configured_key_count = configured_key_count
        health.available_key_count = available_key_count
        health.cooldown_until = None
        health.last_error_type = None
        health.last_status_code = None
        health.consecutive_rate_limit_count = 0
        health.updated_at = now
        await self._db.flush()
        return health

    async def record_rate_limited(
        self,
        *,
        provider: str | None,
        model_id: str | None,
        retry_after_seconds: float | None,
        cooldown_until: datetime | None,
        status_code: int | None = 429,
        configured_key_count: int | None = None,
        available_key_count: int | None = None,
    ) -> AIProviderHealthModel | None:
        if not model_id:
            return None

        provider = _normalize_provider(provider)
        inferred_configured, inferred_available = _provider_key_counts(provider)
        configured_count = configured_key_count if configured_key_count is not None else inferred_configured
        available_count = available_key_count if available_key_count is not None else inferred_available
        now = datetime.now(UTC)
        retry_seconds = retry_after_seconds if retry_after_seconds is not None else settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS
        effective_cooldown_until = cooldown_until or now + timedelta(seconds=max(1, int(retry_seconds)))

        health = await self._get_or_create(provider=provider, model_id=model_id)
        was_rate_limited = health.status == "rate_limited"
        previous_notification_at = health.last_admin_notification_at

        health.status = "rate_limited"
        health.configured_key_count = int(configured_count or 0)
        health.available_key_count = int(available_count) if available_count is not None else None
        health.cooldown_until = effective_cooldown_until
        health.last_error_type = "rate_limited"
        health.last_status_code = status_code
        health.last_error_at = now
        health.consecutive_rate_limit_count = int(health.consecutive_rate_limit_count or 0) + 1
        health.updated_at = now

        if self._should_emit_admin_alert(
            now=now,
            was_rate_limited=was_rate_limited,
            retry_after_seconds=retry_seconds,
            consecutive_count=health.consecutive_rate_limit_count,
            previous_notification_at=previous_notification_at,
        ):
            health.last_admin_notification_at = now
            logger.warning(
                "ai_provider.rate_limited_admin_alert",
                provider=provider,
                model_id=model_id,
                cooldown_until=effective_cooldown_until.isoformat(),
                retry_after_seconds=int(float(retry_seconds) + 0.999),
                configured_key_count=health.configured_key_count,
                consecutive_rate_limit_count=health.consecutive_rate_limit_count,
                environment=settings.APP_ENV,
            )

        await self._db.flush()
        return health

    async def list_health(self) -> list[dict[str, Any]]:
        rows = await self._db.execute(
            sa.select(AIProviderHealthModel).order_by(
                AIProviderHealthModel.provider.asc(),
                AIProviderHealthModel.model_id.asc(),
            )
        )
        now = datetime.now(UTC)
        return [self._serialize(row, now=now) for row in rows.scalars().all()]

    async def list_or_current_health(self) -> list[dict[str, Any]]:
        persisted = await self.list_health()
        if persisted:
            return persisted

        provider = _normalize_provider(settings.AI_PROVIDER)
        configured_key_count, available_key_count = _provider_key_counts(provider)
        status = "available"
        if configured_key_count == 0:
            status = "unavailable"
        elif available_key_count == 0:
            status = "degraded"

        return [
            {
                "provider": provider,
                "model_id": settings.AI_MODEL_ID,
                "status": status,
                "cooldown_until": None,
                "retry_after_seconds": None,
                "configured_key_count": configured_key_count,
                "available_key_count": available_key_count,
                "last_error_type": None,
                "last_status_code": None,
                "last_error_at": None,
                "consecutive_rate_limit_count": 0,
            }
        ]

    async def get_current_health(self) -> dict[str, Any] | None:
        row = await self._db.scalar(
            sa.select(AIProviderHealthModel)
            .where(AIProviderHealthModel.provider == _normalize_provider(settings.AI_PROVIDER))
            .order_by(AIProviderHealthModel.updated_at.desc())
            .limit(1)
        )
        if row is None:
            return None
        return self._serialize(row, now=datetime.now(UTC))

    async def _get_or_create(self, *, provider: str, model_id: str) -> AIProviderHealthModel:
        health = await self._db.scalar(
            sa.select(AIProviderHealthModel).where(
                AIProviderHealthModel.provider == provider,
                AIProviderHealthModel.model_id == model_id,
            )
        )
        if health is not None:
            return health

        configured_key_count, available_key_count = _provider_key_counts(provider)
        health = AIProviderHealthModel(
            provider=provider,
            model_id=model_id,
            configured_key_count=configured_key_count,
            available_key_count=available_key_count,
        )
        self._db.add(health)
        await self._db.flush()
        return health

    def _should_emit_admin_alert(
        self,
        *,
        now: datetime,
        was_rate_limited: bool,
        retry_after_seconds: float,
        consecutive_count: int,
        previous_notification_at: datetime | None,
    ) -> bool:
        notification_window = timedelta(seconds=max(1, settings.AI_RATE_LIMIT_ADMIN_ALERT_COOLDOWN_SECONDS))
        previous_notification_at = _ensure_aware_utc(previous_notification_at)
        if previous_notification_at is not None and now - previous_notification_at < notification_window:
            return False
        if not was_rate_limited:
            return True
        if retry_after_seconds >= settings.AI_RATE_LIMIT_ADMIN_ALERT_MIN_COOLDOWN_SECONDS:
            return True
        return consecutive_count >= settings.AI_RATE_LIMIT_ADMIN_ALERT_CONSECUTIVE_THRESHOLD

    def _serialize(self, health: AIProviderHealthModel, *, now: datetime) -> dict[str, Any]:
        retry_after_seconds = None
        cooldown_until = _ensure_aware_utc(health.cooldown_until)
        status = health.status
        if cooldown_until is not None and cooldown_until > now:
            retry_after_seconds = int((cooldown_until - now).total_seconds() + 0.999)
        elif status == "rate_limited":
            status = "degraded"

        return {
            "provider": health.provider,
            "model_id": health.model_id,
            "status": status,
            "cooldown_until": cooldown_until,
            "retry_after_seconds": retry_after_seconds,
            "configured_key_count": health.configured_key_count,
            "available_key_count": health.available_key_count,
            "last_error_type": health.last_error_type,
            "last_status_code": health.last_status_code,
            "last_error_at": health.last_error_at,
            "consecutive_rate_limit_count": health.consecutive_rate_limit_count,
        }
