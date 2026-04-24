from uuid import UUID

from src.core.settings import settings
from src.interface.workers.dev_analysis_processor import enqueue_dev_analysis


def enqueue_analysis(analysis_id: UUID) -> None:
    if settings.ENABLE_DEV_MOCK:
        enqueue_dev_analysis(analysis_id)
        return

    from src.interface.workers.analysis_tasks import process_analysis

    process_analysis.apply_async(args=[str(analysis_id)], queue="analysis.default")
