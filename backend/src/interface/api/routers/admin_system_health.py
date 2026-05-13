from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.system_health_service import AIUsageQuery, SystemHealthService
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.system_health_schemas import (
    AIUsageSummaryResponse,
    DatabaseHealthResponse,
    QueueHealthResponse,
    SystemErrorsResponse,
    SystemHealthOverviewResponse,
)

router = APIRouter(prefix="/admin/health", tags=["admin-health"])


def _get_service(db: AsyncSession = Depends(get_db)) -> SystemHealthService:
    return SystemHealthService(db)


@router.get("/overview", response_model=SystemHealthOverviewResponse)
async def get_health_overview(
    _current_user: AdminOnly,
    service: SystemHealthService = Depends(_get_service),
) -> SystemHealthOverviewResponse:
    return SystemHealthOverviewResponse.model_validate(await service.get_overview())


@router.get("/ai-usage", response_model=AIUsageSummaryResponse)
async def get_ai_usage(
    _current_user: AdminOnly,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    provider: str | None = Query(default=None),
    model: str | None = Query(default=None),
    service: SystemHealthService = Depends(_get_service),
) -> AIUsageSummaryResponse:
    return AIUsageSummaryResponse.model_validate(
        await service.get_ai_usage(
            AIUsageQuery(
                date_from=date_from,
                date_to=date_to,
                provider=provider,
                model=model,
            )
        )
    )


@router.get("/queues", response_model=QueueHealthResponse)
async def get_queue_health(
    _current_user: AdminOnly,
    service: SystemHealthService = Depends(_get_service),
) -> QueueHealthResponse:
    return QueueHealthResponse.model_validate(await service.get_queues())


@router.get("/database", response_model=DatabaseHealthResponse)
async def get_database_health(
    _current_user: AdminOnly,
    service: SystemHealthService = Depends(_get_service),
) -> DatabaseHealthResponse:
    return DatabaseHealthResponse.model_validate(await service.get_database())


@router.get("/errors", response_model=SystemErrorsResponse)
async def get_system_errors(
    _current_user: AdminOnly,
    service: SystemHealthService = Depends(_get_service),
) -> SystemErrorsResponse:
    return SystemErrorsResponse.model_validate(await service.get_errors())
