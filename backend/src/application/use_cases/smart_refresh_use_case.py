"""Smart Refresh use case.

Classifies pipeline candidates into three groups without calling any AI provider:
  - ranking_recalculation: completed analysis → recompute ranking only
  - ai_analysis: no valid analysis → dispatch via worker later
  - skipped: pending/processing (no-op) or no resume

The execute() path enqueues tasks; it never calls Gemini or any LLM.
provider_calls_now is always 0.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel

logger = structlog.get_logger(__name__)

_PROCESSING_STATUSES: frozenset[str] = frozenset(
    {"pending", "processing", "retry_scheduled", "waiting_extraction"}
)
_VALID_COMPLETED_STATUS = "completed"


class JobNotFoundForSmartRefreshError(Exception):
    def __init__(self, job_id: UUID) -> None:
        super().__init__(f"Job not found: {job_id}")
        self.job_id = job_id


@dataclass(frozen=True)
class _CandidateRow:
    candidate_id: UUID
    analysis_status: str | None
    has_resume: bool


@dataclass
class SmartRefreshPreviewData:
    job_id: UUID
    total_candidates: int
    ranking_recalculation_count: int
    ai_analysis_count: int
    skipped_already_processing_count: int
    skipped_no_resume_count: int
    warnings: list[str] = field(default_factory=list)


@dataclass
class SmartRefreshExecuteData:
    job_id: UUID
    queued: bool
    ranking_recalculation_enqueued: bool
    ranking_candidates: int
    ai_analysis_enqueued: int
    skipped_already_processing: int
    skipped_no_resume: int
    provider_calls_now: int
    may_use_provider_later: bool
    message: str


def _classify(row: _CandidateRow) -> str:
    if not row.has_resume:
        return "skipped_no_resume"
    if row.analysis_status in _PROCESSING_STATUSES:
        return "skipped_already_processing"
    if row.analysis_status == _VALID_COMPLETED_STATUS:
        return "ranking_recalculation"
    return "ai_analysis"


class SmartRefreshUseCase:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _require_job(self, job_id: UUID) -> None:
        from src.infrastructure.database.models.job_model import JobModel

        job = await self._db.scalar(sa.select(JobModel).where(JobModel.id == job_id))
        if job is None:
            raise JobNotFoundForSmartRefreshError(job_id)

    async def _fetch_candidate_rows(self, job_id: UUID) -> list[_CandidateRow]:
        pipeline = CandidateJobPipelineModel

        has_resume_subq = (
            sa.select(sa.literal(1))
            .select_from(ResumeVersionModel)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.candidate_id == pipeline.candidate_id,
                ResumeModel.deleted_at.is_(None),
            )
            .correlate(pipeline)
            .exists()
        )

        stmt = (
            sa.select(
                pipeline.candidate_id,
                AnalysisModel.status.label("analysis_status"),
                has_resume_subq.label("has_resume"),
            )
            .outerjoin(
                AnalysisModel,
                AnalysisModel.id == pipeline.current_analysis_id,
            )
            .where(
                pipeline.job_id == job_id,
                pipeline.relationship_status == "active",
                pipeline.is_terminal.is_(False),
            )
        )

        result = await self._db.execute(stmt)
        return [
            _CandidateRow(
                candidate_id=row.candidate_id,
                analysis_status=row.analysis_status,
                has_resume=bool(row.has_resume),
            )
            for row in result.mappings()
        ]

    async def preview(self, job_id: UUID) -> SmartRefreshPreviewData:
        await self._require_job(job_id)
        rows = await self._fetch_candidate_rows(job_id)

        ranking_recalculation = 0
        ai_analysis = 0
        skipped_already_processing = 0
        skipped_no_resume = 0

        for row in rows:
            category = _classify(row)
            if category == "ranking_recalculation":
                ranking_recalculation += 1
            elif category == "ai_analysis":
                ai_analysis += 1
            elif category == "skipped_already_processing":
                skipped_already_processing += 1
            else:
                skipped_no_resume += 1

        return SmartRefreshPreviewData(
            job_id=job_id,
            total_candidates=len(rows),
            ranking_recalculation_count=ranking_recalculation,
            ai_analysis_count=ai_analysis,
            skipped_already_processing_count=skipped_already_processing,
            skipped_no_resume_count=skipped_no_resume,
        )

    async def execute(self, job_id: UUID, requested_by: UUID) -> SmartRefreshExecuteData:
        from src.application.services.analysis_dispatch_service import (
            CandidateJobAnalysisDispatcher,
        )
        from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

        await self._require_job(job_id)
        rows = await self._fetch_candidate_rows(job_id)

        ranking_candidates: list[UUID] = []
        ai_candidates: list[UUID] = []
        skipped_already_processing = 0
        skipped_no_resume = 0

        for row in rows:
            category = _classify(row)
            if category == "ranking_recalculation":
                ranking_candidates.append(row.candidate_id)
            elif category == "ai_analysis":
                ai_candidates.append(row.candidate_id)
            elif category == "skipped_already_processing":
                skipped_already_processing += 1
            else:
                skipped_no_resume += 1

        ranking_recalculation_enqueued = False
        if ranking_candidates:
            await enqueue_job_match_recompute(job_id)
            ranking_recalculation_enqueued = True
            logger.info(
                "smart_refresh.ranking_recompute_enqueued",
                job_id=str(job_id),
                candidate_count=len(ranking_candidates),
            )

        ai_analysis_enqueued = 0
        dispatcher = CandidateJobAnalysisDispatcher(self._db)
        for candidate_id in ai_candidates:
            decision = await dispatcher.request_auto_analysis(
                candidate_id=candidate_id,
                job_id=job_id,
                requested_by=requested_by,
                trigger_source="smart_refresh",
            )
            if decision.created:
                ai_analysis_enqueued += 1
                logger.info(
                    "smart_refresh.ai_analysis_enqueued",
                    job_id=str(job_id),
                    candidate_id=str(candidate_id),
                )

        may_use_provider_later = ai_analysis_enqueued > 0

        return SmartRefreshExecuteData(
            job_id=job_id,
            queued=ranking_recalculation_enqueued or ai_analysis_enqueued > 0,
            ranking_recalculation_enqueued=ranking_recalculation_enqueued,
            ranking_candidates=len(ranking_candidates),
            ai_analysis_enqueued=ai_analysis_enqueued,
            skipped_already_processing=skipped_already_processing,
            skipped_no_resume=skipped_no_resume,
            provider_calls_now=0,
            may_use_provider_later=may_use_provider_later,
            message="Atualização enfileirada.",
        )
