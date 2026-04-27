from __future__ import annotations

import logging
from typing import Any

import structlog

from src.core.settings import settings
from src.observability.context import get_correlation_id


def _add_observability_fields(
    logger: Any,  # noqa: ARG001
    method_name: str,  # noqa: ARG001
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    event_dict.setdefault("service", "resume-ai-system-backend")
    event_dict.setdefault("environment", settings.APP_ENV)
    if "event" in event_dict:
        event_dict["message"] = event_dict.pop("event")

    correlation_id = get_correlation_id()
    if correlation_id and "correlation_id" not in event_dict:
        event_dict["correlation_id"] = correlation_id
    return event_dict


def configure_structured_logging() -> None:
    logging.basicConfig(format="%(message)s", level=logging.INFO)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_logger_name,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _add_observability_fields,
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
