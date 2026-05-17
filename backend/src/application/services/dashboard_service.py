from src.infrastructure.repositories.sqlalchemy_dashboard_repository import SQLAlchemyDashboardRepository
from src.interface.api.schemas.dashboard_schemas import DashboardStatsResponse, RecentAnalysis


class DashboardService:
    def __init__(self, repository: SQLAlchemyDashboardRepository) -> None:
        self._repository = repository

    async def get_stats(self) -> DashboardStatsResponse:
        counts = await self._repository.get_scalar_counts()
        by_stage = await self._repository.get_candidates_by_stage()
        recent_raw = await self._repository.get_recent_analyses(limit=5)

        recent_analyses = [
            RecentAnalysis(
                id=row["id"],
                candidate_name=row["candidate_name"],
                job_title=row["job_title"] or "N/A",
                status=row["status"],
                created_at=row["created_at"],
            )
            for row in recent_raw
        ]

        return DashboardStatsResponse(
            total_candidates=counts["total_candidates"],
            candidates_waiting_job=counts["candidates_waiting_job"],
            open_jobs=counts["open_jobs"],
            candidates_in_pipeline=counts["candidates_in_pipeline"],
            candidates_by_stage=by_stage,
            recent_analyses=recent_analyses,
        )
