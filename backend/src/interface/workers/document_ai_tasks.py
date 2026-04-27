from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import perf_counter
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.exc import IntegrityError

from app.modules.admission.models.admission_models import CandidateDocument
from app.modules.document_processing.services.document_ai_service import (
    extract_structured_data,
)
from app.modules.document_processing.services.document_ai_validator import (
    validate_structured_data,
)
from app.modules.document_processing.services.document_processing_service import (
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

_MAX_AUTO_RETRIES = 2


@celery_app.task(
    bind=True,
    name="src.interface.workers.document_ai_tasks.process_document_ai_job",
    max_retries=0,
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
    from src.infrastructure.database.connection import AsyncSessionFactory

    if analysis_id is None:
        return {"status": "skipped", "reason": "analysis_id_required"}

    effective_correlation_id = correlation_id or f"doc-ai:{document_id}:{analysis_id or 'unknown'}"
    set_correlation_id(effective_correlation_id)
    structlog.contextvars.bind_contextvars(
        correlation_id=effective_correlation_id,
        admission_id=admission_id,
        document_id=document_id,
        analysis_id=analysis_id,
        worker_name=worker_name,
    )

    parsed_admission_id = UUID(admission_id)
    parsed_document_id = UUID(document_id)
    parsed_analysis_id = UUID(analysis_id)
    service = DocumentProcessingService()
    started_perf = perf_counter()

    claimed = await _claim_analysis_for_processing(
        parsed_analysis_id=parsed_analysis_id,
        parsed_document_id=parsed_document_id,
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

    try:
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
        async with AsyncSessionFactory() as session:
            analysis = await session.scalar(
                sa.select(DocumentAIAnalysisModel).where(
                    DocumentAIAnalysisModel.id == parsed_analysis_id
                )
            )
            if analysis is None:
                return {"status": "skipped", "analysis_id": analysis_id, "reason": "analysis_not_found"}

            document = await session.scalar(
                sa.select(CandidateDocument).where(
                    CandidateDocument.id == parsed_document_id,
                    CandidateDocument.admission_id == parsed_admission_id,
                )
            )
            if document is None:
                failed = await _mark_analysis_failed(
                    parsed_analysis_id=parsed_analysis_id,
                    error_message="document_not_found_for_admission",
                )
                if failed:
                    await publish_domain_event(
                        DomainEvent(
                            event_type=DomainEventType.AI_PROCESSING_FAILED,
                            entity_id=parsed_document_id,
                            payload={
                                "admission_id": admission_id,
                                "document_id": document_id,
                                "analysis_id": analysis_id,
                                "retry_count": retry_count,
                                "worker_name": worker_name,
                                "processing_ms": int((perf_counter() - started_perf) * 1000),
                                "error": "document_not_found_for_admission",
                                "correlation_id": effective_correlation_id,
                            },
                        )
                    )
                return {"status": "document_not_found", "analysis_id": analysis_id}

            processed = service.process_document(document.file_path)
            structured_data = extract_structured_data(processed.clean_text)
            validation = validate_structured_data(structured_data)

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
                    clean_text=processed.clean_text,
                    structured_data=structured_data,
                    confidence=float(structured_data.get("confidence", 0.0) or 0.0),
                    status="processed",
                    error_message=error_message,
                )
            )
            if int(update_result.rowcount or 0) == 0:
                await session.rollback()
                return {"status": "skipped", "analysis_id": analysis_id, "reason": "state_changed"}

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
        )
        return {"status": "failed", "analysis_id": analysis_id, "error": str(exc)}
    finally:
        clear_correlation_id()
        structlog.contextvars.clear_contextvars()


async def _claim_analysis_for_processing(
    parsed_analysis_id: UUID,
    parsed_document_id: UUID,
) -> bool:
    from src.infrastructure.database.connection import AsyncSessionFactory

    async with AsyncSessionFactory() as session:
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


async def _mark_analysis_failed(parsed_analysis_id: UUID, error_message: str) -> bool:
    from src.infrastructure.database.connection import AsyncSessionFactory

    async with AsyncSessionFactory() as session:
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


async def _mark_failed_and_maybe_retry(
    parsed_document_id: UUID,
    parsed_analysis_id: UUID,
    admission_id: UUID,
    document_id: UUID,
    retry_count: int,
    error: str,
    correlation_id: str,
    worker_name: str,
    processing_ms: int,
) -> None:
    from src.infrastructure.database.connection import AsyncSessionFactory

    async with AsyncSessionFactory() as session:
        analysis_row = await session.execute(
            sa.update(DocumentAIAnalysisModel)
            .where(
                DocumentAIAnalysisModel.id == parsed_analysis_id,
                DocumentAIAnalysisModel.status == "processing",
            )
            .values(status="failed", error_message=error[:2000])
            .returning(
                DocumentAIAnalysisModel.model_used,
                DocumentAIAnalysisModel.status,
            )
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

        next_analysis_id: UUID | None = None
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
        countdown = (2 ** retry_count) * 30
        process_document_ai_job.apply_async(
            args=[
                str(admission_id),
                str(document_id),
                str(next_analysis_id),
                retry_count + 1,
                correlation_id,
            ],
            queue="document_ai.default",
            countdown=countdown,
        )
