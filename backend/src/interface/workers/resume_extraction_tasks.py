from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import sqlalchemy as sa
import structlog

from src.application.services.resume_service import ResumeService
from src.core.resume_text_quality import LOW_QUALITY_FAILURE_REASON
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.pdf.candidate_prefill_extractor import extract_candidate_prefill
from src.infrastructure.pdf.text_extractor import PdfTextExtractionError, extract_pdf_text
from src.infrastructure.queue.celery_app import celery_app
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.infrastructure.storage.resume_files import resolve_resume_storage_path
from src.interface.workers.analysis_dispatcher import ANALYSIS_QUEUE, enqueue_analysis

logger = structlog.get_logger(__name__)
SUPPORTED_RESUME_EXTRACTION_MIME_TYPES = {"application/pdf"}
SUPPORTED_RESUME_EXTRACTION_EXTENSIONS = {".pdf"}


@celery_app.task(
    bind=True,
    name="src.interface.workers.resume_extraction_tasks.process_resume_extraction",
    max_retries=0,
    soft_time_limit=120,
    time_limit=180,
)
def process_resume_extraction(self, resume_version_id: str) -> dict:  # type: ignore[override]
    worker_name = str(getattr(self.request, "hostname", "unknown"))
    return asyncio.run(
        _process_resume_extraction_async(
            resume_version_id=resume_version_id,
            worker_name=worker_name,
        )
    )


async def _claim_resume_version_for_processing(
    *,
    parsed_resume_version_id: UUID,
    sessionmaker,
) -> bool:
    async with sessionmaker() as session:
        result = await session.execute(
            sa.update(ResumeVersionModel)
            .where(
                ResumeVersionModel.id == parsed_resume_version_id,
                ResumeVersionModel.extraction_status.in_(("pending", "failed")),
            )
            .values(
                extraction_status="processing",
                extraction_error=None,
            )
        )
        await session.commit()
        return int(result.rowcount or 0) > 0


async def _mark_resume_version_failed(
    *,
    parsed_resume_version_id: UUID,
    error_message: str,
    sessionmaker,
    analysis_failure_reason: str = "resume_extraction_failed",
) -> None:
    async with sessionmaker() as session:
        now = datetime.now(UTC)
        await session.execute(
            sa.update(ResumeVersionModel)
            .where(ResumeVersionModel.id == parsed_resume_version_id)
            .values(
                extraction_status="failed",
                extraction_error=error_message,
                extracted_text=None,
                page_count=None,
                word_count=None,
            )
        )
        await session.execute(
            sa.update(AnalysisModel)
            .where(
                AnalysisModel.resume_version_id == parsed_resume_version_id,
                AnalysisModel.status.in_(("waiting_extraction", "pending")),
                AnalysisModel.task_id.is_(None),
            )
            .values(
                status="failed",
                failure_reason=analysis_failure_reason,
                provider_error_type=analysis_failure_reason,
                failed_at=now,
                next_retry_at=None,
                worker_claim_id=None,
                claimed_at=None,
                stale_at=None,
                updated_at=now,
            )
        )
        await session.commit()


async def _load_resume_context(
    *,
    parsed_resume_version_id: UUID,
    session,
) -> tuple[ResumeVersionModel | None, ResumeModel | None, CandidateModel | None]:
    version = await session.scalar(
        sa.select(ResumeVersionModel).where(ResumeVersionModel.id == parsed_resume_version_id)
    )
    if version is None:
        return None, None, None

    resume = await session.scalar(
        sa.select(ResumeModel).where(ResumeModel.id == version.resume_id)
    )
    if resume is None:
        return version, None, None

    candidate = await session.scalar(
        sa.select(CandidateModel).where(CandidateModel.id == resume.candidate_id)
    )
    return version, resume, candidate


def _validate_resume_version_supported_for_extraction(version: ResumeVersionModel) -> None:
    mime_type = (version.mime_type or "").strip().lower()
    original_extension = Path(version.original_file_name or "").suffix.lower()
    storage_extension = Path(version.s3_key or "").suffix.lower()
    has_pdf_extension = (
        original_extension in SUPPORTED_RESUME_EXTRACTION_EXTENSIONS
        or (
            not original_extension
            and storage_extension in SUPPORTED_RESUME_EXTRACTION_EXTENSIONS
        )
    )

    if mime_type not in SUPPORTED_RESUME_EXTRACTION_MIME_TYPES or not has_pdf_extension:
        raise PdfTextExtractionError(
            "Formato de currículo não suportado para extração. Envie um arquivo PDF."
        )


