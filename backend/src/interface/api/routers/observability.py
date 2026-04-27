from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.observability.metrics_service import PipelineMetricsService

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/metrics")
async def get_pipeline_metrics(
    current_user: RecruiterOrAdmin,
    window_hours: int = Query(default=24, ge=1, le=24 * 30),
    db: AsyncSession = Depends(get_db),
) -> dict:
    service = PipelineMetricsService(db)
    return await service.get_metrics(window_hours=window_hours)


@router.get("/traces/{correlation_id}")
async def get_trace_by_correlation(
    correlation_id: str,
    current_user: RecruiterOrAdmin,
    limit: int = Query(default=500, ge=1, le=5000),
    db: AsyncSession = Depends(get_db),
) -> dict:
    service = PipelineMetricsService(db)
    return await service.get_trace_by_correlation(correlation_id=correlation_id, limit=limit)
