from __future__ import annotations

from uuid import UUID

import structlog

from src.core.settings import settings
from src.interface.workers.behavioral_ai_tasks import process_behavioral_ai_evaluation

logger = structlog.get_logger(__name__)

BEHAVIORAL_AI_QUEUE = "behavioral_ai"


def enqueue_behavioral_ai_evaluation(evaluation_id: UUID) -> None:
    evaluation_id_str = str(evaluation_id)
    task_id = f"behavioral_ai:{evaluation_id_str}"

    logger.info(
        "behavioral_ai.enqueue_requested",
        evaluation_id=evaluation_id_str,
        task_id=task_id,
        queue=BEHAVIORAL_AI_QUEUE,
    )

    if settings.ENABLE_DEV_MOCK:
        process_behavioral_ai_evaluation.apply(args=[evaluation_id_str])
        return

    process_behavioral_ai_evaluation.apply_async(
        args=[evaluation_id_str],
        task_id=task_id,
        queue=BEHAVIORAL_AI_QUEUE,
    )
