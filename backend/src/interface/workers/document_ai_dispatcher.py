from uuid import UUID

from src.interface.workers.document_ai_tasks import process_document_ai_job


def enqueue_document_ai(
    admission_id: UUID,
    document_id: UUID,
    analysis_id: UUID | None = None,
    retry_count: int = 0,
    countdown_seconds: int = 0,
    correlation_id: str | None = None,
) -> None:
    analysis_id_value = str(analysis_id) if analysis_id is not None else None
    process_document_ai_job.apply_async(
        args=[
            str(admission_id),
            str(document_id),
            analysis_id_value,
            retry_count,
            correlation_id,
        ],
        queue="document_ai.default",
        countdown=countdown_seconds,
    )