async def _process_resume_extraction_async(
    *,
    resume_version_id: str | UUID,
    worker_name: str = "unknown",
) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        try:
            parsed_resume_version_id = (
                resume_version_id
                if isinstance(resume_version_id, UUID)
                else UUID(str(resume_version_id))
            )
        except ValueError as exc:
            logger.warning(
                "resume_extraction.invalid_uuid",
                resume_version_id=str(resume_version_id),
                error=str(exc),
            )
            return {"status": "failed", "reason": "invalid_uuid"}

        claimed = await _claim_resume_version_for_processing(
            parsed_resume_version_id=parsed_resume_version_id,
            sessionmaker=celery_sessionmaker,
        )
        if not claimed:
            logger.info(
                "resume_extraction.skipped",
                resume_version_id=str(parsed_resume_version_id),
                reason="already_claimed_or_terminal",
            )
            return {"status": "skipped", "resume_version_id": str(parsed_resume_version_id)}

        async with celery_sessionmaker() as session:
            version, resume, candidate = await _load_resume_context(
                parsed_resume_version_id=parsed_resume_version_id,
                session=session,
            )

            if version is None or resume is None or candidate is None:
                await _mark_resume_version_failed(
                    parsed_resume_version_id=parsed_resume_version_id,
                    error_message="resume_context_not_found",
                    sessionmaker=celery_sessionmaker,
                )
                return {"status": "failed", "reason": "resume_context_not_found"}

            file_path = resolve_resume_storage_path(version.s3_key)

            try:
                content = await asyncio.to_thread(file_path.read_bytes)
            except FileNotFoundError:
                await _mark_resume_version_failed(
                    parsed_resume_version_id=parsed_resume_version_id,
                    error_message="resume_file_not_found",
                    sessionmaker=celery_sessionmaker,
                )
                return {"status": "failed", "reason": "resume_file_not_found"}

            try:
                _validate_resume_version_supported_for_extraction(version)
                extracted = await asyncio.to_thread(extract_pdf_text, content)
            except PdfTextExtractionError as exc:
                failure_reason = (
                    LOW_QUALITY_FAILURE_REASON
                    if str(exc) == LOW_QUALITY_FAILURE_REASON
                    else "resume_extraction_failed"
                )
                await _mark_resume_version_failed(
                    parsed_resume_version_id=parsed_resume_version_id,
                    error_message=str(exc),
                    analysis_failure_reason=failure_reason,
                    sessionmaker=celery_sessionmaker,
                )
                return {"status": "failed", "reason": str(exc)}

            prefill = extract_candidate_prefill(extracted.text)
            prefilled_fields = ResumeService._apply_candidate_prefill(candidate, prefill)
            now = datetime.now(UTC)

            version.extracted_text = extracted.text
            version.extraction_status = "completed"
            version.extraction_error = None
            version.page_count = extracted.page_count
            version.word_count = extracted.word_count
            resume.updated_at = now

            if prefilled_fields:
                candidate.updated_at = now

            repository = SQLAlchemyResumeRepository(session)
            await repository.save_candidate(candidate)
            await repository.save_version(version)
            await repository.save_resume(resume)
            pending_analysis_ids = list(
                (
                    await session.scalars(
                        sa.select(AnalysisModel.id).where(
                            AnalysisModel.resume_version_id == parsed_resume_version_id,
                            AnalysisModel.job_id.is_not(None),
                            AnalysisModel.status.in_(("waiting_extraction", "pending")),
                            AnalysisModel.task_id.is_(None),
                        )
                    )
                ).all()
            )
            for analysis_id in pending_analysis_ids:
                await session.execute(
                    sa.update(AnalysisModel)
                    .where(AnalysisModel.id == analysis_id)
                    .values(
                        status="pending",
                        queue_name=ANALYSIS_QUEUE,
                        task_id=f"analysis:{analysis_id}",
                        updated_at=now,
                    )
                )
            await session.commit()

            for analysis_id in pending_analysis_ids:
                try:
                    enqueue_analysis(analysis_id)
                except Exception as exc:
                    async with celery_sessionmaker() as failure_session:
                        failed = await failure_session.scalar(
                            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
                        )
                        if failed is not None:
                            failed.status = "failed"
                            failed.failure_reason = "analysis_enqueue_failed"
                            failed.provider_error_type = "enqueue_failed"
                            failed.failed_at = now
                            failed.next_retry_at = None
                            failed.worker_claim_id = None
                            failed.claimed_at = None
                            failed.stale_at = None
                            failed.updated_at = now
                            await failure_session.commit()
                    logger.error(
                        "resume_extraction.analysis_enqueue_failed",
                        resume_version_id=str(parsed_resume_version_id),
                        analysis_id=str(analysis_id),
                        error=str(exc),
                    )

            logger.info(
                "resume_extraction.completed",
                resume_version_id=str(parsed_resume_version_id),
                worker_name=worker_name,
                prefilled_fields=prefilled_fields,
                used_ocr=extracted.used_ocr,
                enqueued_pending_analyses=len(pending_analysis_ids),
            )

            return {
                "status": "completed",
                "resume_version_id": str(parsed_resume_version_id),
                "prefilled_fields": prefilled_fields,
                "used_ocr": extracted.used_ocr,
            }
    except Exception as exc:
        parsed_value = str(resume_version_id)
        try:
            parsed_uuid = UUID(parsed_value)
        except ValueError:
            parsed_uuid = None

        if parsed_uuid is not None:
            await _mark_resume_version_failed(
                parsed_resume_version_id=parsed_uuid,
                error_message="unexpected_extraction_failure",
                sessionmaker=celery_sessionmaker,
            )

        logger.exception(
            "resume_extraction.failed",
            resume_version_id=parsed_value,
            worker_name=worker_name,
            error=str(exc),
        )
        return {"status": "failed", "reason": "unexpected_extraction_failure"}
    finally:
        await celery_engine.dispose()
