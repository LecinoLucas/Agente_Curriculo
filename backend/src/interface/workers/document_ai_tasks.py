from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import perf_counter
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.exc import IntegrityError

from src.infrastructure.database.models.admission_model import CandidateDocument
from src.application.services.document_ai_service import (
    extract_structured_data,
)
from src.domain.services.document_ai_validator import (
    validate_structured_data,
)
from src.application.services.document_processing_service import (
    DocumentProcessingService,
)
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.queue.celery_app import celery_app
from src.observability.context import clear_correlation_id, set_correlation_id
from src.observability.domain_events import (
    DomainEvent,
    DomainEventType,
    publish_domain_event,
)

logger = structlog.get_logger(__name__)

DOCUMENT_AI_QUEUE = "document_ai"

_MAX_AUTO_RETRIES = 2
DOCUMENT_PROCESS_TIMEOUT_SECONDS = 45
STRUCTURE_TIMEOUT_SECONDS = 25
VALIDATION_TIMEOUT_SECONDS = 10
MAX_CLEAN_TEXT_CHARS = 50_000


@celery_app.task(
    bind=True,
    name="src.interface.workers.document_ai_tasks.process_document_ai_job",
    max_retries=0,
    soft_time_limit=90,
    time_limit=120,
)
def process_document_ai_job(  # type: ignore[override]
    self,
    admission_id: str,
    document_id: str,
    analysis_id: str | None = None,
    retry_count: int = 0,
    correlation_id: str | None = None,
) -> dict:
    worker_name = str(getattr(self.request, "hostname", "unknown"))

    return asyncio.run(
        _process_document_ai_job_async(
            admission_id=admission_id,
            document_id=document_id,
            analysis_id=analysis_id,
            retry_count=retry_count,
            correlation_id=correlation_id,
            worker_name=worker_name,
        )
    )


