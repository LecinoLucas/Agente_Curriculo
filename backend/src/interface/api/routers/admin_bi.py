from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admin_bi_service import AdminBIService, BIOverviewQuery
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.admin_bi_schemas import BIOverviewResponse

router = APIRouter(prefix="/admin/bi", tags=["admin-bi"])


def _get_service(db: AsyncSession = Depends(get_db)) -> AdminBIService:
    return AdminBIService(db)


@router.get("/overview", response_model=BIOverviewResponse)
async def get_bi_overview(
    _current_user: AdminOnly,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    job_id: UUID | None = Query(default=None),
    job_area: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    service: AdminBIService = Depends(_get_service),
) -> BIOverviewResponse:
    payload = await service.get_overview(
        BIOverviewQuery(
            date_from=date_from,
            date_to=date_to,
            job_id=job_id,
            job_area=job_area,
            provider=provider,
        )
    )
    return BIOverviewResponse.model_validate(payload)
