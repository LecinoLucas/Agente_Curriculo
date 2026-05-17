import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel


class SQLAlchemyDashboardRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_scalar_counts(self) -> dict[str, int]:
        """Four dashboard counters in one round-trip via scalar subqueries."""
        _active = sa.and_(
            CandidateJobPipelineModel.relationship_status == "active",
            CandidateJobPipelineModel.is_terminal.is_(False),
        )

        total_sq = (
            sa.select(sa.func.count(CandidateModel.id))
            .where(CandidateModel.deleted_at.is_(None))
            .scalar_subquery()
        )
        waiting_sq = (
            sa.select(sa.func.count(CandidateModel.id))
            .where(
                CandidateModel.deleted_at.is_(None),
                CandidateModel.id.not_in(
                    sa.select(CandidateJobPipelineModel.candidate_id).where(_active)
                ),
            )
            .scalar_subquery()
        )
        open_jobs_sq = (
            sa.select(sa.func.count(JobModel.id))
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
            )
            .scalar_subquery()
        )
        in_pipeline_sq = (
            sa.select(sa.func.count(sa.distinct(CandidateJobPipelineModel.candidate_id)))
            .where(_active)
            .scalar_subquery()
        )

        row = (
            await self._session.execute(
                sa.select(
                    total_sq.label("total_candidates"),
                    waiting_sq.label("candidates_waiting_job"),
                    open_jobs_sq.label("open_jobs"),
                    in_pipeline_sq.label("candidates_in_pipeline"),
                )
            )
        ).one()

        return {
            "total_candidates": row.total_candidates or 0,
            "candidates_waiting_job": row.candidates_waiting_job or 0,
            "open_jobs": row.open_jobs or 0,
            "candidates_in_pipeline": row.candidates_in_pipeline or 0,
        }

    async def get_candidates_by_stage(self) -> dict[str, int]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.pipeline_stage,
                sa.func.count(CandidateJobPipelineModel.candidate_id),
            )
            .where(
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
            )
            .group_by(CandidateJobPipelineModel.pipeline_stage)
        )
        return {row[0]: row[1] for row in result.all()}

    async def get_recent_analyses(self, limit: int = 10) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                AnalysisModel.id,
                CandidateModel.full_name.label("candidate_name"),
                JobModel.title.label("job_title"),
                AnalysisModel.status,
                AnalysisModel.created_at,
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .outerjoin(JobModel, JobModel.id == AnalysisModel.job_id)
            .order_by(AnalysisModel.created_at.desc())
            .limit(limit)
        )
        return [dict(row) for row in result.mappings().all()]