async def _process_document_ai_job_async(
    admission_id: str,
    document_id: str,
    analysis_id: str | None = None,
    retry_count: int = 0,
    correlation_id: str | None = None,
    worker_name: str = "unknown",
) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        if analysis_id is None:
            return {"status": "skipped", "reason": "analysis_id_required"}

        started_perf = perf_counter()
        claimed = False

        try:
            parsed_admission_id = UUID(admission_id)
            parsed_document_id = UUID(document_id)
            parsed_analysis_id = UUID(analysis_id)
        except ValueError as exc:
            logger.exception(
                "document_ai.invalid_uuid",
                admission_id=admission_id,
                document_id=document_id,
                analysis_id=analysis_id,
                error=str(exc),
            )
            return {"status": "failed", "reason": "invalid_uuid"}

        effective_correlation_id = correlation_id or f"doc-ai:{document_id}:{analysis_id}"

        set_correlation_id(effective_correlation_id)
        structlog.contextvars.bind_contextvars(
            correlation_id=effective_correlation_id,
            admission_id=admission_id,
            document_id=document_id,
            analysis_id=analysis_id,
            worker_name=worker_name,
        )

        try:
            claimed = await _claim_analysis_for_processing(
                parsed_analysis_id=parsed_analysis_id,
                parsed_document_id=parsed_document_id,
                sessionmaker=celery_sessionmaker,
            )

            if not claimed:
                logger.info(
                    "document_ai.skipped",
                    admission_id=admission_id,
                    document_id=document_id,
                    analysis_id=analysis_id,
                    reason="already_claimed_or_document_busy",
                )
                return {"status": "skipped", "analysis_id": analysis_id}

            await publish_domain_event(
                DomainEvent(
                    event_type=DomainEventType.AI_PROCESSING_STARTED,
                    entity_id=parsed_document_id,
                    payload={
                        "admission_id": admission_id,
                        "document_id": document_id,
                        "analysis_id": analysis_id,
                        "retry_count": retry_count,
                        "worker_name": worker_name,
                        "correlation_id": effective_correlation_id,
                    },
                )
            )

            async with celery_sessionmaker() as session:
                analysis = await session.scalar(
                    sa.select(DocumentAIAnalysisModel).where(
                        DocumentAIAnalysisModel.id == parsed_analysis_id
                    )
                )

                if analysis is None:
                    return {
                        "status": "skipped",
                        "analysis_id": analysis_id,
                        "reason": "analysis_not_found",
                    }

                document = await session.scalar(
                    sa.select(CandidateDocument).where(
                        CandidateDocument.id == parsed_document_id,
                        CandidateDocument.admission_id == parsed_admission_id,
                    )
                )

                if document is None:
                    await _mark_analysis_failed(
                        parsed_analysis_id=parsed_analysis_id,
                        error_message="document_not_found_for_admission",
                        sessionmaker=celery_sessionmaker,
                    )

                    await _publish_failed_event(
                        parsed_document_id=parsed_document_id,
                        admission_id=parsed_admission_id,
                        document_id=parsed_document_id,
                        analysis_id=parsed_analysis_id,
                        retry_count=retry_count,
                        worker_name=worker_name,
                        processing_ms=int((perf_counter() - started_perf) * 1000),
                        error="document_not_found_for_admission",
                        correlation_id=effective_correlation_id,
                    )

                    return {"status": "document_not_found", "analysis_id": analysis_id}

                processed = await _run_blocking_with_timeout(
                    DocumentProcessingService().process_document,
                    document.file_path,
                    timeout=DOCUMENT_PROCESS_TIMEOUT_SECONDS,
                    error_label="document_processing_timeout",
                )

                clean_text = processed.clean_text or ""

                if len(clean_text) > MAX_CLEAN_TEXT_CHARS:
                    clean_text = clean_text[:MAX_CLEAN_TEXT_CHARS]

                structured_data = await _run_blocking_with_timeout(
                    extract_structured_data,
                    clean_text,
                    timeout=STRUCTURE_TIMEOUT_SECONDS,
                    error_label="document_structuring_timeout",
                )

                validation = await _run_blocking_with_timeout(
                    validate_structured_data,
                    structured_data,
                    timeout=VALIDATION_TIMEOUT_SECONDS,
                    error_label="document_validation_timeout",
                )

                persisted = False

                if validation.get("valid") is True:
                    persist_result = await session.execute(
                        sa.update(CandidateDocument)
                        .where(
                            CandidateDocument.id == parsed_document_id,
                            CandidateDocument.structured_data.is_(None),
                        )
                        .values(structured_data=structured_data)
                    )
                    persisted = int(persist_result.rowcount or 0) > 0

                reasons = validation.get("reasons") or []
                error_message: str | None = None

                if validation.get("valid") is not True:
                    error_message = f"validation_failed:{','.join(str(r) for r in reasons)}"
                elif not persisted:
                    error_message = "structured_data_already_persisted"

                update_result = await session.execute(
                    sa.update(DocumentAIAnalysisModel)
                    .where(
                        DocumentAIAnalysisModel.id == parsed_analysis_id,
                        DocumentAIAnalysisModel.status == "processing",
                    )
                    .values(
                        raw_text=processed.raw_text,
                        clean_text=clean_text,
                        structured_data=structured_data,
                        confidence=float(structured_data.get("confidence", 0.0) or 0.0),
                        status="processed",
                        error_message=error_message,
                    )
                )

                if int(update_result.rowcount or 0) == 0:
                    await session.rollback()
                    return {
                        "status": "skipped",
                        "analysis_id": analysis_id,
                        "reason": "state_changed",
                    }

                processing_ms = int((perf_counter() - started_perf) * 1000)

                await publish_domain_event(
                    DomainEvent(
                        event_type=DomainEventType.AI_PROCESSING_COMPLETED,
                        entity_id=parsed_document_id,
                        payload={
                            "admission_id": admission_id,
                            "document_id": document_id,
                            "analysis_id": analysis_id,
                            "retry_count": retry_count,
                            "worker_name": worker_name,
                            "processing_ms": processing_ms,
                            "valid": bool(validation.get("valid")),
                            "persisted": persisted,
                            "correlation_id": effective_correlation_id,
                        },
                    ),
                    session=session,
                )

                await session.commit()

            logger.info(
                "document_ai.processed",
                admission_id=admission_id,
                document_id=document_id,
                analysis_id=str(parsed_analysis_id),
                valid=validation.get("valid"),
                persisted=persisted,
                retry_count=retry_count,
                worker_name=worker_name,
                processing_ms=processing_ms,
                correlation_id=effective_correlation_id,
            )

            return {
                "status": "processed",
                "analysis_id": str(parsed_analysis_id),
                "valid": bool(validation.get("valid")),
                "persisted": persisted,
                "processing_ms": processing_ms,
            }

        except Exception as exc:
            logger.exception(
                "document_ai.failed",
                admission_id=admission_id,
                document_id=document_id,
                analysis_id=analysis_id,
                error=str(exc),
                retry_count=retry_count,
                worker_name=worker_name,
                correlation_id=effective_correlation_id,
            )

            if claimed:
                await _mark_failed_and_maybe_retry(
                    parsed_document_id=parsed_document_id,
                    parsed_analysis_id=parsed_analysis_id,
                    admission_id=parsed_admission_id,
                    document_id=parsed_document_id,
                    retry_count=retry_count,
                    error=str(exc),
                    correlation_id=effective_correlation_id,
                    worker_name=worker_name,
                    processing_ms=int((perf_counter() - started_perf) * 1000),
                    sessionmaker=celery_sessionmaker,
                )

            return {"status": "failed", "analysis_id": analysis_id, "error": str(exc)}

        finally:
            clear_correlation_id()
            structlog.contextvars.clear_contextvars()

    finally:
        await celery_engine.dispose()


