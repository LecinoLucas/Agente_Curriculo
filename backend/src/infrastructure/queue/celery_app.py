from celery import Celery

from src.core.settings import settings
from src.observability.logging import configure_structured_logging

configure_structured_logging()

celery_app = Celery(
    "resume_ai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "src.interface.workers.analysis_tasks",
        "src.interface.workers.matching_tasks",
        "src.interface.workers.document_ai_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,          # só confirma o ack após a task terminar (safe retry)
    worker_prefetch_multiplier=1, # evita worker ficar com tasks demais na fila
    task_routes={
        "src.interface.workers.analysis_tasks.*": {"queue": "analysis.default"},
        "src.interface.workers.matching_tasks.*": {"queue": "matching.default"},
        "src.interface.workers.document_ai_tasks.*": {"queue": "document_ai.default"},
    },
    task_annotations={
        "src.interface.workers.analysis_tasks.process_analysis": {
            "max_retries": 3,
            "default_retry_delay": 30,  # segundos
        },
        "src.interface.workers.matching_tasks.match_analysis_to_job": {
            "max_retries": 3,
            "default_retry_delay": 30,
        },
        "src.interface.workers.document_ai_tasks.process_document_ai_job": {
            "max_retries": 0,
            "default_retry_delay": 30,
        },
    },
)
