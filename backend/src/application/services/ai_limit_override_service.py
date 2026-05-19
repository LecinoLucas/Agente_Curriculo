"""Admin-issued temporary increases to the AI daily analysis limit.

This module owns:
- Storage operations on ``ai_daily_limit_overrides`` (create / revoke / list).
- The effective-limit resolver used by P0.2B enforcement when checking whether
  an analysis request fits within the daily budget.

It does NOT itself decide whether to allow a given analysis call — that
remains P0.2B's responsibility. Score / ranking / pipeline / prompt code
must not depend on this module.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Literal
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models.ai_daily_limit_override_model import (
    AIDailyLimitOverrideModel,
)
from src.infrastructure.database.models.analysis_model import AnalysisModel

logger = structlog.get_logger(__name__)

Scope = Literal["user", "job", "global"]
LimitType = Literal["analysis_request"]


def _start_of_today_utc() -> datetime:
    """Reset boundary for daily limits. Uses UTC midnight; if you need a
    timezone-aware reset, swap to ``ZoneInfo(...)`` here in one place."""
    now = datetime.now(UTC)
    return datetime.combine(now.date(), time.min, tzinfo=UTC)


@dataclass(slots=True)
class CreateOverrideCommand:
    scope: Scope
    scope_id: UUID | None
    new_limit: int
    expires_at: datetime
    reason: str
    actor_id: UUID
    limit_type: LimitType = "analysis_request"


class AILimitOverrideError(ValidationException):
    """Raised when an override request is invalid (422)."""


class AILimitOverrideNotFoundError(Exception):
    """Raised when revoking an override that doesn't exist (404)."""


@dataclass(slots=True)
class AIDailyLimitExceededError(Exception):
    """Raised by ``check_request_allowed`` when a new analysis request would
    push *any* scope (user / job / global) past its effective daily limit.

    The router maps this to ``HTTP 429`` with ``code="ai_daily_limit_exceeded"``.
    """

    scope: Scope
    limit: int
    used: int
    reset_at: datetime

    def __str__(self) -> str:  # pragma: no cover — formatting only
        return (
            f"ai_daily_limit_exceeded scope={self.scope} used={self.used} "
            f"limit={self.limit} reset_at={self.reset_at.isoformat()}"
        )


