from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.dashboard_service import DashboardService
from src.infrastructure.repositories.sqlalchemy_dashboard_repository import SQLAlchemyDashboardRepository
from src.interface.api.dependencies import InternalUser, get_db
from src.interface.api.schemas.dashboard_schemas import DashboardStatsResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

def _service(db: AsyncSession) -> DashboardService:
    return DashboardService(SQLAlchemyDashboardRepository(db))

@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    current_user: InternalUser,
    db: AsyncSession = Depends(get_db),
) -> DashboardStatsResponse:
    return await _service(db).get_stats()
