from dataclasses import dataclass
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    MatchingObservationModel,
)
from src.domain.entities.candidate import Candidate as CandidateEntity
from src.infrastructure.database.models.admission_model import Admission, CandidateDocument
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.document_ai_analysis_model import DocumentAIAnalysisModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreFactorModel,
    CandidateJobScoreModel,
    CandidateJobScoreSnapshotModel,
    ScoreModelVersionModel,
)
from src.infrastructure.repositories.base_soft_delete_repository import BaseSoftDeleteRepository

_ACTIVE_RELATIONSHIP_STATUS = "active"
_VISIBLE_RELATIONSHIP_STATUSES = ("active", "hired", "rejected")
_CRITICAL_PIPELINE_STAGES = ("final", "offer", "hired", "rejected")
_CRITICAL_RELATIONSHIP_STATUSES = ("hired", "rejected")
_CRITICAL_ADMISSION_STATUSES = ("in_progress", "approved")


@dataclass(frozen=True)
class CandidateDeleteSummary:
    linked_jobs_count: int
    analyses_count: int
    resume_s3_keys: tuple[str, ...]
    candidate_document_paths: tuple[str, ...]
    has_final_decision: bool
    has_hiring_record: bool


class SQLAlchemyCandidateRepository(BaseSoftDeleteRepository[CandidateModel]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, CandidateModel)

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
        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        resume_count_sq = (
            sa.select(sa.func.count(sa.distinct(ResumeModel.id)))
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
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
            )
            .correlate(CandidateModel)
            .scalar_subquery()
        )
        latest_job_id_sq = (
            sa.select(CandidateJobPipelineModel.job_id)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        latest_job_title_sq = (
            sa.select(JobModel.title)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        latest_job_stage_sq = (
            sa.select(CandidateJobPipelineModel.pipeline_stage)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        latest_relationship_status_sq = (
            sa.select(CandidateJobPipelineModel.relationship_status)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        active_job_id_sq = (
            sa.select(CandidateJobPipelineModel.job_id)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status == _ACTIVE_RELATIONSHIP_STATUS,
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        active_job_title_sq = (
            sa.select(JobModel.title)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status == _ACTIVE_RELATIONSHIP_STATUS,
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        active_job_stage_sq = (
            sa.select(CandidateJobPipelineModel.pipeline_stage)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status == _ACTIVE_RELATIONSHIP_STATUS,
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(CandidateJobPipelineModel.updated_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        active_job_job_fit_score_sq = (
            sa.select(CandidateJobScoreModel.final_score)
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .join(
                CandidateJobScoreModel,
                sa.and_(
                    CandidateJobScoreModel.candidate_id == CandidateJobPipelineModel.candidate_id,
                    CandidateJobScoreModel.job_id == CandidateJobPipelineModel.job_id,
                    CandidateJobScoreModel.version_id == active_score_version,
                    CandidateJobScoreModel.freshness_status == "fresh",
                ),
            )
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status == _ACTIVE_RELATIONSHIP_STATUS,
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .order_by(
                CandidateJobPipelineModel.updated_at.desc(),
                CandidateJobScoreModel.final_score.desc().nulls_last(),
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
                AnalysisModel.status != "discarded",
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
                latest_job_id_sq.label("latest_job_id"),
                latest_job_title_sq.label("latest_job_title"),
                latest_job_stage_sq.label("latest_job_stage"),
                latest_relationship_status_sq.label("latest_relationship_status"),
                active_job_id_sq.label("active_job_id"),
                active_job_title_sq.label("active_job_title"),
                active_job_stage_sq.label("active_job_stage"),
                active_job_job_fit_score_sq.label("active_job_job_fit_score"),
                ai_status_sq.label("ai_status"),
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
                AnalysisModel.status != "discarded",
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
                AnalysisModel.status != "discarded",
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
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .join(
                context_sq,
                sa.and_(
                    CandidateJobMatchModel.candidate_id == context_sq.c.candidate_id,
                    CandidateJobMatchModel.resume_version_id == context_sq.c.resume_version_id,
                ),
            )
            .where(
                CandidateJobMatchModel.job_id == job_id,
                CandidateJobMatchModel.freshness_status == "fresh",
                CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .order_by(
                sa.func.coalesce(
                    CandidateJobMatchModel.updated_at,
                    CandidateJobMatchModel.created_at,
                ).desc(),
                CandidateJobMatchModel.id.desc(),
            )
        )

    async def list_top_job_matches(self, candidate_id: UUID, limit: int = 5) -> list[dict]:
        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.current_analysis_id.label("analysis_id"),
                CandidateJobMatchModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                CandidateJobScoreModel.final_score.label("job_fit_score"),
                CandidateJobMatchModel.recommendation,
                CandidateProfileAnalysisModel.seniority_level,
                CandidateProfileAnalysisModel.experience_years.label("total_experience_years"),
                CandidateJobMatchModel.created_at,
            )
            .join(JobModel, JobModel.id == CandidateJobMatchModel.job_id)
            .join(
                JobProfileAnalysisModel,
                JobProfileAnalysisModel.id == CandidateJobMatchModel.job_profile_analysis_id,
            )
            .join(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == candidate_id,
                    CandidateJobPipelineModel.job_id == CandidateJobMatchModel.job_id,
                    CandidateJobPipelineModel.relationship_status == _ACTIVE_RELATIONSHIP_STATUS,
                    CandidateJobPipelineModel.is_terminal.is_(False),
                    CandidateJobPipelineModel.terminated_at.is_(None),
                ),
            )
            .join(
                CandidateProfileAnalysisModel,
                CandidateProfileAnalysisModel.id == CandidateJobMatchModel.candidate_profile_analysis_id,
            )
            .outerjoin(
                CandidateJobScoreModel,
                sa.and_(
                    CandidateJobScoreModel.candidate_id == candidate_id,
                    CandidateJobScoreModel.job_id == CandidateJobMatchModel.job_id,
                    CandidateJobScoreModel.version_id == active_score_version,
                    CandidateJobScoreModel.freshness_status == "fresh",
                ),
            )
            .where(
                CandidateJobMatchModel.candidate_id == candidate_id,
                JobModel.deleted_at.is_(None),
                CandidateJobMatchModel.freshness_status == "fresh",
                CandidateJobMatchModel.job_signature_hash == JobModel.job_profile_hash,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .order_by(
                CandidateJobScoreModel.final_score.desc().nulls_last(),
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
                CandidateJobPipelineModel.relationship_status,
                CandidateJobPipelineModel.is_terminal,
                CandidateJobPipelineModel.terminated_at,
                CandidateJobPipelineModel.termination_reason,
                CandidateJobPipelineModel.updated_at,
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                JobModel.deleted_at.is_(None),
            )
            .order_by(CandidateJobPipelineModel.updated_at.desc())
        )
        return [dict(row) for row in result.mappings().all()]

    async def get_delete_summary(self, candidate_id: UUID) -> CandidateDeleteSummary:
        linked_jobs_count = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count(sa.distinct(CandidateJobPipelineModel.job_id))).where(
                        CandidateJobPipelineModel.candidate_id == candidate_id
                    )
                )
            )
            or 0
        )
        analyses_count = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count(AnalysisModel.id))
                    .select_from(AnalysisModel)
                    .join(
                        ResumeVersionModel,
                        ResumeVersionModel.id == AnalysisModel.resume_version_id,
                    )
                    .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
                    .where(ResumeModel.candidate_id == candidate_id)
                )
            )
            or 0
        )

        resume_s3_keys_result = await self._session.scalars(
            sa.select(ResumeVersionModel.s3_key)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(ResumeModel.candidate_id == candidate_id)
        )
        resume_s3_keys = tuple(dict.fromkeys(key for key in resume_s3_keys_result.all() if key))

        document_paths_result = await self._session.scalars(
            sa.select(CandidateDocument.file_path)
            .join(Admission, Admission.id == CandidateDocument.admission_id)
            .where(Admission.candidate_id == candidate_id)
        )
        candidate_document_paths = tuple(
            dict.fromkeys(path for path in document_paths_result.all() if path)
        )

        current_pipeline_final_decision = bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .select_from(CandidateJobPipelineModel)
                .where(
                    CandidateJobPipelineModel.candidate_id == candidate_id,
                    sa.or_(
                        CandidateJobPipelineModel.pipeline_stage.in_(
                            _CRITICAL_PIPELINE_STAGES
                        ),
                        CandidateJobPipelineModel.relationship_status.in_(
                            _CRITICAL_RELATIONSHIP_STATUSES
                        ),
                    ),
                )
                .limit(1)
            )
        )
        has_hiring_record = bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .select_from(Admission)
                .where(
                    Admission.candidate_id == candidate_id,
                    Admission.status.in_(_CRITICAL_ADMISSION_STATUSES),
                )
                .limit(1)
            )
        )

        return CandidateDeleteSummary(
            linked_jobs_count=linked_jobs_count,
            analyses_count=analyses_count,
            resume_s3_keys=resume_s3_keys,
            candidate_document_paths=candidate_document_paths,
            has_final_decision=current_pipeline_final_decision,
            has_hiring_record=has_hiring_record,
        )

    async def hard_delete(self, candidate_id: UUID) -> None:
        resume_ids_sq = (
            sa.select(ResumeModel.id)
            .where(ResumeModel.candidate_id == candidate_id)
            .subquery()
        )
        resume_version_ids_sq = (
            sa.select(ResumeVersionModel.id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(ResumeModel.candidate_id == candidate_id)
            .subquery()
        )
        analysis_ids_sq = (
            sa.select(AnalysisModel.id)
            .join(
                ResumeVersionModel,
                ResumeVersionModel.id == AnalysisModel.resume_version_id,
            )
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(ResumeModel.candidate_id == candidate_id)
            .subquery()
        )
        admission_ids_sq = (
            sa.select(Admission.id)
            .where(Admission.candidate_id == candidate_id)
            .subquery()
        )
        document_ids_sq = (
            sa.select(CandidateDocument.id)
            .where(
                CandidateDocument.admission_id.in_(sa.select(admission_ids_sq.c.id))
            )
            .subquery()
        )
        snapshot_ids_sq = (
            sa.select(CandidateJobScoreSnapshotModel.id)
            .where(CandidateJobScoreSnapshotModel.candidate_id == candidate_id)
            .subquery()
        )

        await self._session.execute(
            sa.delete(DocumentAIAnalysisModel).where(
                DocumentAIAnalysisModel.document_id.in_(
                    sa.select(document_ids_sq.c.id)
                )
            )
        )
        await self._session.execute(
            sa.delete(CandidateDocument).where(
                CandidateDocument.admission_id.in_(sa.select(admission_ids_sq.c.id))
            )
        )
        await self._session.execute(
            sa.delete(Admission).where(Admission.candidate_id == candidate_id)
        )

        await self._session.execute(
            sa.delete(CandidateJobScoreFactorModel).where(
                CandidateJobScoreFactorModel.snapshot_id.in_(
                    sa.select(snapshot_ids_sq.c.id)
                )
            )
        )
        await self._session.execute(
            sa.delete(CandidateJobScoreSnapshotModel).where(
                CandidateJobScoreSnapshotModel.candidate_id == candidate_id
            )
        )
        await self._session.execute(
            sa.delete(CandidateJobScoreModel).where(
                CandidateJobScoreModel.candidate_id == candidate_id
            )
        )

        await self._session.execute(
            sa.delete(MatchingObservationModel).where(
                MatchingObservationModel.candidate_id == candidate_id
            )
        )
        await self._session.execute(
            sa.delete(CandidateJobMatchModel).where(
                CandidateJobMatchModel.candidate_id == candidate_id
            )
        )
        await self._session.execute(
            sa.delete(CandidateProfileAnalysisModel).where(
                CandidateProfileAnalysisModel.candidate_id == candidate_id
            )
        )
        await self._session.execute(
            sa.delete(CandidateJobPipelineEventModel).where(
                CandidateJobPipelineEventModel.candidate_id == candidate_id
            )
        )
        await self._session.execute(
            sa.delete(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id
            )
        )
        await self._session.execute(
            sa.delete(AnalysisResultModel).where(
                AnalysisResultModel.analysis_id.in_(sa.select(analysis_ids_sq.c.id))
            )
        )
        await self._session.execute(
            sa.delete(AnalysisModel).where(AnalysisModel.id.in_(sa.select(analysis_ids_sq.c.id)))
        )
        await self._session.execute(
            sa.delete(ResumeVersionModel).where(
                ResumeVersionModel.id.in_(sa.select(resume_version_ids_sq.c.id))
            )
        )
        await self._session.execute(
            sa.delete(ResumeModel).where(ResumeModel.id.in_(sa.select(resume_ids_sq.c.id)))
        )
        await self._session.execute(
            sa.delete(CandidateModel).where(CandidateModel.id == candidate_id)
        )
        await self._session.flush()
