"""Periodic tasks for cleaning up stale document AI analyses."""

from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
import structlog

from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

CLEANUP_QUEUE = "maintenance"

_STALE_CLEANUP_BATCH_SIZE = 200


@celery_app.task(
    bind=True,
    name="src.interface.workers.stale_analysis_cleanup_tasks.cleanup_stale_processing_analyses",
    max_retries=1,
)
def cleanup_stale_processing_analyses(self, timeout_seconds: int = 120):  # type: ignore[override]
    """
    Find and reset document AI analyses stuck in 'processing' state.

    This runs periodically to catch cases where worker processes die or fail
    while processing a document, leaving the analysis in an intermediate state.
    """
    from asyncio import run

    return run(
        _cleanup_stale_processing_analyses_async(timeout_seconds=timeout_seconds)
    )


async def _cleanup_stale_processing_analyses_async(timeout_seconds: int = 120) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        cutoff_time = datetime.now(UTC) - timedelta(seconds=timeout_seconds)

        async with celery_sessionmaker() as session:
            result = await session.execute(
                sa.select(DocumentAIAnalysisModel)
                .where(
                    DocumentAIAnalysisModel.status == "processing",
                    DocumentAIAnalysisModel.created_at < cutoff_time,
                )
                .limit(_STALE_CLEANUP_BATCH_SIZE)
            )

            stale_analyses = result.scalars().all()

            count = 0
            for analysis in stale_analyses:
                analysis.status = "pending"
                analysis.error_message = "reset_from_stale_processing"
                count += 1

            if count > 0:
                await session.commit()
                logger.info(
                    "stale_analysis.cleanup_completed",
                    count=count,
                    timeout_seconds=timeout_seconds,
                )
            else:
                logger.info(
                    "stale_analysis.cleanup_no_stale",
                    timeout_seconds=timeout_seconds,
                )

            return {"cleaned": count, "timeout_seconds": timeout_seconds}

    finally:
        await celery_engine.dispose()
