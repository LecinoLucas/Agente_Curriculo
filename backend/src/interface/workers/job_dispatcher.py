"""Job publication dispatcher - enqueues matching when jobs are published."""

from __future__ import annotations

import asyncio
from uuid import UUID

import structlog

from src.core.settings import settings

logger = structlog.get_logger(__name__)

MATCHING_QUEUE = "matching"


async def enqueue_job_publication_matches(job_id: UUID) -> int:
    """
    Quando uma vaga é publicada, enfileira matching com análises já concluídas.
    """

    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.repositories.sqlalchemy_job_repository import (
        SQLAlchemyJobRepository,
    )

    async with AsyncSessionFactory() as session:
        limit = settings.MATCHING_AUTO_FANOUT_LIMIT

        analyses = await SQLAlchemyJobRepository(
            session
        ).list_completed_unmatched_analyses(
            job_id,
            limit=limit if limit > 0 else None,
        )

    if not analyses:
        logger.info(
            "job_dispatcher.no_completed_analyses",
            job_id=str(job_id),
        )
        return 0

    if settings.ENABLE_DEV_MOCK:
        enqueued = await _enqueue_dev_matches(job_id, analyses)
        queue_name = "dev-inline"
    else:
        enqueued = _enqueue_celery_matches(job_id, analyses)
        queue_name = MATCHING_QUEUE

    logger.info(
        "job_dispatcher.enqueued",
        job_id=str(job_id),
        analyses_enqueued=enqueued,
        fanout_limit=settings.MATCHING_AUTO_FANOUT_LIMIT,
        queue=queue_name,
    )

    return enqueued


async def _enqueue_dev_matches(job_id: UUID, analyses: list) -> int:
    from src.interface.workers.matching_tasks import _match_analysis_to_job_async

    enqueued = 0

    for analysis in analyses:
        analysis_id = str(analysis.id)

        try:
            task = asyncio.create_task(
                _safe_dev_match(
                    analysis_id=analysis_id,
                    job_id=str(job_id),
                    matcher=_match_analysis_to_job_async,
                )
            )

            task.add_done_callback(
                _log_dev_matching_result(
                    analysis_id=analysis_id,
                    job_id=str(job_id),
                )
            )

            enqueued += 1

        except RuntimeError as exc:
            logger.exception(
                "job_dispatcher.dev_enqueue_failed",
                analysis_id=analysis_id,
                job_id=str(job_id),
                error=str(exc),
            )

    return enqueued


def _enqueue_celery_matches(job_id: UUID, analyses: list) -> int:
    from src.interface.workers.matching_tasks import match_analysis_to_job

    enqueued = 0

    for analysis in analyses:
        analysis_id = str(analysis.id)
        job_id_str = str(job_id)

        task_id = f"matching:{analysis_id}:{job_id_str}"

        match_analysis_to_job.apply_async(
            args=[analysis_id, job_id_str],
            queue=MATCHING_QUEUE,
            task_id=task_id,
        )

        enqueued += 1

    return enqueued


async def _safe_dev_match(
    *,
    analysis_id: str,
    job_id: str,
    matcher,
) -> dict:
    try:
        return await asyncio.wait_for(
            matcher(analysis_id, job_id),
            timeout=20,
        )
    except Exception as exc:
        logger.exception(
            "job_dispatcher.dev_match_failed",
            analysis_id=analysis_id,
            job_id=job_id,
            error=str(exc),
        )
        return {
            "status": "failed",
            "analysis_id": analysis_id,
            "job_id": job_id,
            "error": str(exc),
        }


def _log_dev_matching_result(analysis_id: str, job_id: str):
    def _callback(done_task: asyncio.Task[dict]) -> None:
        try:
            done_task.result()
        except asyncio.CancelledError:
            logger.warning(
                "job_dispatcher.dev_match_cancelled",
                analysis_id=analysis_id,
                job_id=job_id,
            )
        except Exception as exc:
            logger.exception(
                "job_dispatcher.dev_background_failed",
                analysis_id=analysis_id,
                job_id=job_id,
                error=str(exc),
            )

    return _callback