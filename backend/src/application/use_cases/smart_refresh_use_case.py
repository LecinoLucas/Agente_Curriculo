"""Smart Refresh use case.

Classifies pipeline candidates into four groups without calling any AI provider:
  - ranking_recalculation: completed analysis WITH usable extracted_data → recompute ranking only
  - ai_analysis (reason=no_valid_analysis): no analysis at all → dispatch via worker
  - ai_analysis (reason=legacy_incomplete_analysis): completed but empty extracted_data → re-dispatch
  - ai_analysis (reason=failed_analysis_retry): failed/cancelled analysis → retry via worker
  - skipped_already_processing: in-flight analysis → do nothing (no duplicate)
  - skipped_no_resume: no resume attached → cannot analyse

The execute() path enqueues tasks; it never calls Gemini or any LLM.
provider_calls_now is always 0.

Stage bypass: trigger_source="smart_refresh" bypasses the post-screening stage restriction in
AnalysisRequestPolicy so failed analyses at any active non-terminal stage can be retried.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel

logger = structlog.get_logger(__name__)

_PROCESSING_STATUSES: frozenset[str] = frozenset(
    {"pending", "processing", "retry_scheduled", "waiting_extraction"}
)
_VALID_COMPLETED_STATUS = "completed"
_FAILED_STATUSES: frozenset[str] = frozenset({"failed", "cancelled"})
_SAMPLE_LIMIT = 10


class JobNotFoundForSmartRefreshError(Exception):
    def __init__(self, job_id: UUID) -> None:
        super().__init__(f"Job not found: {job_id}")
        self.job_id = job_id


@dataclass(frozen=True)
class _CandidateRow:
    candidate_id: UUID
    candidate_name: str
    analysis_status: str | None
    has_resume: bool
    # True only when an analysis_results row exists AND extracted_data != {}
    has_extracted_data: bool


@dataclass(frozen=True)
class _SampleEntry:
    candidate_id: UUID
    candidate_name: str
    reason: str


@dataclass
class SmartRefreshPreviewData:
    job_id: UUID
    total_candidates: int
    ranking_recalculation_count: int
    ai_analysis_count: int
    ai_analysis_failed_retry_count: int    # subset: failed/cancelled → retry
    ai_analysis_legacy_incomplete_count: int  # subset: completed but empty → re-dispatch
    skipped_already_processing_count: int
    skipped_no_resume_count: int
    warnings: list[str] = field(default_factory=list)
    samples_ai: list[_SampleEntry] = field(default_factory=list)
    samples_skipped: list[_SampleEntry] = field(default_factory=list)


@dataclass
class SmartRefreshExecuteData:
    job_id: UUID
    queued: bool
    ranking_recalculation_enqueued: bool
    ranking_candidates: int
    ai_analysis_enqueued: int
    failed_analysis_retried: int  # subset of ai_analysis_enqueued: failed/cancelled retried
    skipped_already_processing: int
    skipped_no_resume: int
    skipped_legacy_incomplete: int  # completed + empty extracted_data, re-dispatched to ai_analysis
    provider_calls_now: int
    may_use_provider_later: bool
    message: str


def _classify(row: _CandidateRow) -> tuple[str, str]:
    """Return (category, reason) for a candidate row.

    category: ranking_recalculation | ai_analysis | skipped_already_processing | skipped_no_resume
    reason: key explaining classification; empty string for ranking_recalculation
    """
    if not row.has_resume:
        return "skipped_no_resume", "no_resume"
    if row.analysis_status in _PROCESSING_STATUSES:
        return "skipped_already_processing", "already_processing"
    if row.analysis_status == _VALID_COMPLETED_STATUS:
        if not row.has_extracted_data:
            # Completed but result missing or extracted_data is empty — re-dispatch via AI
            return "ai_analysis", "legacy_incomplete_analysis"
        return "ranking_recalculation", ""
    if row.analysis_status in _FAILED_STATUSES:
        # Failed/cancelled — retry via AI worker (stage bypass handled in dispatcher)
        return "ai_analysis", "failed_analysis_retry"
    return "ai_analysis", "no_valid_analysis"


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

        # True when an analysis_results row exists AND extracted_data is not an empty JSONB object.
        # When AnalysisModel.id is NULL (no analysis), the correlated WHERE evaluates to FALSE,
        # so EXISTS correctly returns FALSE without a separate NULL check.
        has_extracted_data_subq = (
            sa.select(sa.literal(1))
            .select_from(AnalysisResultModel)
            .where(
                AnalysisResultModel.analysis_id == AnalysisModel.id,
                sa.cast(AnalysisResultModel.extracted_data, sa.Text) != sa.literal("{}"),
            )
            .correlate(AnalysisModel)
            .exists()
        )

        stmt = (
            sa.select(
                pipeline.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                AnalysisModel.status.label("analysis_status"),
                has_resume_subq.label("has_resume"),
                has_extracted_data_subq.label("has_extracted_data"),
            )
            .join(CandidateModel, CandidateModel.id == pipeline.candidate_id)
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
                candidate_name=row.candidate_name or "",
                analysis_status=row.analysis_status,
                has_resume=bool(row.has_resume),
                has_extracted_data=bool(row.has_extracted_data),
            )
            for row in result.mappings()
        ]

    async def preview(self, job_id: UUID) -> SmartRefreshPreviewData:
        await self._require_job(job_id)
        rows = await self._fetch_candidate_rows(job_id)

        ranking_recalculation = 0
        ai_analysis = 0
        ai_analysis_failed_retry = 0
        ai_analysis_legacy_incomplete = 0
        skipped_already_processing = 0
        skipped_no_resume = 0
        samples_ai: list[_SampleEntry] = []
        samples_skipped: list[_SampleEntry] = []

        for row in rows:
            category, reason = _classify(row)
            if category == "ranking_recalculation":
                ranking_recalculation += 1
            elif category == "ai_analysis":
                ai_analysis += 1
                if reason == "failed_analysis_retry":
                    ai_analysis_failed_retry += 1
                elif reason == "legacy_incomplete_analysis":
                    ai_analysis_legacy_incomplete += 1
                if len(samples_ai) < _SAMPLE_LIMIT:
                    samples_ai.append(
                        _SampleEntry(
                            candidate_id=row.candidate_id,
                            candidate_name=row.candidate_name,
                            reason=reason,
                        )
                    )
            elif category == "skipped_already_processing":
                skipped_already_processing += 1
                if len(samples_skipped) < _SAMPLE_LIMIT:
                    samples_skipped.append(
                        _SampleEntry(
                            candidate_id=row.candidate_id,
                            candidate_name=row.candidate_name,
                            reason=reason,
                        )
                    )
            else:
                skipped_no_resume += 1
                if len(samples_skipped) < _SAMPLE_LIMIT:
                    samples_skipped.append(
                        _SampleEntry(
                            candidate_id=row.candidate_id,
                            candidate_name=row.candidate_name,
                            reason=reason,
                        )
                    )

        warnings: list[str] = []
        if ai_analysis_failed_retry > 0:
            warnings.append(
                f"{ai_analysis_failed_retry} candidato(s) com análise em erro serão "
                "reenfileirados para nova tentativa."
            )
        if ai_analysis_legacy_incomplete > 0:
            warnings.append(
                f"{ai_analysis_legacy_incomplete} candidato(s) com análise completada mas dados "
                "insuficientes serão reenviados para análise IA."
            )
        warnings.append("A atualização é enfileirada e pode levar alguns instantes.")

        return SmartRefreshPreviewData(
            job_id=job_id,
            total_candidates=len(rows),
            ranking_recalculation_count=ranking_recalculation,
            ai_analysis_count=ai_analysis,
            ai_analysis_failed_retry_count=ai_analysis_failed_retry,
            ai_analysis_legacy_incomplete_count=ai_analysis_legacy_incomplete,
            skipped_already_processing_count=skipped_already_processing,
            skipped_no_resume_count=skipped_no_resume,
            warnings=warnings,
            samples_ai=samples_ai,
            samples_skipped=samples_skipped,
        )

    async def execute(self, job_id: UUID, requested_by: UUID) -> SmartRefreshExecuteData:
        from src.application.services.analysis_dispatch_service import (
            CandidateJobAnalysisDispatcher,
        )
        from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

        await self._require_job(job_id)
        rows = await self._fetch_candidate_rows(job_id)

        ranking_candidates: list[UUID] = []
        ai_candidates: list[tuple[UUID, str]] = []  # (candidate_id, reason)
        skipped_already_processing = 0
        skipped_no_resume = 0
        skipped_legacy_incomplete = 0

        for row in rows:
            category, reason = _classify(row)
            if category == "ranking_recalculation":
                ranking_candidates.append(row.candidate_id)
            elif category == "ai_analysis":
                ai_candidates.append((row.candidate_id, reason))
                if reason == "legacy_incomplete_analysis":
                    skipped_legacy_incomplete += 1
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
        failed_analysis_retried = 0
        dispatcher = CandidateJobAnalysisDispatcher(self._db)
        for candidate_id, reason in ai_candidates:
            decision = await dispatcher.request_auto_analysis(
                candidate_id=candidate_id,
                job_id=job_id,
                requested_by=requested_by,
                trigger_source="smart_refresh",
            )
            if decision.created:
                ai_analysis_enqueued += 1
                if reason == "failed_analysis_retry":
                    failed_analysis_retried += 1
                logger.info(
                    "smart_refresh.ai_analysis_enqueued",
                    job_id=str(job_id),
                    candidate_id=str(candidate_id),
                    reason=reason,
                )

        may_use_provider_later = ai_analysis_enqueued > 0

        parts: list[str] = []
        if ranking_candidates:
            parts.append(f"{len(ranking_candidates)} ranking sem IA")
        if ai_analysis_enqueued > 0:
            ai_part = f"{ai_analysis_enqueued} análise IA"
            if failed_analysis_retried > 0:
                ai_part += f" ({failed_analysis_retried} retry de erro)"
            parts.append(ai_part)
        total_skipped = skipped_already_processing + skipped_no_resume
        if total_skipped > 0:
            parts.append(f"{total_skipped} ignorados")
        message = (
            "Atualização enfileirada: " + ", ".join(parts) + "."
            if parts
            else "Atualização enfileirada."
        )

        return SmartRefreshExecuteData(
            job_id=job_id,
            queued=ranking_recalculation_enqueued or ai_analysis_enqueued > 0,
            ranking_recalculation_enqueued=ranking_recalculation_enqueued,
            ranking_candidates=len(ranking_candidates),
            ai_analysis_enqueued=ai_analysis_enqueued,
            failed_analysis_retried=failed_analysis_retried,
            skipped_already_processing=skipped_already_processing,
            skipped_no_resume=skipped_no_resume,
            skipped_legacy_incomplete=skipped_legacy_incomplete,
            provider_calls_now=0,
            may_use_provider_later=may_use_provider_later,
            message=message,
        )
