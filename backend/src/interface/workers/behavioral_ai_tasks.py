from __future__ import annotations

import asyncio
from uuid import UUID

import structlog

from src.application.services.behavioral_ai_evaluation_service import BehavioralAIEvaluationService
from src.core.log_sanitizer import sanitize_log_text
from src.core.settings import settings
from src.infrastructure.ai.factory import AIServiceFactory
from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

BEHAVIORAL_AI_SOFT_TIME_LIMIT_SECONDS = 90
BEHAVIORAL_AI_TIME_LIMIT_SECONDS = 120


def _run_async(coro):
    return asyncio.run(coro)


@celery_app.task(
    bind=True,
    name="src.interface.workers.behavioral_ai_tasks.process_behavioral_ai_evaluation",
    max_retries=2,
    soft_time_limit=BEHAVIORAL_AI_SOFT_TIME_LIMIT_SECONDS,
    time_limit=BEHAVIORAL_AI_TIME_LIMIT_SECONDS,
)
def process_behavioral_ai_evaluation(self, evaluation_id: str):  # type: ignore[override]
    task_id = str(self.request.id)
    logger.info(
        "behavioral_ai.task_started",
        evaluation_id=evaluation_id,
        task_id=task_id,
        retry_count=self.request.retries,
    )
    try:
        return _run_async(_process_behavioral_ai_evaluation_async(evaluation_id, task_id))
    except Exception as exc:
        logger.exception(
            "behavioral_ai.task_failed",
            evaluation_id=evaluation_id,
            task_id=task_id,
            retries=self.request.retries,
            error=sanitize_log_text(str(exc)) or type(exc).__name__,
        )
        countdown = min(180, (2 ** self.request.retries) * 15)
        raise self.retry(exc=exc, countdown=countdown) from exc


@celery_app.task(
    bind=True,
    name="behavioral_ai.detect_stuck_evaluations",
    max_retries=0,
)
def detect_stuck_behavioral_ai_evaluations(self):  # type: ignore[override]
    task_id = str(self.request.id)
    return _run_async(_detect_stuck_behavioral_ai_evaluations_async(task_id))


async def _process_behavioral_ai_evaluation_async(evaluation_id: str, task_id: str) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    try:
        evaluation_uuid = UUID(str(evaluation_id))
    except ValueError as exc:
        logger.error(
            "behavioral_ai.invalid_uuid",
            evaluation_id=evaluation_id,
            task_id=task_id,
            error=str(exc),
        )
        return {"status": "failed", "reason": "invalid_evaluation_id"}

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()
    try:
        async with celery_sessionmaker() as session:
            ai_service = AIServiceFactory.create(settings.AI_PROVIDER, settings.AI_MODEL_ID)
            service = BehavioralAIEvaluationService(session, ai_service)
            evaluation = await service.process_evaluation(evaluation_id=evaluation_uuid, task_id=task_id)
            await session.commit()

            if evaluation is None:
                logger.warning(
                    "behavioral_ai.evaluation_not_found",
                    evaluation_id=str(evaluation_uuid),
                    task_id=task_id,
                )
                return {
                    "status": "not_found",
                    "evaluation_id": str(evaluation_uuid),
                }

            logger.info(
                "behavioral_ai.task_completed",
                evaluation_id=str(evaluation.id),
                assignment_id=str(evaluation.assignment_id),
                status=evaluation.status,
                task_id=task_id,
            )
            return {
                "status": evaluation.status,
                "evaluation_id": str(evaluation.id),
                "assignment_id": str(evaluation.assignment_id),
            }
    finally:
        await celery_engine.dispose()


async def _detect_stuck_behavioral_ai_evaluations_async(task_id: str) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()
    try:
        async with celery_sessionmaker() as session:
            service = BehavioralAIEvaluationService(session)
            logger.info(
                "behavioral_ai.stuck_detection_started",
                task_id=task_id,
            )
            stuck_items = await service.list_stuck_behavioral_ai_evaluations()
            total_found = len(stuck_items)
            marked = await service.mark_stuck_as_failed(stuck_evaluations=stuck_items)
            await session.commit()
            logger.info(
                "behavioral_ai.stuck_detection_completed",
                task_id=task_id,
                total_found=total_found,
                total_marked=marked,
            )
            return {
                "status": "ok",
                "task_id": task_id,
                "total_found": total_found,
                "total_marked": marked,
                "evaluations_marked_failed": marked,
            }
    finally:
        await celery_engine.dispose()
