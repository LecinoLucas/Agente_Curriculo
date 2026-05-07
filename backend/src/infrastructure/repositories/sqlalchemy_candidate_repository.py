from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
)
from src.domain.entities.candidate import Candidate as CandidateEntity
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel

_VISIBLE_PIPELINE_LINK_STATUSES = ("active", "hired", "rejected")
_VISIBLE_PIPELINE_STATUSES = ("active", "terminal")


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
            sa.select(sa.func.count(sa.distinct(CandidateJobPipelineModel.job_id)))
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                JobModel.deleted_at.is_(None),
                CandidateJobPipelineModel.pipeline_status.in_(_VISIBLE_PIPELINE_STATUSES),
                CandidateJobPipelineModel.link_status.in_(_VISIBLE_PIPELINE_LINK_STATUSES),
            )
            .correlate(CandidateModel)
            .scalar_subquery()
        )
        active_job_title_sq = (
            sa.select(JobModel.title)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.pipeline_status.in_(_VISIBLE_PIPELINE_STATUSES),
                CandidateJobPipelineModel.link_status.in_(_VISIBLE_PIPELINE_LINK_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(
                CandidateJobPipelineModel.updated_at.desc(),
                CandidateJobPipelineModel.match_score.desc().nulls_last(),
            )
            .limit(1)
            .scalar_subquery()
        )
        active_job_stage_sq = (
            sa.select(CandidateJobPipelineModel.pipeline_stage)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.pipeline_status.in_(_VISIBLE_PIPELINE_STATUSES),
                CandidateJobPipelineModel.link_status.in_(_VISIBLE_PIPELINE_LINK_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(
                CandidateJobPipelineModel.updated_at.desc(),
                CandidateJobPipelineModel.match_score.desc().nulls_last(),
            )
            .limit(1)
            .scalar_subquery()
        )
        active_job_match_score_sq = (
            sa.select(CandidateJobPipelineModel.match_score)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.pipeline_status.in_(_VISIBLE_PIPELINE_STATUSES),
                CandidateJobPipelineModel.link_status.in_(_VISIBLE_PIPELINE_LINK_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(
                CandidateJobPipelineModel.updated_at.desc(),
                CandidateJobPipelineModel.match_score.desc().nulls_last(),
            )
            .limit(1)
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
                active_job_title_sq.label("active_job_title"),
                active_job_stage_sq.label("active_job_stage"),
                active_job_match_score_sq.label("active_job_match_score"),
                ai_status_sq.label("ai_status"),
                ai_score_sq.label("ai_score"),
            )
            .where(*filters)
            .order_by(CandidateModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return [dict(row) for row in result.mappings().all()], total

    async def save(self, candidate: CandidateModel | CandidateEntity) -> CandidateModel:
        if isinstance(candidate, CandidateEntity):
            created_by = candidate.created_by
            if isinstance(created_by, str):
                created_by = UUID(created_by)
            user_id = candidate.user_id
            if isinstance(user_id, str):
                user_id = UUID(user_id)

            model = await self._session.scalar(
                sa.select(CandidateModel).where(CandidateModel.id == candidate.id)
            )
            if model is None:
                model = CandidateModel(
                    id=candidate.id,
                    user_id=user_id,
                    full_name=candidate.full_name,
                    email=candidate.email,
                    phone=candidate.phone,
                    location_city=candidate.location_city,
                    location_state=candidate.location_state,
                    location_country=candidate.location_country,
                    linkedin_url=candidate.linkedin_url,
                    github_url=candidate.github_url,
                    portfolio_url=candidate.portfolio_url,
                    cpf=getattr(candidate, "cpf", None),
                    internal_notes=candidate.internal_notes,
                    tags=list(candidate.tags or []),
                    created_by=created_by,
                    created_at=candidate.created_at,
                    updated_at=candidate.updated_at,
                    deleted_at=candidate.deleted_at,
                    data_quality_status=getattr(candidate, "data_quality_status", "unknown"),
                    data_quality_reason=getattr(candidate, "data_quality_reason", None),
                    data_quality_marked_at=getattr(candidate, "data_quality_marked_at", None),
                )
                self._session.add(model)
            else:
                model.user_id = user_id
                model.full_name = candidate.full_name
                model.email = candidate.email
                model.phone = candidate.phone
                model.location_city = candidate.location_city
                model.location_state = candidate.location_state
                model.location_country = candidate.location_country
                model.linkedin_url = candidate.linkedin_url
                model.github_url = candidate.github_url
                model.portfolio_url = candidate.portfolio_url
                model.internal_notes = candidate.internal_notes
                model.tags = list(candidate.tags or [])
                model.updated_at = candidate.updated_at
                model.deleted_at = candidate.deleted_at
                model.data_quality_status = getattr(candidate, "data_quality_status", model.data_quality_status)
                model.data_quality_reason = getattr(candidate, "data_quality_reason", model.data_quality_reason)
                model.data_quality_marked_at = getattr(
                    candidate,
                    "data_quality_marked_at",
                    model.data_quality_marked_at,
                )
            candidate = model

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

    async def find_latest_analysis_summary_for_job(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> dict | None:
        total_tokens = (
            sa.func.coalesce(AnalysisResultModel.input_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.output_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_read_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_write_tokens, 0)
        )
        row = await self._session.execute(
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                AnalysisModel.job_id.label("job_id"),
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
                AnalysisModel.job_id == job_id,
            )
            .order_by(AnalysisModel.created_at.desc(), AnalysisModel.updated_at.desc())
            .limit(1)
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def find_latest_analysis_summary(
        self,
        candidate_id: UUID,
    ) -> dict | None:
        total_tokens = (
            sa.func.coalesce(AnalysisResultModel.input_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.output_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_read_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_write_tokens, 0)
        )
        row = await self._session.execute(
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                AnalysisModel.job_id.label("job_id"),
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

    async def find_candidate_job_match_for_analysis(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> CandidateJobMatchModel | None:
        context_sq = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                ResumeModel.deleted_at.is_(None),
            )
            .subquery()
        )
        return await self._session.scalar(
            sa.select(CandidateJobMatchModel)
            .join(
                context_sq,
                sa.and_(
                    CandidateJobMatchModel.candidate_id == context_sq.c.candidate_id,
                    CandidateJobMatchModel.resume_version_id == context_sq.c.resume_version_id,
                ),
            )
            .where(CandidateJobMatchModel.job_id == job_id)
            .order_by(CandidateJobMatchModel.created_at.desc())
        )

    async def list_top_job_matches(self, candidate_id: UUID, limit: int = 5) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.current_analysis_id.label("analysis_id"),
                CandidateJobMatchModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                CandidateJobMatchModel.match_score,
                CandidateJobMatchModel.recommendation,
                AnalysisResultModel.overall_score,
                CandidateProfileAnalysisModel.seniority_level,
                CandidateProfileAnalysisModel.experience_years.label("total_experience_years"),
                CandidateJobMatchModel.created_at,
            )
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == candidate_id,
                    CandidateJobPipelineModel.job_id == CandidateJobMatchModel.job_id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                    CandidateJobPipelineModel.link_status == "active",
                ),
            )
            .join(
                CandidateProfileAnalysisModel,
                CandidateProfileAnalysisModel.id == CandidateJobMatchModel.candidate_profile_analysis_id,
            )
            .join(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == CandidateJobPipelineModel.current_analysis_id,
                isouter=True,
            )
            .where(
                CandidateJobMatchModel.candidate_id == candidate_id,
                JobModel.deleted_at.is_(None),
            )
            .order_by(
                CandidateJobMatchModel.match_score.desc().nulls_last(),
                CandidateJobMatchModel.created_at.desc(),
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
        context_sq = (
            sa.select(
                ResumeModel.candidate_id.label("candidate_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                ResumeModel.deleted_at.is_(None),
            )
            .subquery()
        )
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(CandidateJobMatchModel)
                    .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
                    .join(
                        context_sq,
                        sa.and_(
                            CandidateJobMatchModel.candidate_id == context_sq.c.candidate_id,
                            CandidateJobMatchModel.resume_version_id == context_sq.c.resume_version_id,
                        ),
                    )
                    .where(
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
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.match_score,
                CandidateJobPipelineModel.updated_at,
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.pipeline_status.in_(_VISIBLE_PIPELINE_STATUSES),
                CandidateJobPipelineModel.link_status.in_(_VISIBLE_PIPELINE_LINK_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .order_by(
                CandidateJobPipelineModel.updated_at.desc(),
                CandidateJobPipelineModel.match_score.desc().nulls_last(),
            )
        )
        return [dict(row) for row in result.mappings().all()]
