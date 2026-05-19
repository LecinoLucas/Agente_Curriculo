"""Admin-only endpoints for managing AI daily-limit overrides (P0.2C)."""
from __future__ import annotations

from datetime import UTC, datetime, time
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_limit_override_service import (
    AILimitOverrideError,
    AILimitOverrideNotFoundError,
    AILimitOverrideService,
    CreateOverrideCommand,
)
from src.core.settings import settings
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.ai_limits_schemas import (
    AILimitOverrideResponse,
    AILimitsUsageResponse,
    AILimitUsageEntry,
    CreateOverrideRequest,
)

router = APIRouter(prefix="/admin/ai-limits", tags=["admin-ai-limits"])


def _get_service(db: AsyncSession = Depends(get_db)) -> AILimitOverrideService:
    return AILimitOverrideService(db)


@router.get("/usage", response_model=AILimitsUsageResponse)
async def get_ai_limits_usage(
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
    service: AILimitOverrideService = Depends(_get_service),
) -> AILimitsUsageResponse:
    """Return today's analysis-request usage along with the applied effective
    limits and any active overrides."""
    now = datetime.now(UTC)
    start_of_day = datetime.combine(now.date(), time.min, tzinfo=UTC)

    active = await service.list_active()

    per_user_rows = await db.execute(
        sa.select(
            AnalysisModel.requested_by,
            sa.func.count().label("used_today"),
        )
        .where(AnalysisModel.created_at >= start_of_day)
        .group_by(AnalysisModel.requested_by)
    )
    by_user: list[AILimitUsageEntry] = []
    for user_id, used_today in per_user_rows.all():
        resolution = await service.resolve_effective_limit(user_id=user_id, job_id=None)
        by_user.append(
            AILimitUsageEntry(
                scope="user",
                scope_id=user_id,
                label=None,
                used_today=int(used_today),
                effective_limit=int(resolution["limit"]),
                limit_source=resolution["source"],  # type: ignore[arg-type]
                override_id=resolution["override_id"],  # type: ignore[arg-type]
            )
        )

    per_job_rows = await db.execute(
        sa.select(
            AnalysisModel.job_id,
            sa.func.count().label("used_today"),
        )
        .where(
            AnalysisModel.created_at >= start_of_day,
            AnalysisModel.job_id.is_not(None),
        )
        .group_by(AnalysisModel.job_id)
    )
    by_job: list[AILimitUsageEntry] = []
    for job_id, used_today in per_job_rows.all():
        resolution = await service.resolve_effective_limit(user_id=None, job_id=job_id)
        by_job.append(
            AILimitUsageEntry(
                scope="job",
                scope_id=job_id,
                label=None,
                used_today=int(used_today),
                effective_limit=int(resolution["limit"]),
                limit_source=resolution["source"],  # type: ignore[arg-type]
                override_id=resolution["override_id"],  # type: ignore[arg-type]
            )
        )

    global_used = await db.scalar(
        sa.select(sa.func.count())
        .select_from(AnalysisModel)
        .where(AnalysisModel.created_at >= start_of_day)
    )
    global_resolution = await service.resolve_effective_limit(user_id=None, job_id=None)
    global_entry = AILimitUsageEntry(
        scope="global",
        scope_id=None,
        label=None,
        used_today=int(global_used or 0),
        effective_limit=int(global_resolution["limit"]),
        limit_source=global_resolution["source"],  # type: ignore[arg-type]
        override_id=global_resolution["override_id"],  # type: ignore[arg-type]
    )

    return AILimitsUsageResponse(
        today=now,
        defaults={
            "per_user": settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER,
            "per_job": settings.AI_ANALYSIS_DAILY_LIMIT_PER_JOB,
            "global": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL,
            "override_max_days": settings.AI_LIMIT_OVERRIDE_MAX_DAYS,
        },
        active_overrides=[AILimitOverrideResponse.model_validate(o, from_attributes=True) for o in active],
        by_user=by_user,
        by_job=by_job,
        global_usage=global_entry,
    )


@router.get("/overrides", response_model=list[AILimitOverrideResponse])
async def list_overrides(
    _current_user: AdminOnly,
    service: AILimitOverrideService = Depends(_get_service),
) -> list[AILimitOverrideResponse]:
    rows = await service.list_active()
    return [AILimitOverrideResponse.model_validate(r, from_attributes=True) for r in rows]


@router.post(
    "/overrides",
    response_model=AILimitOverrideResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_override(
    body: CreateOverrideRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
    service: AILimitOverrideService = Depends(_get_service),
) -> AILimitOverrideResponse:
    try:
        override = await service.create_override(
            CreateOverrideCommand(
                scope=body.scope,
                scope_id=body.scope_id,
                new_limit=body.new_limit,
                expires_at=body.expires_at,
                reason=body.reason,
                actor_id=current_user.id,
            )
        )
        await db.commit()
    except AILimitOverrideError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.message,
        )
    return AILimitOverrideResponse.model_validate(override, from_attributes=True)


@router.delete(
    "/overrides/{override_id}",
    response_model=AILimitOverrideResponse,
)
async def revoke_override(
    override_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
    service: AILimitOverrideService = Depends(_get_service),
) -> AILimitOverrideResponse:
    try:
        override = await service.revoke_override(override_id, actor_id=current_user.id)
        await db.commit()
    except AILimitOverrideNotFoundError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Override não encontrado.",
        )
    return AILimitOverrideResponse.model_validate(override, from_attributes=True)
