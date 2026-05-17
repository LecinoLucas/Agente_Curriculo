from __future__ import annotations

import asyncio
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
            "resume_extraction.enqueue_failed_using_inline_fallback",
            resume_version_id=resume_version_id_str,
            task_id=task_id,
            queue=EXTRACTION_QUEUE,
            error=str(exc),
        )
        _enqueue_inline(resume_version_id_str)


def _enqueue_inline(resume_version_id_str: str) -> None:
    from src.interface.workers.resume_extraction_tasks import _process_resume_extraction_async

    async def _run() -> None:
        try:
            await _process_resume_extraction_async(
                resume_version_id=resume_version_id_str,
                worker_name="inline-fallback",
            )
        except Exception as exc:
            logger.exception(
                "resume_extraction.inline_fallback_failed",
                resume_version_id=resume_version_id_str,
                error=str(exc),
            )

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_run())
    except RuntimeError:
        logger.error(
            "resume_extraction.no_event_loop_for_inline_fallback",
            resume_version_id=resume_version_id_str,
        )

