from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel


class SQLAlchemyCandidateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, candidate: CandidateModel) -> CandidateModel:
        self._session.add(candidate)
        await self._session.flush()
        await self._session.refresh(candidate)
        return candidate

    async def find_active_by_id(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def find_active_by_email(self, email: str) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.email == email,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def find_active_by_cpf(self, cpf: str) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.cpf == cpf,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def list_active(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
    ) -> tuple[list[CandidateModel], int]:
        filters = [CandidateModel.deleted_at.is_(None)]
        if search:
            term = f"%{search.lower().strip()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(CandidateModel.full_name).like(term),
                    sa.func.lower(CandidateModel.email).like(term),
                )
            )

        total = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count()).select_from(CandidateModel).where(*filters)
                )
            )
            or 0
        )
        offset = (page - 1) * page_size
        result = await self._session.execute(
            sa.select(CandidateModel)
            .where(*filters)
            .order_by(CandidateModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def list_summaries(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        has_resume: bool | None = None,
        ai_status_filter: list[str] | None = None,
    ) -> tuple[list[dict], int]:
        resume_count_sq = (
            sa.select(sa.func.count(ResumeModel.id))
            .where(
                ResumeModel.candidate_id == CandidateModel.id,
                ResumeModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .scalar_subquery()
        )
        linked_job_count_sq = (
            sa.select(sa.func.count(sa.distinct(CandidatePipelineModel.job_id)))
            .join(JobModel, JobModel.id == CandidatePipelineModel.job_id)
            .where(
                CandidatePipelineModel.candidate_id == CandidateModel.id,
                JobModel.deleted_at.is_(None),
                sa.or_(
                    CandidatePipelineModel.status.is_(None),
                    CandidatePipelineModel.status != "transferred",
                ),
            )
            .correlate(CandidateModel)
            .scalar_subquery()
        )
        ai_status_sq = (
            sa.select(AnalysisModel.status)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.candidate_id == CandidateModel.id,
                ResumeModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(AnalysisModel.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        ai_score_sq = (
            sa.select(AnalysisResultModel.overall_score)
            .join(AnalysisModel, AnalysisModel.id == AnalysisResultModel.analysis_id)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.candidate_id == CandidateModel.id,
                ResumeModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(AnalysisModel.created_at.desc())
            .limit(1)
            .scalar_subquery()
        )

        filters = [CandidateModel.deleted_at.is_(None)]
        if search:
            term = f"%{search.lower().strip()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(CandidateModel.full_name).like(term),
                    sa.func.lower(CandidateModel.email).like(term),
                )
            )
        if has_resume is True:
            filters.append(resume_count_sq > 0)
        elif has_resume is False:
            filters.append(resume_count_sq == 0)
        if ai_status_filter:
            filters.append(ai_status_sq.in_(ai_status_filter))

        total = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(CandidateModel)
                    .where(*filters)
                )
            )
            or 0
        )

        offset = (page - 1) * page_size
        result = await self._session.execute(
            sa.select(
                CandidateModel.id,
                CandidateModel.full_name,
                CandidateModel.email,
                CandidateModel.phone,
                CandidateModel.cpf,
                CandidateModel.tags,
                CandidateModel.created_at,
                resume_count_sq.label("resume_count"),
                linked_job_count_sq.label("linked_job_count"),
                ai_status_sq.label("ai_status"),
                ai_score_sq.label("ai_score"),
            )
            .where(*filters)
            .order_by(CandidateModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return [dict(row) for row in result.mappings().all()], total

    async def save(self, candidate: CandidateModel) -> CandidateModel:
        await self._session.flush()
        await self._session.refresh(candidate)
        return candidate

    async def list_resume_summaries(self, candidate_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                ResumeModel.id.label("resume_id"),
                ResumeModel.title,
                ResumeModel.status,
                ResumeModel.current_version,
                ResumeVersionModel.id.label("current_version_id"),
                ResumeVersionModel.original_file_name.label("current_file_name"),
                ResumeVersionModel.extraction_status,
                ResumeModel.updated_at,
            )
            .join(
                ResumeVersionModel,
                sa.and_(
                    ResumeVersionModel.resume_id == ResumeModel.id,
                    ResumeVersionModel.version_number == ResumeModel.current_version,
                ),
                isouter=True,
            )
            .where(
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
            )
            .order_by(ResumeModel.updated_at.desc(), ResumeModel.created_at.desc())
        )
        return [dict(row) for row in result.mappings().all()]

    async def find_latest_analysis_summary(self, candidate_id: UUID) -> dict | None:
        total_tokens = (
            sa.func.coalesce(AnalysisResultModel.input_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.output_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_read_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_write_tokens, 0)
        )
        row = await self._session.execute(
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                ResumeModel.id.label("resume_id"),
                ResumeModel.title.label("resume_title"),
                AnalysisModel.status,
                AnalysisModel.started_at,
                AnalysisModel.completed_at,
                AnalysisModel.failed_at,
                AnalysisModel.failure_reason,
                AnalysisModel.task_id,
                AnalysisModel.worker_id,
                sa.case(
                    (AnalysisResultModel.id.is_(None), None),
                    (total_tokens > 0, True),
                    else_=False,
                ).label("used_real_ai"),
                AnalysisResultModel.overall_score,
                AnalysisResultModel.seniority_level,
                AnalysisResultModel.total_experience_years,
                AnalysisModel.created_at,
                AnalysisModel.updated_at,
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == AnalysisModel.id,
                isouter=True,
            )
            .where(
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
            )
            .order_by(AnalysisModel.created_at.desc(), AnalysisModel.updated_at.desc())
            .limit(1)
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def list_top_job_matches(self, candidate_id: UUID, limit: int = 5) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                ResumeJobMatchModel.analysis_id,
                ResumeJobMatchModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                ResumeJobMatchModel.match_score,
                ResumeJobMatchModel.recommendation,
                AnalysisResultModel.overall_score,
                AnalysisResultModel.seniority_level,
                AnalysisResultModel.total_experience_years,
                ResumeJobMatchModel.created_at,
            )
            .join(AnalysisModel, AnalysisModel.id == ResumeJobMatchModel.analysis_id)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(JobModel, JobModel.id == ResumeJobMatchModel.job_id)
            .join(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == AnalysisModel.id,
                isouter=True,
            )
            .where(
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .order_by(
                ResumeJobMatchModel.match_score.desc().nulls_last(),
                ResumeJobMatchModel.created_at.desc(),
            )
            .limit(limit)
        )
        return [dict(row) for row in result.mappings().all()]

    async def count_published_jobs(self) -> int:
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(JobModel)
                    .where(
                        JobModel.status == "published",
                        JobModel.deleted_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def count_published_matches_for_analysis(self, analysis_id: UUID) -> int:
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(ResumeJobMatchModel)
                    .join(JobModel, JobModel.id == ResumeJobMatchModel.job_id)
                    .where(
                        ResumeJobMatchModel.analysis_id == analysis_id,
                        JobModel.status == "published",
                        JobModel.deleted_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def list_pipeline_entries(self, candidate_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidatePipelineModel.candidate_id,
                CandidatePipelineModel.job_id,
                JobModel.title.label("job_title"),
                CandidatePipelineModel.stage,
                CandidatePipelineModel.match_score,
                CandidatePipelineModel.updated_at,
            )
            .join(JobModel, JobModel.id == CandidatePipelineModel.job_id)
            .where(
                CandidatePipelineModel.candidate_id == candidate_id,
                JobModel.deleted_at.is_(None),
                sa.or_(
                    CandidatePipelineModel.status.is_(None),
                    CandidatePipelineModel.status != "transferred",
                ),
            )
            .order_by(
                CandidatePipelineModel.updated_at.desc(),
                CandidatePipelineModel.match_score.desc().nulls_last(),
            )
        )
        return [dict(row) for row in result.mappings().all()]
