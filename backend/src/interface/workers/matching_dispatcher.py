from __future__ import annotations

import asyncio
from uuid import UUID

import structlog

from src.core.settings import settings

logger = structlog.get_logger(__name__)

MATCHING_QUEUE = "matching"
DEV_MATCH_TIMEOUT_SECONDS = 20


async def enqueue_published_job_matches(analysis_id: UUID) -> int:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )

    SessionFactory = get_session_factory()

    async with SessionFactory() as session:
        limit = settings.MATCHING_AUTO_FANOUT_LIMIT

        jobs = await SQLAlchemyAnalysisRepository(
            session
        ).list_unmatched_published_jobs(
            analysis_id,
            limit=limit if limit > 0 else None,
        )

    if not jobs:
        logger.info(
            "matching.dispatcher.no_unmatched_jobs",
            analysis_id=str(analysis_id),
        )
        return 0

    if settings.ENABLE_DEV_MOCK:
        enqueued = await _enqueue_dev_matches(analysis_id, jobs)
        queue_name = "dev-inline"
    else:
        enqueued = _enqueue_celery_matches(analysis_id, jobs)
        queue_name = MATCHING_QUEUE

    logger.info(
        "matching.dispatcher.enqueued",
        analysis_id=str(analysis_id),
        jobs_enqueued=enqueued,
        fanout_limit=settings.MATCHING_AUTO_FANOUT_LIMIT,
        queue=queue_name,
    )

    return enqueued


async def _enqueue_dev_matches(analysis_id: UUID, jobs: list) -> int:
    from src.interface.workers.matching_tasks import _match_analysis_to_job_async

    enqueued = 0

    for job in jobs:
        job_id = str(job.id)
        analysis_id_str = str(analysis_id)

        try:
            task = asyncio.create_task(
                _safe_dev_match(
                    analysis_id=analysis_id_str,
                    job_id=job_id,
                    matcher=_match_analysis_to_job_async,
                )
            )

            task.add_done_callback(
                _log_dev_matching_result(
                    analysis_id=analysis_id_str,
                    job_id=job_id,
                )
            )

            enqueued += 1

        except RuntimeError as exc:
            logger.exception(
                "matching.dispatcher.dev_enqueue_failed",
                analysis_id=analysis_id_str,
                job_id=job_id,
                error=str(exc),
            )

    return enqueued


def _enqueue_celery_matches(analysis_id: UUID, jobs: list) -> int:
    from src.interface.workers.matching_tasks import match_analysis_to_job

    enqueued = 0
    analysis_id_str = str(analysis_id)

    for job in jobs:
        job_id = str(job.id)
        task_id = f"matching:{analysis_id_str}:{job_id}"

        match_analysis_to_job.apply_async(
            args=[analysis_id_str, job_id],
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
            timeout=DEV_MATCH_TIMEOUT_SECONDS,
        )

    except Exception as exc:
        logger.exception(
            "matching.dispatcher.dev_match_failed",
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
                "matching.dev.cancelled",
                analysis_id=analysis_id,
                job_id=job_id,
            )

        except Exception as exc:
            logger.exception(
                "matching.dev.background_failed",
                analysis_id=analysis_id,
                job_id=job_id,
                error=str(exc),
            )

    return _callback
