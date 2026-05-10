from __future__ import annotations

from uuid import UUID

import structlog

from src.interface.workers.resume_extraction_tasks import process_resume_extraction

logger = structlog.get_logger(__name__)
EXTRACTION_QUEUE = "extraction"


def enqueue_resume_extraction(resume_version_id: UUID) -> None:
    resume_version_id_str = str(resume_version_id)
    task_id = f"resume-extraction:{resume_version_id_str}"

    logger.info(
        "resume_extraction.enqueued",
        resume_version_id=resume_version_id_str,
        task_id=task_id,
        queue=EXTRACTION_QUEUE,
    )

    try:
        process_resume_extraction.apply_async(
            args=[resume_version_id_str],
            task_id=task_id,
            queue=EXTRACTION_QUEUE,
        )
    except Exception as exc:
        logger.warning(
            "resume_extraction.enqueue_failed",
            resume_version_id=resume_version_id_str,
            task_id=task_id,
            queue=EXTRACTION_QUEUE,
            error=str(exc),
        )

