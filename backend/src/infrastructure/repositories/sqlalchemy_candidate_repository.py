from dataclasses import dataclass
import re
import time
from uuid import UUID

import structlog
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    MatchingObservationModel,
)
from src.domain.entities.candidate import Candidate as CandidateEntity
from src.infrastructure.database.models.behavioral_assignment_model import (
    BehavioralAssessmentAIEvaluationModel,
    BehavioralAssessmentAssignmentModel,
)
from src.infrastructure.database.models.admission_model import Admission, CandidateDocument
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_note_model import CandidateNoteModel
from src.infrastructure.database.models.document_ai_analysis_model import DocumentAIAnalysisModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionChecklistItemModel,
)
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
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.base_soft_delete_repository import BaseSoftDeleteRepository

_ACTIVE_RELATIONSHIP_STATUS = "active"
_VISIBLE_RELATIONSHIP_STATUSES = ("active", "hired", "rejected")
_PORTAL_HISTORY_RELATIONSHIP_STATUSES = ("active", "hired", "rejected", "archived", "withdrawn")
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
        # Note: refresh() is not needed since we're providing explicit IDs and no server defaults
        # are required for testing. In production with PostgreSQL, this would fetch server-generated
        # timestamps, but with our explicit UUID + manual datetime handling, it's not necessary.
        return candidate

    async def find_active_by_id(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel)
            .where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
            .execution_options(populate_existing=True)
        )

    async def find_by_id(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def find_active_by_email(self, email: str) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel)
            .options(
                sa.orm.load_only(
                    CandidateModel.id,
                    CandidateModel.full_name,
                    CandidateModel.email,
                    CandidateModel.phone,
                    CandidateModel.cpf,
                    CandidateModel.location_city,
                    CandidateModel.location_state,
                    CandidateModel.location_country,
                    CandidateModel.application_source,
                    CandidateModel.password_hash,
                    CandidateModel.password_created_at,
                    CandidateModel.lgpd_consent_at,
                    CandidateModel.lgpd_consent_version,
                    CandidateModel.desired_contract_type,
                    CandidateModel.salary_expectation,
                    CandidateModel.google_sub,
                    CandidateModel.google_picture_url,
                    CandidateModel.last_login_at,
                    CandidateModel.works_at_marajo_group,
                )
            )
            .where(
                CandidateModel.email == email,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
        )

    async def find_active_by_cpf(self, cpf: str) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel)
            .options(
                sa.orm.load_only(
                    CandidateModel.id,
                    CandidateModel.full_name,
                    CandidateModel.email,
                    CandidateModel.phone,
                    CandidateModel.cpf,
                    CandidateModel.location_city,
                    CandidateModel.location_state,
                    CandidateModel.location_country,
                    CandidateModel.application_source,
                    CandidateModel.password_hash,
                    CandidateModel.password_created_at,
                    CandidateModel.lgpd_consent_at,
                    CandidateModel.lgpd_consent_version,
                    CandidateModel.desired_contract_type,
                    CandidateModel.salary_expectation,
                    CandidateModel.google_sub,
                    CandidateModel.google_picture_url,
                    CandidateModel.last_login_at,
                    CandidateModel.works_at_marajo_group,
                )
            )
            .where(
                CandidateModel.cpf == cpf,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
        )

    async def find_active_by_google_sub(self, google_sub: str) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel)
            .options(
                sa.orm.load_only(
                    CandidateModel.id,
                    CandidateModel.full_name,
                    CandidateModel.email,
                    CandidateModel.phone,
                    CandidateModel.cpf,
                    CandidateModel.location_city,
                    CandidateModel.location_state,
                    CandidateModel.location_country,
                    CandidateModel.application_source,
                    CandidateModel.password_hash,
                    CandidateModel.password_created_at,
                    CandidateModel.lgpd_consent_at,
                    CandidateModel.lgpd_consent_version,
                    CandidateModel.desired_contract_type,
                    CandidateModel.salary_expectation,
                    CandidateModel.google_sub,
                    CandidateModel.google_picture_url,
                    CandidateModel.last_login_at,
                    CandidateModel.works_at_marajo_group,
                )
            )
            .where(
                CandidateModel.google_sub == google_sub,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
        )
    async def list_active(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        archived: bool = False,
        *,
        application_source: str | None = None,
        city: str | None = None,
        state: str | None = None,
        salary_min: float | None = None,
        salary_max: float | None = None,
        desired_contract_type: str | None = None,
        link_status_filter: str | None = None,
        has_resume: bool | None = None,
        skill: str | None = None,
        seniority: str | None = None,
    ) -> tuple[list[CandidateModel], int]:
        filters = self._build_common_candidate_filters(
            search=search,
            archived=archived,
            application_source=application_source,
            has_resume=has_resume,
            city=city,
            state=state,
            salary_min=salary_min,
            salary_max=salary_max,
            desired_contract_type=desired_contract_type,
            link_status_filter=link_status_filter,
            skill=skill,
            seniority=seniority,
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
        archived: bool = False,
        *,
        application_source: str | None = None,
        city: str | None = None,
        state: str | None = None,
        salary_min: float | None = None,
        salary_max: float | None = None,
        desired_contract_type: str | None = None,
        link_status_filter: str | None = None,
        skill: str | None = None,
        seniority: str | None = None,
    ) -> tuple[list[dict], int]:
        # ── WHERE filters ─────────────────────────────────────────────────────
        filters = self._build_common_candidate_filters(
            search=search,
            archived=archived,
            application_source=application_source,
            has_resume=has_resume,
            city=city,
            state=state,
            salary_min=salary_min,
            salary_max=salary_max,
            desired_contract_type=desired_contract_type,
            link_status_filter=link_status_filter,
            skill=skill,
            seniority=seniority,
            ai_status_filter=ai_status_filter,
        )

        # ── COUNT (unchanged contract) ─────────────────────────────────────────
        _t0 = time.perf_counter()
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
        _count_ms = (time.perf_counter() - _t0) * 1000

        # ── CTE 1: paginated candidate base rows ───────────────────────────────
        # All enrichment CTEs reference this CTE's IDs, so they only scan rows
        # for the current page (≤ page_size candidates) instead of the full table.
        offset = (page - 1) * page_size
        page_cte = (
            sa.select(
                CandidateModel.id,
                CandidateModel.full_name,
                CandidateModel.email,
                CandidateModel.phone,
                CandidateModel.cpf,
                CandidateModel.tags,
                CandidateModel.created_at,
                CandidateModel.archived_at,
                CandidateModel.archive_reason,
                CandidateModel.application_source,
            )
            .where(*filters)
            .order_by(CandidateModel.created_at.desc())
            .limit(page_size)
            .offset(offset)
            .cte("page")
        )
        page_ids = sa.select(page_cte.c.id)

        # ── CTE 2: resume counts (one GROUP BY scan for all page candidates) ──
        resume_counts_cte = (
            sa.select(
                ResumeModel.candidate_id,
                sa.func.count(sa.distinct(ResumeModel.id)).label("cnt"),
            )
            .where(
                ResumeModel.deleted_at.is_(None),
                ResumeModel.candidate_id.in_(page_ids),
            )
            .group_by(ResumeModel.candidate_id)
            .cte("resume_counts")
        )

        # ── CTE 3: linked job counts (visible statuses) ────────────────────────
        linked_counts_cte = (
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                sa.func.count(sa.distinct(CandidateJobPipelineModel.job_id)).label("cnt"),
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                JobModel.deleted_at.is_(None),
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                CandidateJobPipelineModel.candidate_id.in_(page_ids),
            )
            .group_by(CandidateJobPipelineModel.candidate_id)
            .cte("linked_counts")
        )

        # ── CTE 4: latest visible pipeline per candidate (ROW_NUMBER) ──────────
        # Replaces 4 identical correlated subqueries that differed only by column.
        _latest_ranked = (
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                JobModel.title.label("job_title"),
                CandidateJobPipelineModel.pipeline_stage,
                CandidateJobPipelineModel.relationship_status,
                sa.func.row_number()
                .over(
                    partition_by=CandidateJobPipelineModel.candidate_id,
                    order_by=CandidateJobPipelineModel.updated_at.desc(),
                )
                .label("rn"),
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.relationship_status.in_(_VISIBLE_RELATIONSHIP_STATUSES),
                JobModel.deleted_at.is_(None),
                CandidateJobPipelineModel.candidate_id.in_(page_ids),
            )
            .subquery("latest_ranked")
        )
        latest_pipeline_cte = (
            sa.select(
                _latest_ranked.c.candidate_id,
                _latest_ranked.c.job_id.label("latest_job_id"),
                _latest_ranked.c.job_title.label("latest_job_title"),
                _latest_ranked.c.pipeline_stage.label("latest_job_stage"),
                _latest_ranked.c.relationship_status.label("latest_relationship_status"),
            )
            .where(_latest_ranked.c.rn == 1)
            .cte("latest_pipeline")
        )

        # ── CTE 5: active pipeline per candidate (ROW_NUMBER) ─────────────────
        # Replaces 3 identical correlated subqueries that differed only by column.
        _active_ranked = (
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                JobModel.title.label("job_title"),
                CandidateJobPipelineModel.pipeline_stage,
                sa.func.row_number()
                .over(
                    partition_by=CandidateJobPipelineModel.candidate_id,
                    order_by=CandidateJobPipelineModel.updated_at.desc(),
                )
                .label("rn"),
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.relationship_status == _ACTIVE_RELATIONSHIP_STATUS,
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
                JobModel.deleted_at.is_(None),
                CandidateJobPipelineModel.candidate_id.in_(page_ids),
            )
            .subquery("active_ranked")
        )
        active_pipeline_cte = (
            sa.select(
                _active_ranked.c.candidate_id,
                _active_ranked.c.job_id.label("active_job_id"),
                _active_ranked.c.job_title.label("active_job_title"),
                _active_ranked.c.pipeline_stage.label("active_job_stage"),
            )
            .where(_active_ranked.c.rn == 1)
            .cte("active_pipeline")
        )

        # ── CTE 6: fresh score for each candidate's active job ─────────────────
        # Joins to active_pipeline_cte so it scans only relevant score rows.
        # The unique constraint (candidate_id, job_id, version_id) guarantees
        # at most one fresh row per (candidate, active_job, version).
        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        score_cte = (
            sa.select(
                CandidateJobScoreModel.candidate_id,
                CandidateJobScoreModel.final_score,
            )
            .join(
                active_pipeline_cte,
                sa.and_(
                    CandidateJobScoreModel.candidate_id == active_pipeline_cte.c.candidate_id,
                    CandidateJobScoreModel.job_id == active_pipeline_cte.c.active_job_id,
                ),
            )
            .where(
                CandidateJobScoreModel.version_id == active_score_version,
                CandidateJobScoreModel.freshness_status == "fresh",
                CandidateJobScoreModel.final_score.is_not(None),
            )
            .cte("active_scores")
        )

        # ── CTE 7: latest non-discarded AI analysis status ─────────────────────
        _ai_ranked = (
            sa.select(
                ResumeModel.candidate_id,
                AnalysisModel.status,
                sa.func.row_number()
                .over(
                    partition_by=ResumeModel.candidate_id,
                    order_by=AnalysisModel.created_at.desc(),
                )
                .label("rn"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.deleted_at.is_(None),
                AnalysisModel.status != "discarded",
                ResumeModel.candidate_id.in_(page_ids),
            )
            .subquery("ai_ranked")
        )
        ai_status_cte = (
            sa.select(
                _ai_ranked.c.candidate_id,
                _ai_ranked.c.status.label("ai_status"),
            )
            .where(_ai_ranked.c.rn == 1)
            .cte("ai_statuses")
        )

        # ── Final query: LEFT JOIN all enrichment CTEs to the page ────────────
        _t1 = time.perf_counter()
        result = await self._session.execute(
            sa.select(
                page_cte.c.id,
                page_cte.c.full_name,
                page_cte.c.email,
                page_cte.c.phone,
                page_cte.c.cpf,
                page_cte.c.tags,
                page_cte.c.created_at,
                page_cte.c.archived_at,
                page_cte.c.archive_reason,
                page_cte.c.application_source,
                sa.func.coalesce(resume_counts_cte.c.cnt, 0).label("resume_count"),
                sa.func.coalesce(linked_counts_cte.c.cnt, 0).label("linked_job_count"),
                latest_pipeline_cte.c.latest_job_id,
                latest_pipeline_cte.c.latest_job_title,
                latest_pipeline_cte.c.latest_job_stage,
                latest_pipeline_cte.c.latest_relationship_status,
                active_pipeline_cte.c.active_job_id,
                active_pipeline_cte.c.active_job_title,
                active_pipeline_cte.c.active_job_stage,
                score_cte.c.final_score.label("active_job_job_fit_score"),
                ai_status_cte.c.ai_status,
            )
            .select_from(page_cte)
            .outerjoin(resume_counts_cte, resume_counts_cte.c.candidate_id == page_cte.c.id)
            .outerjoin(linked_counts_cte, linked_counts_cte.c.candidate_id == page_cte.c.id)
            .outerjoin(latest_pipeline_cte, latest_pipeline_cte.c.candidate_id == page_cte.c.id)
            .outerjoin(active_pipeline_cte, active_pipeline_cte.c.candidate_id == page_cte.c.id)
            .outerjoin(score_cte, score_cte.c.candidate_id == page_cte.c.id)
            .outerjoin(ai_status_cte, ai_status_cte.c.candidate_id == page_cte.c.id)
            .order_by(page_cte.c.created_at.desc())
        )
        rows = [dict(row) for row in result.mappings().all()]
        _data_ms = (time.perf_counter() - _t1) * 1000

        logger.debug(
            "candidate_summaries.query_timing",
            page=page,
            page_size=page_size,
            has_search=search is not None,
            has_resume=has_resume,
            has_ai_status_filter=bool(ai_status_filter),
            count_ms=round(_count_ms, 2),
            data_ms=round(_data_ms, 2),
            duration_ms=round(_count_ms + _data_ms, 2),
            result_count=len(rows),
            total=total,
        )
        return rows, total

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
                    archived_at=getattr(candidate, "archived_at", None),
                    archived_by=getattr(candidate, "archived_by", None),
                    archive_reason=getattr(candidate, "archive_reason", None),
                    archive_reason_note=getattr(candidate, "archive_reason_note", None),
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
                model.archived_at = getattr(candidate, "archived_at", model.archived_at)
                model.archived_by = getattr(candidate, "archived_by", model.archived_by)
                model.archive_reason = getattr(candidate, "archive_reason", model.archive_reason)
                model.archive_reason_note = getattr(candidate, "archive_reason_note", model.archive_reason_note)
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

    async def find_candidate_job_score_for_analysis(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> CandidateJobScoreModel | None:
        active_score_version = (
            sa.select(ScoreModelVersionModel.id)
            .where(ScoreModelVersionModel.is_active.is_(True))
            .limit(1)
            .scalar_subquery()
        )
        return await self._session.scalar(
            sa.select(CandidateJobScoreModel).where(
                CandidateJobScoreModel.source_analysis_id == analysis_id,
                CandidateJobScoreModel.job_id == job_id,
                CandidateJobScoreModel.version_id == active_score_version,
                CandidateJobScoreModel.freshness_status == "fresh",
                CandidateJobScoreModel.final_score.is_not(None),
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

    async def list_active_pipeline_entries(self, candidate_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                JobModel.title.label("job_title"),
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status,
                CandidateJobPipelineModel.relationship_status,
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.current_analysis_id,
                CandidateJobPipelineModel.resume_version_id,
                CandidateJobPipelineModel.entered_at,
                CandidateJobPipelineModel.updated_at,
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.link_status == "active",
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
                JobModel.deleted_at.is_(None),
            )
            .order_by(CandidateJobPipelineModel.updated_at.desc())
        )
        return [dict(row) for row in result.mappings().all()]

    async def find_analysis_summary_by_id_for_candidate(
        self,
        *,
        candidate_id: UUID,
        analysis_id: UUID,
    ) -> dict | None:
        row = await self._session.execute(
            sa.select(
                AnalysisModel.id.label("analysis_id"),
                AnalysisModel.job_id.label("job_id"),
                AnalysisModel.resume_version_id.label("resume_version_id"),
                AnalysisModel.status,
                AnalysisModel.created_at,
                AnalysisModel.updated_at,
                AnalysisModel.completed_at,
                AnalysisModel.failed_at,
                AnalysisModel.failure_reason,
                ResumeVersionModel.original_file_name.label("resume_file_name"),
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                AnalysisModel.id == analysis_id,
                AnalysisModel.status != "discarded",
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
            )
            .limit(1)
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def find_resume_file_name_by_version(
        self,
        *,
        candidate_id: UUID,
        resume_version_id: UUID,
    ) -> str | None:
        return await self._session.scalar(
            sa.select(ResumeVersionModel.original_file_name)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeVersionModel.id == resume_version_id,
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
            )
            .limit(1)
        )

    async def list_pipeline_entries(self, candidate_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status,
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.relationship_status,
                CandidateJobPipelineModel.current_analysis_id,
                CandidateJobPipelineModel.resume_version_id,
                CandidateJobPipelineModel.is_terminal,
                CandidateJobPipelineModel.terminated_at,
                CandidateJobPipelineModel.termination_reason,
                CandidateJobPipelineModel.entered_at,
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

    async def find_latest_candidate_note_summary(self, candidate_id: UUID) -> dict | None:
        row = await self._session.execute(
            sa.select(
                CandidateNoteModel.note_text,
                CandidateNoteModel.created_at,
            )
            .where(
                CandidateNoteModel.candidate_id == candidate_id,
                CandidateNoteModel.deleted_at.is_(None),
            )
            .order_by(CandidateNoteModel.created_at.desc(), CandidateNoteModel.id.desc())
            .limit(1)
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def find_latest_pipeline_movement_summary(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
    ) -> dict | None:
        row = await self._session.execute(
            sa.select(
                CandidateJobPipelineEventModel.event_type,
                CandidateJobPipelineEventModel.to_stage,
                UserModel.full_name.label("actor_name"),
                CandidateJobPipelineEventModel.created_at.label("moved_at"),
            )
            .outerjoin(UserModel, UserModel.id == CandidateJobPipelineEventModel.actor_id)
            .where(
                CandidateJobPipelineEventModel.candidate_id == candidate_id,
                CandidateJobPipelineEventModel.job_id == job_id,
            )
            .order_by(
                CandidateJobPipelineEventModel.created_at.desc(),
                CandidateJobPipelineEventModel.id.desc(),
            )
            .limit(1)
        )
        mapping = row.mappings().first()
        return dict(mapping) if mapping is not None else None

    async def get_preview_pending_flags(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        active_stage: str,
    ) -> dict[str, bool]:
        behavioral_assignment_pending = bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .select_from(BehavioralAssessmentAssignmentModel)
                .where(
                    BehavioralAssessmentAssignmentModel.candidate_id == candidate_id,
                    BehavioralAssessmentAssignmentModel.job_id == job_id,
                    BehavioralAssessmentAssignmentModel.status.in_(("pending", "in_progress")),
                )
                .limit(1)
            )
        )
        behavioral_ai_pending = bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .select_from(BehavioralAssessmentAIEvaluationModel)
                .where(
                    BehavioralAssessmentAIEvaluationModel.candidate_id == candidate_id,
                    BehavioralAssessmentAIEvaluationModel.job_id == job_id,
                    BehavioralAssessmentAIEvaluationModel.status.in_(("pending", "processing")),
                )
                .limit(1)
            )
        )
        interview_not_scheduled = False
        if active_stage in {"hr_interview", "technical_interview"}:
            interview_scheduled = bool(
                await self._session.scalar(
                    sa.select(sa.literal(True))
                    .select_from(InterviewScheduleModel)
                    .where(
                        InterviewScheduleModel.candidate_id == candidate_id,
                        InterviewScheduleModel.job_id == job_id,
                        InterviewScheduleModel.status.in_(("scheduled", "rescheduled")),
                    )
                    .limit(1)
                )
            )
            interview_not_scheduled = not interview_scheduled

        document_pending = bool(
            await self._session.scalar(
                sa.select(sa.literal(True))
                .select_from(PreAdmissionChecklistItemModel)
                .join(PreAdmissionCaseModel, PreAdmissionCaseModel.id == PreAdmissionChecklistItemModel.case_id)
                .where(
                    PreAdmissionCaseModel.candidate_id == candidate_id,
                    PreAdmissionCaseModel.job_id == job_id,
                    PreAdmissionCaseModel.status.not_in(("admitted", "cancelled", "offer_declined")),
                    PreAdmissionChecklistItemModel.required.is_(True),
                    PreAdmissionChecklistItemModel.status.in_(("pending", "rejected")),
                )
                .limit(1)
            )
        )

        return {
            "behavioral_assignment_pending": behavioral_assignment_pending,
            "behavioral_ai_pending": behavioral_ai_pending,
            "interview_not_scheduled": interview_not_scheduled,
            "document_pending": document_pending,
        }

    async def list_pipeline_entries_for_portal(self, candidate_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                CandidateJobPipelineModel.pipeline_stage.label("stage"),
                CandidateJobPipelineModel.link_status,
                CandidateJobPipelineModel.pipeline_status,
                CandidateJobPipelineModel.relationship_status,
                CandidateJobPipelineModel.current_analysis_id,
                CandidateJobPipelineModel.resume_version_id,
                CandidateJobPipelineModel.is_terminal,
                CandidateJobPipelineModel.terminated_at,
                CandidateJobPipelineModel.termination_reason,
                CandidateJobPipelineModel.entered_at,
                CandidateJobPipelineModel.updated_at,
            )
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.relationship_status.in_(_PORTAL_HISTORY_RELATIONSHIP_STATUSES),
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
    @staticmethod
    def _normalized_digits_expr(column: sa.ColumnElement[str | None]) -> sa.ColumnElement[str]:
        expr = sa.func.coalesce(column, "")
        for token in (".", "-", "/", "(", ")", " ", "+"):
            expr = sa.func.replace(expr, token, "")
        return expr

    def _build_common_candidate_filters(
        self,
        *,
        search: str | None,
        archived: bool,
        application_source: str | None,
        has_resume: bool | None = None,
        city: str | None = None,
        state: str | None = None,
        salary_min: float | None = None,
        salary_max: float | None = None,
        desired_contract_type: str | None = None,
        link_status_filter: str | None = None,
        skill: str | None = None,
        seniority: str | None = None,
        ai_status_filter: list[str] | None = None,
    ) -> list[sa.ColumnElement[bool]]:
        filters: list[sa.ColumnElement[bool]] = [CandidateModel.deleted_at.is_(None)]
        filters.append(CandidateModel.archived_at.is_not(None) if archived else CandidateModel.archived_at.is_(None))

        if application_source:
            filters.append(CandidateModel.application_source == application_source)

        if city:
            city_term = city.strip().lower()
            if city_term:
                filters.append(sa.func.lower(sa.func.coalesce(CandidateModel.location_city, "")) == city_term)

        if state:
            state_term = state.strip().lower()
            if state_term:
                filters.append(sa.func.lower(sa.func.coalesce(CandidateModel.location_state, "")) == state_term)

        if desired_contract_type:
            contract_term = desired_contract_type.strip().lower()
            if contract_term:
                filters.append(
                    sa.func.lower(sa.func.coalesce(CandidateModel.desired_contract_type, "")) == contract_term
                )

        if salary_min is not None:
            filters.append(
                sa.and_(
                    CandidateModel.salary_expectation.is_not(None),
                    sa.cast(CandidateModel.salary_expectation, sa.Float) >= salary_min,
                )
            )
        if salary_max is not None:
            filters.append(
                sa.and_(
                    CandidateModel.salary_expectation.is_not(None),
                    sa.cast(CandidateModel.salary_expectation, sa.Float) <= salary_max,
                )
            )

        active_pipeline_exists = (
            sa.select(sa.literal(1))
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
            .exists()
        )
        closed_pipeline_exists = (
            sa.select(sa.literal(1))
            .select_from(CandidateJobPipelineModel)
            .join(JobModel, JobModel.id == CandidateJobPipelineModel.job_id)
            .where(
                CandidateJobPipelineModel.candidate_id == CandidateModel.id,
                CandidateJobPipelineModel.relationship_status.in_(("hired", "rejected", "withdrawn", "archived")),
                CandidateJobPipelineModel.is_terminal.is_(True),
                JobModel.deleted_at.is_(None),
            )
            .correlate(CandidateModel)
            .exists()
        )

        if link_status_filter:
            normalized_link_status = link_status_filter.strip().lower()
            if normalized_link_status in {"with_active_job", "com_vaga_ativa", "active"}:
                filters.append(active_pipeline_exists)
            elif normalized_link_status in {"without_active_job", "sem_vaga_ativa", "talent_pool"}:
                filters.append(~active_pipeline_exists)
            elif normalized_link_status in {"closed_process", "processo_encerrado"}:
                filters.append(sa.and_(~active_pipeline_exists, closed_pipeline_exists))

        if has_resume is not None:
            resume_exists = (
                sa.select(sa.literal(1))
                .where(
                    ResumeModel.candidate_id == CandidateModel.id,
                    ResumeModel.deleted_at.is_(None),
                )
                .correlate(CandidateModel)
                .exists()
            )
            filters.append(resume_exists if has_resume else ~resume_exists)

        if ai_status_filter:
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
            filters.append(ai_status_sq.in_(ai_status_filter))

        skill_term = (skill or "").strip().lower()
        if skill_term:
            skill_like = f"%{skill_term}%"
            skill_exists = (
                sa.select(sa.literal(1))
                .select_from(CandidateProfileAnalysisModel)
                .where(
                    CandidateProfileAnalysisModel.candidate_id == CandidateModel.id,
                    sa.func.lower(sa.cast(CandidateProfileAnalysisModel.skills_json, sa.String)).like(skill_like),
                )
                .correlate(CandidateModel)
                .exists()
            )
            filters.append(
                sa.or_(
                    sa.func.lower(sa.cast(CandidateModel.tags, sa.String)).like(skill_like),
                    skill_exists,
                )
            )

        seniority_term = (seniority or "").strip().lower()
        if seniority_term:
            seniority_exists = (
                sa.select(sa.literal(1))
                .select_from(CandidateProfileAnalysisModel)
                .where(
                    CandidateProfileAnalysisModel.candidate_id == CandidateModel.id,
                    sa.func.lower(sa.func.coalesce(CandidateProfileAnalysisModel.seniority_level, "")).like(
                        f"%{seniority_term}%"
                    ),
                )
                .correlate(CandidateModel)
                .exists()
            )
            filters.append(seniority_exists)

        if search:
            normalized_search = search.strip().lower()
            if normalized_search:
                search_term = f"%{normalized_search}%"
                digits_search = re.sub(r"\D+", "", search)
                search_conditions: list[sa.ColumnElement[bool]] = [
                    sa.func.lower(CandidateModel.full_name).like(search_term),
                    sa.func.lower(CandidateModel.email).like(search_term),
                    sa.func.lower(sa.cast(CandidateModel.tags, sa.String)).like(search_term),
                    sa.exists(
                        sa.select(sa.literal(1))
                        .select_from(CandidateProfileAnalysisModel)
                        .where(
                            CandidateProfileAnalysisModel.candidate_id == CandidateModel.id,
                            sa.func.lower(sa.cast(CandidateProfileAnalysisModel.skills_json, sa.String)).like(
                                search_term
                            ),
                        )
                        .correlate(CandidateModel)
                    ),
                ]
                if digits_search:
                    digits_term = f"%{digits_search}%"
                    search_conditions.extend(
                        [
                            self._normalized_digits_expr(CandidateModel.cpf).like(digits_term),
                            self._normalized_digits_expr(CandidateModel.phone).like(digits_term),
                        ]
                    )
                else:
                    search_conditions.extend(
                        [
                            sa.func.lower(sa.func.coalesce(CandidateModel.cpf, "")).like(search_term),
                            sa.func.lower(sa.func.coalesce(CandidateModel.phone, "")).like(search_term),
                        ]
                    )
                filters.append(sa.or_(*search_conditions))

        return filters
