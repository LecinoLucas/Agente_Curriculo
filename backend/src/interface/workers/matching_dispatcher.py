import asyncio
from uuid import UUID

import structlog

from src.core.settings import settings

logger = structlog.get_logger(__name__)


async def enqueue_published_job_matches(analysis_id: UUID) -> int:
    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )

    async with AsyncSessionFactory() as session:
        limit = settings.MATCHING_AUTO_FANOUT_LIMIT
        jobs = await SQLAlchemyAnalysisRepository(session).list_unmatched_published_jobs(
            analysis_id,
            limit=limit if limit > 0 else None,
        )

    if not jobs:
        logger.info("matching.dispatcher.no_unmatched_jobs", analysis_id=str(analysis_id))
        return 0

    if settings.ENABLE_DEV_MOCK:
        from src.interface.workers.matching_tasks import _match_analysis_to_job_async

        for job in jobs:
            task = asyncio.create_task(_match_analysis_to_job_async(str(analysis_id), str(job.id)))
            task.add_done_callback(_log_dev_matching_result(str(analysis_id), str(job.id)))
    else:
        from src.interface.workers.matching_tasks import match_analysis_to_job

        for job in jobs:
            match_analysis_to_job.apply_async(
                args=[str(analysis_id), str(job.id)],
                queue="matching.default",
            )

    logger.info(
        "matching.dispatcher.enqueued",
        analysis_id=str(analysis_id),
        jobs_enqueued=len(jobs),
        fanout_limit=settings.MATCHING_AUTO_FANOUT_LIMIT,
        queue="matching.default" if not settings.ENABLE_DEV_MOCK else "dev-inline",
    )
    return len(jobs)


def _log_dev_matching_result(analysis_id: str, job_id: str):
    def _callback(done_task: asyncio.Task[dict]) -> None:
        try:
            done_task.result()
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "matching.dev.background_failed",
                analysis_id=analysis_id,
                job_id=job_id,
                error=str(exc),
            )

    return _callback
