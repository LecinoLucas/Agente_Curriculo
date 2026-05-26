from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import (
    SQLAlchemyResumeRepository,
)
from src.interface.workers.analysis_dispatcher import enqueue_analysis

logger = structlog.get_logger(__name__)

_AUTO_ALLOWED_STAGES: frozenset[str] = frozenset({"entry", "screening"})
_TERMINAL_LINK_STATUSES: frozenset[str] = frozenset({"rejected", "removed", "transferred"})


@dataclass(frozen=True)
class AnalysisDispatchDecision:
    analysis_id: UUID | None
    status: str | None
    created: bool
    blocked: bool
    reused: bool
    stuck: bool
    reason: str
    stage: str | None
    trigger_source: str

    def as_dict(self) -> dict:
        return {
            "analysis_id": self.analysis_id,
            "status": self.status,
            "created": self.created,
            "blocked": self.blocked,
            "reused": self.reused,
            "stuck": self.stuck,
            "reason": self.reason,
            "stage": self.stage,
            "trigger_source": self.trigger_source,
        }


class AnalysisRequestPolicy:
    @staticmethod
    def decide(
        *,
        trigger_source: str,
        stage: str | None,
        pipeline_status: str | None,
        link_status: str | None,
        requested_by_user_id: UUID | None,
        existing_active_status: str | None,
        has_reusable_completed: bool,
    ) -> AnalysisDispatchDecision:
        if trigger_source == "manual":
            if requested_by_user_id is None:
                return AnalysisDispatchDecision(
                    analysis_id=None,
                    status=None,
                    created=False,
                    blocked=True,
                    reused=False,
                    stuck=False,
                    reason="manual_reanalysis_denied_missing_user",
                    stage=stage,
                    trigger_source=trigger_source,
                )
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=None,
                created=False,
                blocked=False,
                reused=False,
                stuck=False,
                reason="manual_reanalysis_allowed",
                stage=stage,
                trigger_source=trigger_source,
            )

        if pipeline_status == "terminal" or (link_status in _TERMINAL_LINK_STATUSES):
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=None,
                created=False,
                blocked=True,
                reused=False,
                stuck=False,
                reason="auto_analysis_blocked_terminal_pipeline",
                stage=stage,
                trigger_source=trigger_source,
            )

        if stage not in _AUTO_ALLOWED_STAGES:
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=None,
                created=False,
                blocked=True,
                reused=False,
                stuck=False,
                reason="auto_analysis_blocked_after_screening",
                stage=stage,
                trigger_source=trigger_source,
            )

        if existing_active_status == "waiting_extraction":
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=existing_active_status,
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason="auto_analysis_skipped_waiting_extraction",
                stage=stage,
                trigger_source=trigger_source,
            )

        if existing_active_status in {"pending", "retry_scheduled"}:
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=existing_active_status,
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason="auto_analysis_skipped_duplicate_pending",
                stage=stage,
                trigger_source=trigger_source,
            )

        if existing_active_status == "processing":
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=existing_active_status,
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason="auto_analysis_skipped_duplicate_processing",
                stage=stage,
                trigger_source=trigger_source,
            )

        if has_reusable_completed:
            return AnalysisDispatchDecision(
                analysis_id=None,
                status="completed",
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason="auto_analysis_skipped_existing_completed",
                stage=stage,
                trigger_source=trigger_source,
            )

        allow_reason = (
            "auto_analysis_allowed_entry"
            if stage == "entry"
            else "auto_analysis_allowed_screening"
        )
        return AnalysisDispatchDecision(
            analysis_id=None,
            status=None,
            created=False,
            blocked=False,
            reused=False,
            stuck=False,
            reason=allow_reason,
            stage=stage,
            trigger_source=trigger_source,
        )


