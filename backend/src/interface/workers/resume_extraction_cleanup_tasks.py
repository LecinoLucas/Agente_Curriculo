"""Periodic task: detect and re-enqueue resume_versions stuck in 'processing'."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
import structlog

from src.infrastructure.database.models.resume_model import ResumeVersionModel
from src.infrastructure.queue.celery_app import celery_app
from src.interface.workers.resume_extraction_dispatcher import enqueue_resume_extraction

logger = structlog.get_logger(__name__)

# Route this task to the extraction queue — workers already consume it.
EXTRACTION_CLEANUP_QUEUE = "extraction"

# Extraction task time_limit is 180 s. We wait 5 min (300 s) before treating
# a 'processing' version as stuck. This leaves a 2-min safety margin above the
# hard kill timeout so a legitimately running extraction is never interrupted.
#
# We use uploaded_at as the proxy for "when extraction started" because
# ResumeVersionModel has no extraction_started_at column. This is safe because
# upload and task dispatch happen in the same request, so the gap between
# uploaded_at and actual extraction start is always < 1 s.
_STUCK_THRESHOLD_SECONDS = 300
_CLEANUP_BATCH_SIZE = 100


@celery_app.task(
    bind=True,
    name="src.interface.workers.resume_extraction_cleanup_tasks.cleanup_stuck_extractions",
    max_retries=0,
    time_limit=60,
)
def cleanup_stuck_extractions(self):  # type: ignore[override]
    return asyncio.run(_cleanup_stuck_extractions_async())


async def _cleanup_stuck_extractions_async() -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        cutoff = datetime.now(UTC) - timedelta(seconds=_STUCK_THRESHOLD_SECONDS)

        async with celery_sessionmaker() as session:
            result = await session.execute(
                sa.select(ResumeVersionModel)
                .where(
                    ResumeVersionModel.extraction_status == "processing",
                    ResumeVersionModel.uploaded_at < cutoff,
                )
                .limit(_CLEANUP_BATCH_SIZE)
            )
            stuck = result.scalars().all()

            if not stuck:
                logger.info("resume_extraction.cleanup_no_stuck")
                return {"reset": 0, "enqueued": 0}

            ids = [v.id for v in stuck]
            for v in stuck:
                v.extraction_status = "pending"
                v.extraction_error = None

            await session.commit()

        logger.info(
            "resume_extraction.cleanup_reset_stuck",
            count=len(ids),
        )

        enqueued = 0
        for version_id in ids:
            try:
                enqueue_resume_extraction(version_id)
                enqueued += 1
            except Exception as exc:
                logger.error(
                    "resume_extraction.cleanup_reenqueue_failed",
                    resume_version_id=str(version_id),
                    error=str(exc),
                )

        logger.info(
            "resume_extraction.cleanup_completed",
            reset=len(ids),
            enqueued=enqueued,
        )

        return {"reset": len(ids), "enqueued": enqueued}

    finally:
        await celery_engine.dispose()
