from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from src.application.services.audit_service import AuditService
from src.core.settings import settings
from src.infrastructure.database.models.ai_provider_credential_model import AIProviderCredentialModel
from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel
from src.infrastructure.database.models.analysis_model import AIModelModel
from src.infrastructure.security.encryption_service import AICredentialEncryptionService


class AIProviderCredentialNotFoundError(Exception):
    pass


class AIProviderCredentialConflictError(Exception):
    pass


class InvalidAIProviderCredentialError(Exception):
    pass


VALID_AI_CREDENTIAL_PROVIDERS = {"google", "anthropic"}
VALID_AI_CREDENTIAL_STATUSES = {"active", "disabled", "rate_limited", "invalid"}
logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class AIRuntimeCredential:
    id: UUID | None
    provider: str
    model_id: str | None
    label: str
    api_key: str
    key_last4: str
    is_persisted: bool = True


def normalize_ai_provider(provider: str | None) -> str:
    normalized = (provider or "").strip().lower()
    if normalized in {"gemini", "google"}:
        return "google"
    if normalized in {"claude", "anthropic"}:
        return "anthropic"
    raise InvalidAIProviderCredentialError("provider inválido")


def mask_api_key_last4(last4: str) -> str:
    return f"****...{last4}"


def _ensure_aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class AIProviderCredentialService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._encryption = AICredentialEncryptionService()

    async def create_credential(
        self,
        *,
        provider: str,
        model_id: str | None,
        label: str,
        raw_api_key: str,
        actor: Any | None,
        priority: int = 100,
    ) -> AIProviderCredentialModel:
        provider = normalize_ai_provider(provider)
        label = self._clean_required(label)
        raw_api_key = self._clean_required(raw_api_key)
        model_id = self._clean_optional(model_id)
        priority = self._validate_priority(priority)
        await self._ensure_label_available(provider=provider, label=label)

        now = datetime.now(UTC)
        credential = AIProviderCredentialModel(
            provider=provider,
            model_id=model_id,
            label=label,
            encrypted_api_key=self._encryption.encrypt(raw_api_key),
            key_last4=raw_api_key[-4:],
            status="active",
            priority=priority,
            created_by_user_id=getattr(actor, "id", None),
            created_at=now,
            updated_at=now,
        )
        self._db.add(credential)
        await self._db.flush()
        await self._audit(
            action="ai_provider_credential.created",
            credential=credential,
            actor=actor,
        )
        await self._recalculate_provider_health(provider=provider, model_id=model_id)
        return credential

    async def list_credentials(
        self,
        *,
        provider: str | None = None,
        model_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[AIProviderCredentialModel]:
        limit = min(max(int(limit), 1), 500)
        offset = max(int(offset), 0)
        stmt = sa.select(AIProviderCredentialModel).options(
            load_only(
                AIProviderCredentialModel.id,
                AIProviderCredentialModel.provider,
                AIProviderCredentialModel.model_id,
                AIProviderCredentialModel.label,
                AIProviderCredentialModel.key_last4,
                AIProviderCredentialModel.status,
                AIProviderCredentialModel.priority,
                AIProviderCredentialModel.cooldown_until,
                AIProviderCredentialModel.last_used_at,
                AIProviderCredentialModel.last_error_at,
                AIProviderCredentialModel.last_error_type,
                AIProviderCredentialModel.consecutive_rate_limit_count,
                AIProviderCredentialModel.created_at,
                AIProviderCredentialModel.updated_at,
            )
        )
        if provider:
            stmt = stmt.where(AIProviderCredentialModel.provider == normalize_ai_provider(provider))
        model_id = self._clean_optional(model_id)
        if model_id is not None:
            stmt = stmt.where(AIProviderCredentialModel.model_id == model_id)
        status = self._clean_optional(status)
        if status is not None:
            if status not in VALID_AI_CREDENTIAL_STATUSES:
                raise InvalidAIProviderCredentialError("status inválido")
            stmt = stmt.where(AIProviderCredentialModel.status == status)
        stmt = stmt.order_by(
            AIProviderCredentialModel.provider.asc(),
            AIProviderCredentialModel.priority.asc(),
            AIProviderCredentialModel.created_at.asc(),
        ).limit(limit).offset(offset)
        rows = await self._db.execute(stmt)
        return list(rows.scalars().all())

    async def disable_credential(self, credential_id: UUID, actor: Any | None) -> AIProviderCredentialModel:
        credential = await self._get(credential_id)
        before_state = self._safe_audit_state(credential)
        now = datetime.now(UTC)
        credential.status = "disabled"
        credential.disabled_by_user_id = getattr(actor, "id", None)
        credential.disabled_at = now
        credential.updated_at = now
        await self._db.flush()
        await self._audit(
            action="ai_provider_credential.disabled",
            credential=credential,
            actor=actor,
            before_state=before_state,
        )
        await self._recalculate_provider_health(provider=credential.provider, model_id=credential.model_id)
        return credential

    async def enable_credential(self, credential_id: UUID, actor: Any | None) -> AIProviderCredentialModel:
        credential = await self._get(credential_id)
        before_state = self._safe_audit_state(credential)
        credential.status = "active"
        credential.cooldown_until = None
        credential.disabled_by_user_id = None
        credential.disabled_at = None
        credential.last_error_type = None
        credential.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._audit(
            action="ai_provider_credential.enabled",
            credential=credential,
            actor=actor,
            before_state=before_state,
        )
        await self._recalculate_provider_health(provider=credential.provider, model_id=credential.model_id)
        return credential

    async def rotate_credential(
        self,
        credential_id: UUID,
        *,
        new_raw_api_key: str,
        actor: Any | None,
    ) -> AIProviderCredentialModel:
        credential = await self._get(credential_id)
        before_state = self._safe_audit_state(credential)
        new_raw_api_key = self._clean_required(new_raw_api_key)
        credential.encrypted_api_key = self._encryption.encrypt(new_raw_api_key)
        credential.key_last4 = new_raw_api_key[-4:]
        credential.status = "active"
        credential.cooldown_until = None
        credential.last_error_type = None
        credential.consecutive_rate_limit_count = 0
        credential.updated_at = datetime.now(UTC)
        await self._db.flush()
        await self._audit(
            action="ai_provider_credential.rotated",
            credential=credential,
            actor=actor,
            before_state=before_state,
        )
        await self._recalculate_provider_health(provider=credential.provider, model_id=credential.model_id)
        return credential

    async def get_available_credentials(
        self,
        *,
        provider: str,
        model_id: str | None = None,
    ) -> list[AIRuntimeCredential]:
        provider = normalize_ai_provider(provider)
        model_id = self._clean_optional(model_id)
        now = datetime.now(UTC)
        stmt = (
            sa.select(AIProviderCredentialModel)
            .where(AIProviderCredentialModel.provider == provider)
            .where(
                sa.or_(
                    AIProviderCredentialModel.model_id.is_(None),
                    AIProviderCredentialModel.model_id == model_id,
                )
                if model_id is not None
                else sa.true()
            )
            .where(
                sa.or_(
                    sa.and_(
                        AIProviderCredentialModel.status == "active",
                        sa.or_(
                            AIProviderCredentialModel.cooldown_until.is_(None),
                            AIProviderCredentialModel.cooldown_until <= now,
                        ),
                    ),
                    sa.and_(
                        AIProviderCredentialModel.status == "rate_limited",
                        AIProviderCredentialModel.cooldown_until.is_not(None),
                        AIProviderCredentialModel.cooldown_until <= now,
                    ),
                )
            )
            .order_by(
                AIProviderCredentialModel.priority.asc(),
                sa.nullsfirst(AIProviderCredentialModel.last_used_at.asc()),
                AIProviderCredentialModel.created_at.asc(),
            )
        )
        rows = await self._db.execute(stmt)
        credentials = list(rows.scalars().all())
        runtime_credentials: list[AIRuntimeCredential] = []
        for credential in credentials:
            if credential.status == "rate_limited":
                credential.status = "active"
                credential.cooldown_until = None
                credential.updated_at = now
            runtime_credentials.append(self._to_runtime_credential(credential))
        if credentials:
            await self._db.flush()
        return runtime_credentials

    async def mark_rate_limited(
        self,
        credential_id: UUID,
        *,
        cooldown_until: datetime,
        error_type: str,
    ) -> AIProviderCredentialModel:
        credential = await self._get(credential_id)
        before_state = self._safe_audit_state(credential)
        now = datetime.now(UTC)
        credential.status = "rate_limited"
        credential.cooldown_until = _ensure_aware_utc(cooldown_until)
        credential.last_error_at = now
        credential.last_error_type = self._clean_optional(error_type) or "rate_limited"
        credential.consecutive_rate_limit_count = int(credential.consecutive_rate_limit_count or 0) + 1
        credential.updated_at = now
        await self._db.flush()
        await self._audit(
            action="ai_provider_credential.rate_limited",
            credential=credential,
            actor=None,
            before_state=before_state,
        )
        await self._recalculate_provider_health(provider=credential.provider, model_id=credential.model_id)
        return credential

    async def mark_invalid(self, credential_id: UUID, *, error_type: str) -> AIProviderCredentialModel:
        credential = await self._get(credential_id)
        before_state = self._safe_audit_state(credential)
        now = datetime.now(UTC)
        credential.status = "invalid"
        credential.last_error_at = now
        credential.last_error_type = self._clean_optional(error_type) or "invalid_api_key"
        credential.updated_at = now
        await self._db.flush()
        await self._audit(
            action="ai_provider_credential.marked_invalid",
            credential=credential,
            actor=None,
            before_state=before_state,
        )
        await self._recalculate_provider_health(provider=credential.provider, model_id=credential.model_id)
        return credential

    async def mark_used(self, credential_id: UUID) -> AIProviderCredentialModel:
        credential = await self._get(credential_id)
        now = datetime.now(UTC)
        credential.last_used_at = now
        credential.last_error_type = None
        credential.updated_at = now
        await self._db.flush()
        return credential

    async def count_matching_credentials(self, *, provider: str, model_id: str | None = None) -> int:
        provider = normalize_ai_provider(provider)
        stmt = sa.select(sa.func.count()).select_from(AIProviderCredentialModel).where(
            AIProviderCredentialModel.provider == provider
        )
        model_id = self._clean_optional(model_id)
        if model_id is not None:
            stmt = stmt.where(
                sa.or_(
                    AIProviderCredentialModel.model_id.is_(None),
                    AIProviderCredentialModel.model_id == model_id,
                )
            )
        return int(await self._db.scalar(stmt) or 0)

    @classmethod
    async def count_runtime_matching_credentials(
        cls,
        *,
        provider: str,
        model_id: str | None = None,
    ) -> int:
        from src.infrastructure.database.connection import create_celery_async_sessionmaker

        engine, sessionmaker = await create_celery_async_sessionmaker()
        try:
            async with sessionmaker() as session:
                return await cls(session).count_matching_credentials(provider=provider, model_id=model_id)
        finally:
            await engine.dispose()

    @classmethod
    async def load_available_runtime_credentials(
        cls,
        *,
        provider: str,
        model_id: str | None = None,
    ) -> list[AIRuntimeCredential]:
        from src.infrastructure.database.connection import create_celery_async_sessionmaker

        engine, sessionmaker = await create_celery_async_sessionmaker()
        try:
            async with sessionmaker() as session:
                service = cls(session)
                credentials = await service.get_available_credentials(provider=provider, model_id=model_id)
                await session.commit()
                return credentials
        finally:
            await engine.dispose()

    @classmethod
    async def mark_runtime_rate_limited(
        cls,
        credential_id: UUID,
        *,
        cooldown_until: datetime,
        error_type: str,
    ) -> None:
        from src.infrastructure.database.connection import create_celery_async_sessionmaker

        engine, sessionmaker = await create_celery_async_sessionmaker()
        try:
            async with sessionmaker() as session:
                await cls(session).mark_rate_limited(
                    credential_id,
                    cooldown_until=cooldown_until,
                    error_type=error_type,
                )
                await session.commit()
        finally:
            await engine.dispose()

    @classmethod
    async def mark_runtime_invalid(cls, credential_id: UUID, *, error_type: str) -> None:
        from src.infrastructure.database.connection import create_celery_async_sessionmaker

        engine, sessionmaker = await create_celery_async_sessionmaker()
        try:
            async with sessionmaker() as session:
                await cls(session).mark_invalid(credential_id, error_type=error_type)
                await session.commit()
        finally:
            await engine.dispose()

    @classmethod
    async def mark_runtime_used(cls, credential_id: UUID) -> None:
        from src.infrastructure.database.connection import create_celery_async_sessionmaker

        engine, sessionmaker = await create_celery_async_sessionmaker()
        try:
            async with sessionmaker() as session:
                await cls(session).mark_used(credential_id)
                await session.commit()
        finally:
            await engine.dispose()

    async def _get(self, credential_id: UUID) -> AIProviderCredentialModel:
        credential = await self._db.scalar(
            sa.select(AIProviderCredentialModel).where(AIProviderCredentialModel.id == credential_id)
        )
        if credential is None:
            raise AIProviderCredentialNotFoundError
        return credential

    async def _ensure_label_available(self, *, provider: str, label: str) -> None:
        existing = await self._db.scalar(
            sa.select(AIProviderCredentialModel.id).where(
                AIProviderCredentialModel.provider == provider,
                AIProviderCredentialModel.label == label,
            )
        )
        if existing is not None:
            raise AIProviderCredentialConflictError

    def _to_runtime_credential(self, credential: AIProviderCredentialModel) -> AIRuntimeCredential:
        return AIRuntimeCredential(
            id=credential.id,
            provider=credential.provider,
            model_id=credential.model_id,
            label=credential.label,
            api_key=self._encryption.decrypt(credential.encrypted_api_key),
            key_last4=credential.key_last4,
            is_persisted=True,
        )

    async def _audit(
        self,
        *,
        action: str,
        credential: AIProviderCredentialModel,
        actor: Any | None,
        before_state: dict[str, Any] | None = None,
    ) -> None:
        actor_id = getattr(actor, "id", None)
        after_state = self._safe_audit_state(credential)
        metadata = {
            "credential_id": str(credential.id),
            "provider": credential.provider,
            "model_id": credential.model_id,
            "label": credential.label,
            "key_last4": credential.key_last4,
            "actor_user_id": str(actor_id) if actor_id is not None else None,
            "action": action,
            "status": credential.status,
            "priority": credential.priority,
            "cooldown_until": credential.cooldown_until.isoformat() if credential.cooldown_until else None,
        }
        await AuditService(self._db).log_event(
            action=action,
            resource_type="ai_provider_credential",
            resource_id=credential.id,
            user_id=actor_id,
            metadata=metadata,
            before_state=before_state,
            after_state=after_state,
        )
        logger.info(
            action,
            credential_id=str(credential.id),
            provider=credential.provider,
            model_id=credential.model_id,
            label=credential.label,
            key_last4=credential.key_last4,
            actor_user_id=str(actor_id) if actor_id is not None else None,
            status=credential.status,
            priority=credential.priority,
        )

    @staticmethod
    def _safe_audit_state(credential: AIProviderCredentialModel) -> dict[str, Any]:
        return {
            "credential_id": str(credential.id),
            "provider": credential.provider,
            "model_id": credential.model_id,
            "label": credential.label,
            "key_last4": credential.key_last4,
            "status": credential.status,
            "priority": credential.priority,
            "cooldown_until": credential.cooldown_until.isoformat() if credential.cooldown_until else None,
            "last_error_type": credential.last_error_type,
            "last_error_at": credential.last_error_at.isoformat() if credential.last_error_at else None,
            "consecutive_rate_limit_count": credential.consecutive_rate_limit_count,
        }

    async def _recalculate_provider_health(self, *, provider: str, model_id: str | None) -> None:
        provider = normalize_ai_provider(provider)
        target_model_ids = await self._target_model_ids(provider=provider, model_id=model_id)
        for target_model_id in target_model_ids:
            await self._recalculate_single_provider_health(provider=provider, model_id=target_model_id)

    async def _target_model_ids(self, *, provider: str, model_id: str | None) -> list[str]:
        if model_id:
            return [model_id]
        rows = await self._db.execute(
            sa.select(AIModelModel.model_id).where(AIModelModel.provider == provider)
        )
        model_ids = [str(row[0]) for row in rows.all()]
        if settings.AI_PROVIDER == provider and settings.AI_MODEL_ID not in model_ids:
            model_ids.append(settings.AI_MODEL_ID)
        return model_ids or [settings.AI_MODEL_ID]

    async def _recalculate_single_provider_health(self, *, provider: str, model_id: str) -> None:
        now = datetime.now(UTC)
        rows = await self._db.execute(
            sa.select(AIProviderCredentialModel)
            .options(
                load_only(
                    AIProviderCredentialModel.id,
                    AIProviderCredentialModel.provider,
                    AIProviderCredentialModel.model_id,
                    AIProviderCredentialModel.label,
                    AIProviderCredentialModel.key_last4,
                    AIProviderCredentialModel.status,
                    AIProviderCredentialModel.priority,
                    AIProviderCredentialModel.cooldown_until,
                    AIProviderCredentialModel.last_error_at,
                    AIProviderCredentialModel.last_error_type,
                    AIProviderCredentialModel.consecutive_rate_limit_count,
                )
            )
            .where(
                    AIProviderCredentialModel.provider == provider,
                    sa.or_(
                        AIProviderCredentialModel.model_id.is_(None),
                        AIProviderCredentialModel.model_id == model_id,
                    ),
            )
        )
        credentials = list(rows.scalars().all())
        configured_count = len(credentials)
        available_count = 0
        rate_limited_active: list[AIProviderCredentialModel] = []
        invalid_count = 0
        consecutive_total = 0
        last_error_at: datetime | None = None
        last_error_type: str | None = None

        for credential in credentials:
            cooldown_until = _ensure_aware_utc(credential.cooldown_until)
            if credential.status == "active":
                available_count += 1
            elif credential.status == "rate_limited" and cooldown_until is not None and cooldown_until <= now:
                available_count += 1
            elif credential.status == "rate_limited":
                rate_limited_active.append(credential)
            elif credential.status == "invalid":
                invalid_count += 1
            consecutive_total += int(credential.consecutive_rate_limit_count or 0)
            error_at = _ensure_aware_utc(credential.last_error_at)
            if error_at is not None and (last_error_at is None or error_at > last_error_at):
                last_error_at = error_at
                last_error_type = credential.last_error_type

        status = "unavailable"
        if configured_count == 0:
            status = "unavailable"
        elif available_count > 0 and (rate_limited_active or invalid_count):
            status = "degraded"
        elif available_count > 0:
            status = "available"
        elif rate_limited_active:
            status = "rate_limited"

        cooldown_until = None
        if rate_limited_active:
            cooldown_until = min(
                (
                    value
                    for value in (_ensure_aware_utc(item.cooldown_until) for item in rate_limited_active)
                    if value is not None
                ),
                default=None,
            )

        health = await self._db.scalar(
            sa.select(AIProviderHealthModel).where(
                AIProviderHealthModel.provider == provider,
                AIProviderHealthModel.model_id == model_id,
            )
        )
        if health is None:
            health = AIProviderHealthModel(provider=provider, model_id=model_id)
            self._db.add(health)

        health.status = status
        health.configured_key_count = configured_count
        health.available_key_count = available_count
        health.cooldown_until = cooldown_until
        health.last_error_type = last_error_type if status != "available" else None
        health.last_status_code = 429 if status == "rate_limited" else None
        health.last_error_at = last_error_at
        health.consecutive_rate_limit_count = consecutive_total
        health.updated_at = now
        await self._db.flush()

    @staticmethod
    def _clean_required(value: str | None) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise InvalidAIProviderCredentialError
        return cleaned

    @staticmethod
    def _clean_optional(value: str | None) -> str | None:
        cleaned = (value or "").strip()
        return cleaned or None

    @staticmethod
    def _validate_priority(value: int) -> int:
        try:
            priority = int(value)
        except (TypeError, ValueError) as exc:
            raise InvalidAIProviderCredentialError("priority inválida") from exc
        if priority < 1 or priority > 10000:
            raise InvalidAIProviderCredentialError("priority inválida")
        return priority