class CandidateJobAnalysisDispatcher:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._analysis_repo = SQLAlchemyAnalysisRepository(db)
        self._resume_repo = SQLAlchemyResumeRepository(db)
        self._pipeline_repo = SQLAlchemyPipelineRepository(db)

    async def request_auto_analysis(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        requested_by: UUID,
        trigger_source: str = "automatic",
    ) -> AnalysisDispatchDecision:
        pipeline_entry = await self._pipeline_repo.find_active_entry(candidate_id, job_id)
        stage = getattr(pipeline_entry, "pipeline_stage", None)
        pipeline_status = getattr(pipeline_entry, "pipeline_status", None)
        link_status = getattr(pipeline_entry, "link_status", None)

        if pipeline_entry is None:
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=None,
                created=False,
                blocked=True,
                reused=False,
                stuck=False,
                reason="auto_analysis_blocked_terminal_pipeline",
                stage=None,
                trigger_source=trigger_source,
            )

        latest_resume_row = await self._db.execute(
            sa.select(
                ResumeVersionModel.id.label("resume_version_id"),
                ResumeVersionModel.extraction_status.label("extraction_status"),
                ResumeVersionModel.extracted_text.label("extracted_text"),
            )
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .where(
                ResumeModel.candidate_id == candidate_id,
                ResumeModel.deleted_at.is_(None),
            )
            .order_by(ResumeVersionModel.uploaded_at.desc())
            .limit(1)
        )
        latest_resume = latest_resume_row.mappings().first()
        if latest_resume is None:
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=None,
                created=False,
                blocked=True,
                reused=False,
                stuck=False,
                reason="analysis_skipped_no_resume",
                stage=stage,
                trigger_source=trigger_source,
            )

        resume_version_id: UUID = latest_resume["resume_version_id"]
        extraction_ready = (
            str(latest_resume.get("extraction_status") or "").lower() == "completed"
            and bool((latest_resume.get("extracted_text") or "").strip())
        )

        existing_active = await self._analysis_repo.find_active_for_version(
            resume_version_id=resume_version_id,
            job_id=job_id,
        )
        reusable_completed = await self._analysis_repo.find_latest_completed_for_version(
            resume_version_id=resume_version_id,
            job_id=job_id,
        )

        policy = AnalysisRequestPolicy.decide(
            trigger_source=trigger_source,
            stage=stage,
            pipeline_status=pipeline_status,
            link_status=link_status,
            requested_by_user_id=requested_by,
            existing_active_status=str(existing_active.status) if existing_active is not None else None,
            has_reusable_completed=reusable_completed is not None,
        )

        if policy.blocked:
            logger.info(
                "analysis.request.blocked",
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                stage=stage,
                pipeline_status=pipeline_status,
                link_status=link_status,
                reason=policy.reason,
                trigger_source=trigger_source,
            )
            return policy

        if policy.reused:
            reused_analysis = existing_active or reusable_completed
            logger.info(
                "analysis.request.reused",
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                stage=stage,
                reason=policy.reason,
                trigger_source=trigger_source,
                analysis_id=str(reused_analysis.id) if reused_analysis is not None else None,
                status=str(reused_analysis.status) if reused_analysis is not None else None,
            )
            return AnalysisDispatchDecision(
                analysis_id=reused_analysis.id if reused_analysis is not None else None,
                status=str(reused_analysis.status) if reused_analysis is not None else policy.status,
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason=policy.reason,
                stage=stage,
                trigger_source=trigger_source,
            )

        try:
            use_case = RequestAnalysisUseCase(
                self._analysis_repo,
                self._resume_repo,
            )
            result = await use_case.execute(
                RequestAnalysisCommand(
                    resume_version_id=resume_version_id,
                    requested_by=requested_by,
                    job_id=job_id,
                    force_reanalyze=False,
                    priority=5,
                    allow_pending_resume_extraction=True,
                )
            )

            await self._pipeline_repo.attach_analysis_to_entry(
                candidate_id=candidate_id,
                job_id=job_id,
                resume_version_id=resume_version_id,
                analysis_id=result.analysis_id,
                updated_at=datetime.now(UTC),
            )
            await self._db.commit()
        except Exception as exc:
            await self._db.rollback()
            logger.error(
                "analysis.request.failed",
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                stage=stage,
                trigger_source=trigger_source,
                reason="analysis_enqueue_failed",
                error=str(exc),
            )
            return AnalysisDispatchDecision(
                analysis_id=None,
                status=None,
                created=False,
                blocked=False,
                reused=False,
                stuck=False,
                reason="analysis_enqueue_failed",
                stage=stage,
                trigger_source=trigger_source,
            )

        analysis_status = str(result.status)
        if result.enqueue_required:
            enqueue_ok = await self._enqueue_analysis(
                analysis_id=result.analysis_id,
                candidate_id=candidate_id,
                job_id=job_id,
            )
            if not enqueue_ok:
                return AnalysisDispatchDecision(
                    analysis_id=result.analysis_id,
                    status="failed",
                    created=False,
                    blocked=False,
                    reused=False,
                    stuck=False,
                    reason="analysis_enqueue_failed",
                    stage=stage,
                    trigger_source=trigger_source,
                )

            logger.info(
                "analysis.request.created",
                analysis_id=str(result.analysis_id),
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                stage=stage,
                reason="analysis_created",
                trigger_source=trigger_source,
            )
            return AnalysisDispatchDecision(
                analysis_id=result.analysis_id,
                status=analysis_status,
                created=True,
                blocked=False,
                reused=False,
                stuck=False,
                reason="analysis_created",
                stage=stage,
                trigger_source=trigger_source,
            )

        if analysis_status == "waiting_extraction":
            return AnalysisDispatchDecision(
                analysis_id=result.analysis_id,
                status=analysis_status,
                created=result.created,
                blocked=False,
                reused=result.reused,
                stuck=False,
                reason="analysis_created_waiting_resume_extraction",
                stage=stage,
                trigger_source=trigger_source,
            )

        if analysis_status in {"processing", "retry_scheduled"}:
            return AnalysisDispatchDecision(
                analysis_id=result.analysis_id,
                status=analysis_status,
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason="auto_analysis_skipped_duplicate_processing",
                stage=stage,
                trigger_source=trigger_source,
            )

        if analysis_status == "completed":
            return AnalysisDispatchDecision(
                analysis_id=result.analysis_id,
                status=analysis_status,
                created=False,
                blocked=False,
                reused=True,
                stuck=False,
                reason="auto_analysis_skipped_existing_completed",
                stage=stage,
                trigger_source=trigger_source,
            )

        if not extraction_ready:
            return AnalysisDispatchDecision(
                analysis_id=result.analysis_id,
                status=analysis_status,
                created=True,
                blocked=False,
                reused=False,
                stuck=False,
                reason="analysis_created",
                stage=stage,
                trigger_source=trigger_source,
            )

        return AnalysisDispatchDecision(
            analysis_id=result.analysis_id,
            status=analysis_status,
            created=False,
            blocked=False,
            reused=True,
            stuck=False,
            reason="auto_analysis_skipped_duplicate_pending",
            stage=stage,
            trigger_source=trigger_source,
        )

    async def _enqueue_analysis(
        self,
        *,
        analysis_id: UUID,
        candidate_id: UUID,
        job_id: UUID,
    ) -> bool:
        analysis = await self._db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if analysis is None:
            logger.warning(
                "analysis.enqueue.skipped_not_found",
                analysis_id=str(analysis_id),
                candidate_id=str(candidate_id),
                job_id=str(job_id),
            )
            return False

        now = datetime.now(UTC)
        if not analysis.task_id:
            analysis.task_id = f"analysis:{analysis.id}"
        analysis.queue_name = "analysis"
        analysis.failure_reason = None
        analysis.updated_at = now

        try:
            await self._db.commit()
            logger.info(
                "analysis.enqueue.started",
                analysis_id=str(analysis_id),
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                task_id=analysis.task_id,
            )
            enqueue_analysis(analysis_id)
            logger.info(
                "analysis.enqueue.completed",
                analysis_id=str(analysis_id),
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                task_id=analysis.task_id,
            )
            return True
        except Exception as exc:  # pragma: no cover - defensive branch
            await self._db.rollback()
            failed = await self._db.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
            )
            if failed is not None:
                now = datetime.now(UTC)
                failed.status = "failed"
                failed.failure_reason = "analysis_enqueue_failed"
                failed.provider_error_type = "enqueue_failed"
                failed.failed_at = now
                failed.next_retry_at = None
                failed.worker_claim_id = None
                failed.claimed_at = None
                failed.stale_at = None
                failed.updated_at = now
                await self._db.commit()
            logger.error(
                "analysis.enqueue.failed",
                analysis_id=str(analysis_id),
                candidate_id=str(candidate_id),
                job_id=str(job_id),
                error=str(exc),
            )
            return False
