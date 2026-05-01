"""Job publication dispatcher - enqueues matching when jobs are published."""

import asyncio
from uuid import UUID

import structlog

from src.core.settings import settings

logger = structlog.get_logger(__name__)


async def enqueue_job_publication_matches(job_id: UUID) -> int:
    """
    When a job is published, enqueue matching with all completed analyses.

    This is the inverse of analysis completion: when an analysis is completed,
    it matches with all published jobs. When a job is published, it should
    match with all completed analyses.
    """
    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

    async with AsyncSessionFactory() as session:
        limit = settings.MATCHING_AUTO_FANOUT_LIMIT
        analyses = await SQLAlchemyJobRepository(session).list_completed_unmatched_analyses(
            job_id,
            limit=limit if limit > 0 else None,
        )

    if not analyses:
        logger.info("job_dispatcher.no_completed_analyses", job_id=str(job_id))
        return 0

    if settings.ENABLE_DEV_MOCK:
        from src.interface.workers.matching_tasks import _match_analysis_to_job_async

        for analysis in analyses:
            task = asyncio.create_task(_match_analysis_to_job_async(str(analysis.id), str(job_id)))
            task.add_done_callback(_log_dev_matching_result(str(analysis.id), str(job_id)))
    else:
        from src.interface.workers.matching_tasks import match_analysis_to_job

        for analysis in analyses:
            match_analysis_to_job.apply_async(
                args=[str(analysis.id), str(job_id)],
                queue="matching.default",
            )

    logger.info(
        "job_dispatcher.enqueued",
        job_id=str(job_id),
        analyses_enqueued=len(analyses),
        fanout_limit=settings.MATCHING_AUTO_FANOUT_LIMIT,
        queue="matching.default" if not settings.ENABLE_DEV_MOCK else "dev-inline",
    )
    return len(analyses)


def _log_dev_matching_result(analysis_id: str, job_id: str):
    def _callback(done_task: asyncio.Task[dict]) -> None:
        try:
            done_task.result()
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "job_dispatcher.dev.background_failed",
                analysis_id=analysis_id,
                job_id=job_id,
                error=str(exc),
            )

    return _callback
