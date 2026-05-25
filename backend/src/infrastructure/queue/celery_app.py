from celery import Celery
from celery.schedules import crontab

from src.core.settings import settings
from src.observability.logging import configure_structured_logging

# 🔥 garante logs estruturados no worker
configure_structured_logging()

celery_app = Celery(
    "resume_ai",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "src.interface.workers.analysis_tasks",
        "src.interface.workers.matching_tasks",
        "src.interface.workers.document_ai_tasks",
        "src.interface.workers.resume_extraction_tasks",
        "src.interface.workers.behavioral_ai_tasks",
    ],
)

celery_app.conf.update(
    # ─────────────────────────────────────────
    # SERIALIZATION
    # ─────────────────────────────────────────
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # ─────────────────────────────────────────
    # TIME
    # ─────────────────────────────────────────
    timezone="UTC",
    enable_utc=True,

    # ─────────────────────────────────────────
    # TRACKING
    # ─────────────────────────────────────────
    task_track_started=True,

    # ─────────────────────────────────────────
    # RELIABILITY
    # ─────────────────────────────────────────
    task_acks_late=True,
    worker_prefetch_multiplier=1,

    # 🔥 MAIS REALISTA PRA IA
    task_soft_time_limit=120,
    task_time_limit=180,

    # 🔥 evita leak de memória
    worker_max_tasks_per_child=50,

    # ─────────────────────────────────────────
    # DEFAULT ROUTING
    # ─────────────────────────────────────────
    task_default_queue="analysis",
    task_default_routing_key="analysis",

    # ─────────────────────────────────────────
    # QUEUES (PADRÃO ÚNICO)
    # ─────────────────────────────────────────
    task_routes={
        "src.interface.workers.analysis_tasks.*": {"queue": "analysis"},
        "src.interface.workers.matching_tasks.*": {"queue": "matching"},
        "src.interface.workers.document_ai_tasks.*": {"queue": "document_ai"},
        "src.interface.workers.resume_extraction_tasks.*": {"queue": "extraction"},
        "src.interface.workers.behavioral_ai_tasks.*": {"queue": "behavioral_ai"},
        "behavioral_ai.detect_stuck_evaluations": {"queue": "behavioral_ai"},
    },

    # ─────────────────────────────────────────
    # RETRY / RATE LIMIT
    # ─────────────────────────────────────────
    task_annotations={
        # IA
        "src.interface.workers.analysis_tasks.process_analysis": {
            "max_retries": 3,
            "default_retry_delay": 30,
            "rate_limit": "10/m",
        },

        # MATCH
        "src.interface.workers.matching_tasks.match_analysis_to_job": {
            "max_retries": 3,
            "default_retry_delay": 10,
        },

        # DOCUMENT AI (OCR)
        "src.interface.workers.document_ai_tasks.process_document_ai_job": {
            "max_retries": 0,
            "time_limit": 180,
        },
        "src.interface.workers.resume_extraction_tasks.process_resume_extraction": {
            "max_retries": 0,
            "time_limit": 180,
        },
        "src.interface.workers.behavioral_ai_tasks.process_behavioral_ai_evaluation": {
            "max_retries": 3,
            "default_retry_delay": 15,
            "time_limit": 120,
        },
        "behavioral_ai.detect_stuck_evaluations": {
            "max_retries": 0,
            "time_limit": 60,
        },
    },
    beat_schedule={
        "behavioral-ai-stuck-detection-every-15min": {
            "task": "behavioral_ai.detect_stuck_evaluations",
            "schedule": crontab(minute="*/15"),
        },
    },

    # ─────────────────────────────────────────
    # BROKER (REDIS)
    # ─────────────────────────────────────────
    broker_transport_options={
        "visibility_timeout": 3600,
    },

    # 🔥 evita fila travada invisível
    task_reject_on_worker_lost=True,
)