class AILimitOverrideService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── public API ───────────────────────────────────────────────────────────

    def baseline_limit(self, scope: Scope) -> int:
        if scope == "user":
            return int(settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER)
        if scope == "job":
            return int(settings.AI_ANALYSIS_DAILY_LIMIT_PER_JOB)
        return int(settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL)

    async def create_override(self, command: CreateOverrideCommand) -> AIDailyLimitOverrideModel:
        now = datetime.now(UTC)
        self._validate_create(command, now=now)

        baseline = self.baseline_limit(command.scope)
        existing = await self._find_active(
            scope=command.scope,
            scope_id=command.scope_id,
            limit_type=command.limit_type,
            now=now,
        )
        old_limit = existing.new_limit if existing is not None else baseline
        if command.new_limit <= old_limit:
            raise AILimitOverrideError(
                "Novo limite precisa ser maior do que o limite atual em vigor."
            )

        override = AIDailyLimitOverrideModel(
            scope=command.scope,
            scope_id=command.scope_id,
            limit_type=command.limit_type,
            old_limit=old_limit,
            new_limit=command.new_limit,
            reason=command.reason.strip(),
            expires_at=command.expires_at,
            created_by=command.actor_id,
        )
        self._session.add(override)
        await self._session.flush()

        logger.info(
            "ai_limit_override.created",
            override_id=str(override.id),
            actor_user_id=str(command.actor_id),
            scope=command.scope,
            scope_id=str(command.scope_id) if command.scope_id else None,
            limit_type=command.limit_type,
            old_limit=old_limit,
            new_limit=command.new_limit,
            expires_at=command.expires_at.isoformat(),
        )
        return override

    async def revoke_override(
        self, override_id: UUID, actor_id: UUID
    ) -> AIDailyLimitOverrideModel:
        override = await self._session.get(AIDailyLimitOverrideModel, override_id)
        if override is None:
            raise AILimitOverrideNotFoundError
        if override.revoked_at is not None:
            return override

        override.revoked_at = datetime.now(UTC)
        override.revoked_by = actor_id
        await self._session.flush()

        logger.info(
            "ai_limit_override.revoked",
            override_id=str(override.id),
            actor_user_id=str(actor_id),
            scope=override.scope,
            scope_id=str(override.scope_id) if override.scope_id else None,
            limit_type=override.limit_type,
        )
        return override

    async def list_active(
        self, *, limit_type: LimitType = "analysis_request"
    ) -> list[AIDailyLimitOverrideModel]:
        now = datetime.now(UTC)
        stmt = (
            sa.select(AIDailyLimitOverrideModel)
            .where(
                AIDailyLimitOverrideModel.limit_type == limit_type,
                AIDailyLimitOverrideModel.expires_at > now,
                AIDailyLimitOverrideModel.revoked_at.is_(None),
            )
            .order_by(AIDailyLimitOverrideModel.created_at.desc())
        )
        rows = await self._session.execute(stmt)
        return list(rows.scalars().all())

    async def resolve_effective_limit(
        self,
        *,
        user_id: UUID | None,
        job_id: UUID | None,
        limit_type: LimitType = "analysis_request",
    ) -> dict[str, object]:
        """Return the effective daily limit (and which scope applied) for the
        given (user, job). Priority: user > job > global.

        ``dict`` shape:
            {
              "limit": int,
              "scope": "user" | "job" | "global",
              "override_id": UUID | None,
              "source": "override" | "default"
            }
        """
        now = datetime.now(UTC)
        if user_id is not None:
            user_override = await self._find_active(
                scope="user", scope_id=user_id, limit_type=limit_type, now=now
            )
            if user_override is not None:
                return self._as_resolution(user_override, scope="user", source="override")
        if job_id is not None:
            job_override = await self._find_active(
                scope="job", scope_id=job_id, limit_type=limit_type, now=now
            )
            if job_override is not None:
                return self._as_resolution(job_override, scope="job", source="override")

        global_override = await self._find_active(
            scope="global", scope_id=None, limit_type=limit_type, now=now
        )
        if global_override is not None:
            return self._as_resolution(global_override, scope="global", source="override")

        # No override → fall back to settings baseline.
        # If a user is in play, the *user* default applies; else job default;
        # else global default.
        if user_id is not None:
            return {
                "limit": self.baseline_limit("user"),
                "scope": "user",
                "override_id": None,
                "source": "default",
            }
        if job_id is not None:
            return {
                "limit": self.baseline_limit("job"),
                "scope": "job",
                "override_id": None,
                "source": "default",
            }
        return {
            "limit": self.baseline_limit("global"),
            "scope": "global",
            "override_id": None,
            "source": "default",
        }

    # ── enforcement (P0.2B) ─────────────────────────────────────────────────

    async def check_request_allowed(
        self,
        *,
        user_id: UUID,
        job_id: UUID | None,
    ) -> None:
        """Raise ``AIDailyLimitExceededError`` if creating one more analysis row
        today would breach any of the three scope limits (user, job, global).

        Counting policy:
        - One row inserted into ``analyses`` today = one consumption unit.
        - Idempotent reuse never reaches this method — the use case returns
          the cached result before invoking the check.
        - Manual retries do NOT create a new row, so they do not count.

        No-op when ``settings.AI_DAILY_LIMITS_ENABLED`` is False. Never calls
        the AI provider.
        """
        if not settings.AI_DAILY_LIMITS_ENABLED:
            return

        now = datetime.now(UTC)
        start_of_day = datetime.combine(now.date(), time.min, tzinfo=UTC)
        reset_at = start_of_day + timedelta(days=1)

        # User scope ──────────────────────────────────────────────────────────
        user_used = await self.count_user_analyses_today(user_id, start=start_of_day)
        user_resolution = await self.resolve_effective_limit(user_id=user_id, job_id=None)
        user_limit = int(user_resolution["limit"])
        if user_used >= user_limit:
            self._log_exceeded("user", user_id, job_id, user_used, user_limit)
            raise AIDailyLimitExceededError(
                scope="user", limit=user_limit, used=user_used, reset_at=reset_at
            )

        # Job scope ───────────────────────────────────────────────────────────
        if job_id is not None:
            job_used = await self.count_job_analyses_today(job_id, start=start_of_day)
            job_resolution = await self.resolve_effective_limit(user_id=None, job_id=job_id)
            job_limit = int(job_resolution["limit"])
            if job_used >= job_limit:
                self._log_exceeded("job", user_id, job_id, job_used, job_limit)
                raise AIDailyLimitExceededError(
                    scope="job", limit=job_limit, used=job_used, reset_at=reset_at
                )

        # Global scope ────────────────────────────────────────────────────────
        global_used = await self.count_global_analyses_today(start=start_of_day)
        global_resolution = await self.resolve_effective_limit(user_id=None, job_id=None)
        global_limit = int(global_resolution["limit"])
        if global_used >= global_limit:
            self._log_exceeded("global", user_id, job_id, global_used, global_limit)
            raise AIDailyLimitExceededError(
                scope="global", limit=global_limit, used=global_used, reset_at=reset_at
            )

    async def count_user_analyses_today(
        self, user_id: UUID, *, start: datetime | None = None
    ) -> int:
        start = start or _start_of_today_utc()
        stmt = (
            sa.select(sa.func.count())
            .select_from(AnalysisModel)
            .where(
                AnalysisModel.created_at >= start,
                AnalysisModel.requested_by == user_id,
            )
        )
        return int(await self._session.scalar(stmt) or 0)

    async def count_job_analyses_today(
        self, job_id: UUID, *, start: datetime | None = None
    ) -> int:
        start = start or _start_of_today_utc()
        stmt = (
            sa.select(sa.func.count())
            .select_from(AnalysisModel)
            .where(
                AnalysisModel.created_at >= start,
                AnalysisModel.job_id == job_id,
            )
        )
        return int(await self._session.scalar(stmt) or 0)

    async def count_global_analyses_today(self, *, start: datetime | None = None) -> int:
        start = start or _start_of_today_utc()
        stmt = (
            sa.select(sa.func.count())
            .select_from(AnalysisModel)
            .where(AnalysisModel.created_at >= start)
        )
        return int(await self._session.scalar(stmt) or 0)

    @staticmethod
    def _log_exceeded(
        scope: str, user_id: UUID, job_id: UUID | None, used: int, limit: int
    ) -> None:
        logger.warning(
            "ai_daily_limit.exceeded",
            scope=scope,
            user_id=str(user_id),
            job_id=str(job_id) if job_id else None,
            used=used,
            limit=limit,
        )

    # ── internals ────────────────────────────────────────────────────────────

    def _validate_create(self, command: CreateOverrideCommand, *, now: datetime) -> None:
        if command.scope not in {"user", "job", "global"}:
            raise AILimitOverrideError("Escopo inválido. Use user, job ou global.")
        if command.scope == "global":
            if command.scope_id is not None:
                raise AILimitOverrideError("scope_id deve ser nulo para escopo global.")
        else:
            if command.scope_id is None:
                raise AILimitOverrideError(
                    "scope_id é obrigatório para escopo user/job."
                )

        if not command.reason or not command.reason.strip():
            raise AILimitOverrideError("Motivo do aumento é obrigatório.")
        if len(command.reason) > 500:
            raise AILimitOverrideError("Motivo deve ter no máximo 500 caracteres.")

        if command.new_limit <= 0:
            raise AILimitOverrideError("Novo limite deve ser positivo.")

        if command.expires_at.tzinfo is None:
            command.expires_at = command.expires_at.replace(tzinfo=UTC)
        if command.expires_at <= now:
            raise AILimitOverrideError(
                "expires_at deve estar no futuro."
            )
        max_window = timedelta(days=settings.AI_LIMIT_OVERRIDE_MAX_DAYS)
        if command.expires_at - now > max_window:
            raise AILimitOverrideError(
                f"Validade máxima do override é {settings.AI_LIMIT_OVERRIDE_MAX_DAYS} dias."
            )

    async def _find_active(
        self,
        *,
        scope: Scope,
        scope_id: UUID | None,
        limit_type: LimitType,
        now: datetime,
    ) -> AIDailyLimitOverrideModel | None:
        stmt = sa.select(AIDailyLimitOverrideModel).where(
            AIDailyLimitOverrideModel.scope == scope,
            AIDailyLimitOverrideModel.limit_type == limit_type,
            AIDailyLimitOverrideModel.expires_at > now,
            AIDailyLimitOverrideModel.revoked_at.is_(None),
        )
        if scope_id is None:
            stmt = stmt.where(AIDailyLimitOverrideModel.scope_id.is_(None))
        else:
            stmt = stmt.where(AIDailyLimitOverrideModel.scope_id == scope_id)
        stmt = stmt.order_by(AIDailyLimitOverrideModel.created_at.desc()).limit(1)

        row = await self._session.execute(stmt)
        return row.scalar_one_or_none()

    @staticmethod
    def _as_resolution(
        override: AIDailyLimitOverrideModel, *, scope: Scope, source: str
    ) -> dict[str, object]:
        return {
            "limit": int(override.new_limit),
            "scope": scope,
            "override_id": override.id,
            "source": source,
        }
