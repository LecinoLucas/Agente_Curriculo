from __future__ import annotations

from uuid import UUID

import structlog

from src.core.settings import settings
from src.interface.workers.analysis_tasks import process_analysis
from src.interface.workers.dev_analysis_processor import enqueue_dev_analysis

logger = structlog.get_logger(__name__)
ANALYSIS_QUEUE = "analysis"


def enqueue_analysis(
    analysis_id: UUID,
    *,
    delay_seconds: int | None = None,
) -> None:
    """
    Enfileira processamento de análise com segurança e rastreabilidade.
    """

    analysis_id_str = str(analysis_id)

    # ─────────────────────────────────────────
    # DEV MODE
    # ─────────────────────────────────────────
    if settings.ENABLE_DEV_MOCK:
        logger.info(
            "enqueue_analysis.dev_mode",
            analysis_id=analysis_id_str,
        )
        enqueue_dev_analysis(analysis_id)
        return

    # ─────────────────────────────────────────
    # TASK ID (idempotência básica)
    # ─────────────────────────────────────────
    task_id = f"analysis:{analysis_id_str}"

    # ─────────────────────────────────────────
    # OPTIONS
    # ─────────────────────────────────────────
    options: dict = {
        "task_id": task_id,
        "queue": ANALYSIS_QUEUE,
    }

    if delay_seconds:
        options["countdown"] = delay_seconds

    # ─────────────────────────────────────────
    # LOG
    # ─────────────────────────────────────────
    logger.info(
        "analysis.enqueued",
        analysis_id=analysis_id_str,
        task_id=task_id,
        queue=ANALYSIS_QUEUE,
        delay=delay_seconds,
    )

    # ─────────────────────────────────────────
    # DISPATCH
    # ─────────────────────────────────────────
    process_analysis.apply_async(
        args=[analysis_id_str],
        **options,
    )