async def _run_blocking_with_timeout(
    func,
    *args,
    timeout: int,
    error_label: str,
):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(func, *args),
            timeout=timeout,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(error_label) from exc


async def _claim_analysis_for_processing(
    parsed_analysis_id: UUID,
    parsed_document_id: UUID,
    sessionmaker,
) -> bool:
    async with sessionmaker() as session:
        try:
            claim_result = await session.execute(
                sa.update(DocumentAIAnalysisModel)
                .where(
                    DocumentAIAnalysisModel.id == parsed_analysis_id,
                    DocumentAIAnalysisModel.document_id == parsed_document_id,
                    DocumentAIAnalysisModel.status == "pending",
                )
                .values(status="processing", error_message=None)
            )

            claimed = int(claim_result.rowcount or 0) > 0

            if claimed:
                await session.commit()
            else:
                await session.rollback()

            return claimed

        except IntegrityError:
            await session.rollback()
            return False


async def _mark_analysis_failed(
    parsed_analysis_id: UUID,
    error_message: str,
    sessionmaker,
) -> bool:
    async with sessionmaker() as session:
        fail_result = await session.execute(
            sa.update(DocumentAIAnalysisModel)
            .where(
                DocumentAIAnalysisModel.id == parsed_analysis_id,
                DocumentAIAnalysisModel.status == "processing",
            )
            .values(status="failed", error_message=error_message[:2000])
        )

        changed = int(fail_result.rowcount or 0) > 0

        if changed:
            await session.commit()
        else:
            await session.rollback()

        return changed


async def _publish_failed_event(
    *,
    parsed_document_id: UUID,
    admission_id: UUID,
    document_id: UUID,
    analysis_id: UUID,
    retry_count: int,
    worker_name: str,
    processing_ms: int,
    error: str,
    correlation_id: str,
) -> None:
    await publish_domain_event(
        DomainEvent(
            event_type=DomainEventType.AI_PROCESSING_FAILED,
            entity_id=parsed_document_id,
            payload={
                "admission_id": str(admission_id),
                "document_id": str(document_id),
                "analysis_id": str(analysis_id),
                "retry_count": retry_count,
                "worker_name": worker_name,
                "processing_ms": processing_ms,
                "error": error,
                "correlation_id": correlation_id,
            },
        )
    )


async def _mark_failed_and_maybe_retry(
    *,
    parsed_document_id: UUID,
    parsed_analysis_id: UUID,
    admission_id: UUID,
    document_id: UUID,
    retry_count: int,
    error: str,
    correlation_id: str,
    worker_name: str,
    processing_ms: int,
    sessionmaker,
) -> None:
    next_analysis_id: UUID | None = None

    async with sessionmaker() as session:
        analysis_row = await session.execute(
            sa.update(DocumentAIAnalysisModel)
            .where(
                DocumentAIAnalysisModel.id == parsed_analysis_id,
                DocumentAIAnalysisModel.status == "processing",
            )
            .values(status="failed", error_message=error[:2000])
            .returning(DocumentAIAnalysisModel.model_used)
        )

        failed_row = analysis_row.first()

        if failed_row is None:
            await session.rollback()
            return

        await publish_domain_event(
            DomainEvent(
                event_type=DomainEventType.AI_PROCESSING_FAILED,
                entity_id=parsed_document_id,
                payload={
                    "admission_id": str(admission_id),
                    "document_id": str(document_id),
                    "analysis_id": str(parsed_analysis_id),
                    "retry_count": retry_count,
                    "worker_name": worker_name,
                    "processing_ms": processing_ms,
                    "error": error,
                    "correlation_id": correlation_id,
                },
            ),
            session=session,
        )

        if retry_count < _MAX_AUTO_RETRIES:
            next_analysis = DocumentAIAnalysisModel(
                document_id=parsed_document_id,
                status="pending",
                model_used=failed_row.model_used or "document_ai_v1",
                created_at=datetime.now(UTC),
            )

            session.add(next_analysis)
            await session.flush()
            next_analysis_id = next_analysis.id

        await session.commit()

    if next_analysis_id is not None:
        countdown = min(300, (2**retry_count) * 30)

        process_document_ai_job.apply_async(
            args=[
                str(admission_id),
                str(document_id),
                str(next_analysis_id),
                retry_count + 1,
                correlation_id,
            ],
            queue=DOCUMENT_AI_QUEUE,
            countdown=countdown,
            task_id=f"document_ai:{next_analysis_id}",
        )