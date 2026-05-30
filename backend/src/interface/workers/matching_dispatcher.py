import asyncio
from uuid import UUID

import structlog

from src.core.settings import settings
from src.infrastructure.cache.redis_client import get_redis

logger = structlog.get_logger(__name__)

_RECOMPUTE_DEBOUNCE_TTL_SECONDS = 60
_RECOMPUTE_PENDING_KEY_PREFIX = "job_match_recompute:pending:"


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


async def enqueue_job_match_recompute(job_id: UUID) -> None:
    """Enqueue background match recomputation for active pipeline candidates.

    Uses persisted profiles — never calls LLM or AI provider.
    Debounces duplicate enqueues via Redis: if a pending key already exists
    for this job_id, the new enqueue is skipped (debounce window = 60 s).
    Falls back to unconditional enqueue if Redis is unavailable.
    """
    pending_key = f"{_RECOMPUTE_PENDING_KEY_PREFIX}{job_id}"

    should_enqueue = await _acquire_debounce_lock(str(job_id), pending_key)
    if not should_enqueue:
        return

    _do_enqueue(str(job_id))


def _do_enqueue(job_id: str) -> None:
    """Perform the actual Celery enqueue (or dev-mock asyncio task)."""
    if settings.ENABLE_DEV_MOCK:
        from src.interface.workers.matching_tasks import _recompute_job_matches_async

        task = asyncio.create_task(_recompute_job_matches_async(job_id))
        task.add_done_callback(_log_recompute_done(job_id))
    else:
        from src.interface.workers.matching_tasks import recompute_job_matches_task

        recompute_job_matches_task.apply_async(
            args=[job_id],
            countdown=2,
            queue="matching.default",
        )

    logger.info("job_matches_recompute_enqueued", job_id=job_id)


async def _acquire_debounce_lock(job_id: str, pending_key: str) -> bool:
    """Try to set the Redis debounce key. Returns True if enqueue should proceed.

    Uses SET NX EX so the key is atomic and self-expiring (no eternal lock).
    On any Redis error, falls back to unconditional enqueue (returns True).
    """
    try:
        redis = await get_redis()
        was_set = await redis.set(
            pending_key,
            "1",
            nx=True,
            ex=_RECOMPUTE_DEBOUNCE_TTL_SECONDS,
        )
        if not was_set:
            logger.info(
                "job_matches_recompute_skipped_duplicate",
                job_id=job_id,
                debounce_ttl_s=_RECOMPUTE_DEBOUNCE_TTL_SECONDS,
            )
            return False

        return True
    except Exception as exc:
        logger.warning(
            "job_matches_recompute_debounce_unavailable",
            job_id=job_id,
            error=str(exc),
        )
        return True  # fallback: enqueue unconditionally


def _log_recompute_done(job_id: str):
    def _callback(done_task: asyncio.Task[dict]) -> None:
        try:
            done_task.result()
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.exception(
                "recompute_job_matches.dev.background_failed",
                job_id=job_id,
                error=str(exc),
            )

    return _callback
