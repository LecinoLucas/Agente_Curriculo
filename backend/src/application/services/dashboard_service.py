from sqlalchemy.ext.asyncio import AsyncSession
from src.infrastructure.repositories.sqlalchemy_dashboard_repository import SQLAlchemyDashboardRepository
from src.interface.api.schemas.dashboard_schemas import DashboardStatsResponse, RecentAnalysis

class DashboardService:
    def __init__(self, repository: SQLAlchemyDashboardRepository) -> None:
        self._repository = repository

    async def get_stats(self) -> DashboardStatsResponse:
        total_candidates = await self._repository.get_total_candidates()
        candidates_waiting = await self._repository.get_candidates_waiting_job()
        open_jobs = await self._repository.get_open_jobs_count()
        in_pipeline = await self._repository.get_candidates_in_pipeline_count()
        by_stage = await self._repository.get_candidates_by_stage()
        recent_raw = await self._repository.get_recent_analyses(limit=5)
        
        recent_analyses = [
            RecentAnalysis(
                id=row["id"],
                candidate_name=row["candidate_name"],
                job_title=row["job_title"] or "N/A",
                status=row["status"],
                created_at=row["created_at"]
            )
            for row in recent_raw
        ]
        
        return DashboardStatsResponse(
            total_candidates=total_candidates,
            candidates_waiting_job=candidates_waiting,
            open_jobs=open_jobs,
            candidates_in_pipeline=in_pipeline,
            candidates_by_stage=by_stage,
            recent_analyses=recent_analyses
        )
