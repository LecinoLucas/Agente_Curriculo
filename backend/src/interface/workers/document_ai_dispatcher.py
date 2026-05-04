from __future__ import annotations

from uuid import UUID

import structlog

from src.interface.workers.document_ai_tasks import process_document_ai_job

logger = structlog.get_logger(__name__)


DOCUMENT_AI_QUEUE = "document_ai"


def enqueue_document_ai(
    admission_id: UUID,
    document_id: UUID,
    analysis_id: UUID | None = None,
    retry_count: int = 0,
    countdown_seconds: int = 0,
    correlation_id: str | None = None,
) -> None:
    admission_id_value = str(admission_id)
    document_id_value = str(document_id)
    analysis_id_value = str(analysis_id) if analysis_id is not None else None

    safe_countdown = max(0, int(countdown_seconds or 0))
    safe_retry_count = max(0, int(retry_count or 0))

    task_id = f"document_ai:{document_id_value}"

    logger.info(
        "document_ai.enqueue",
        admission_id=admission_id_value,
        document_id=document_id_value,
        analysis_id=analysis_id_value,
        retry_count=safe_retry_count,
        countdown_seconds=safe_countdown,
        correlation_id=correlation_id,
        task_id=task_id,
        queue=DOCUMENT_AI_QUEUE,
    )

    process_document_ai_job.apply_async(
        args=[
            admission_id_value,
            document_id_value,
            analysis_id_value,
            safe_retry_count,
            correlation_id,
        ],
        queue=DOCUMENT_AI_QUEUE,
        countdown=safe_countdown,
        task_id=task_id,
    )