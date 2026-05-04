from __future__ import annotations

import asyncio
from uuid import UUID

import structlog

from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

MATCHING_SOFT_TIME_LIMIT_SECONDS = 45
MATCHING_TIME_LIMIT_SECONDS = 60


def _run_async(coro):
    return asyncio.run(coro)


@celery_app.task(
    bind=True,
    name="src.interface.workers.matching_tasks.match_analysis_to_job",
    max_retries=3,
    soft_time_limit=MATCHING_SOFT_TIME_LIMIT_SECONDS,
    time_limit=MATCHING_TIME_LIMIT_SECONDS,
)
def match_analysis_to_job(self, analysis_id: str, job_id: str):
    try:
        return _run_async(_match_analysis_to_job_async(analysis_id, job_id))

    except Exception as exc:
        logger.exception(
            "matching.task_failed",
            analysis_id=analysis_id,
            job_id=job_id,
            task_id=str(self.request.id),
            retries=self.request.retries,
            error=str(exc),
        )

        countdown = min(300, (2 ** self.request.retries) * 10)

        raise self.retry(
            exc=exc,
            countdown=countdown,
        ) from exc


async def _match_analysis_to_job_async(analysis_id: str, job_id: str) -> dict:
    from src.application.services.analysis_service import AnalysisService
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )

    try:
        analysis_uuid = UUID(str(analysis_id))
        job_uuid = UUID(str(job_id))
    except ValueError as exc:
        logger.error(
            "matching.invalid_uuid",
            analysis_id=analysis_id,
            job_id=job_id,
            error=str(exc),
        )
        raise RuntimeError("Invalid analysis_id or job_id") from exc

    SessionFactory = get_session_factory()

    async with SessionFactory() as session:
        try:
            service = AnalysisService(SQLAlchemyAnalysisRepository(session))

            match = await asyncio.wait_for(
                service.match_completed_analysis_to_job(
                    analysis_uuid,
                    job_uuid,
                ),
                timeout=35,
            )

            await session.commit()

            logger.info(
                "matching.completed",
                analysis_id=str(analysis_uuid),
                job_id=str(job_uuid),
                score=str(match.match_score),
                recommendation=match.recommendation,
            )

            return {
                "status": "completed",
                "analysis_id": str(analysis_uuid),
                "job_id": str(job_uuid),
                "match_score": str(match.match_score),
                "recommendation": match.recommendation,
            }

        except asyncio.TimeoutError as exc:
            await session.rollback()

            logger.exception(
                "matching.timeout",
                analysis_id=str(analysis_uuid),
                job_id=str(job_uuid),
                timeout_seconds=35,
            )

            raise RuntimeError("Matching timed out") from exc

        except Exception as exc:
            await session.rollback()

            logger.exception(
                "matching.failed",
                analysis_id=str(analysis_uuid),
                job_id=str(job_uuid),
                error=str(exc),
            )

            raise
