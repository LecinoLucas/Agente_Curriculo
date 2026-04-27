from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from src.observability.context import get_correlation_id

logger = structlog.get_logger(__name__)


class DomainEventType(StrEnum):
    DOCUMENT_UPLOADED = "DocumentUploaded"
    AI_PROCESSING_STARTED = "AIProcessingStarted"
    AI_PROCESSING_COMPLETED = "AIProcessingCompleted"
    AI_PROCESSING_FAILED = "AIProcessingFailed"
    ADMISSION_STATUS_CHANGED = "AdmissionStatusChanged"


@dataclass(frozen=True)
class DomainEvent:
    event_type: DomainEventType
    entity_id: UUID
    payload: dict[str, Any]
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


def _serialize_payload(event: DomainEvent) -> dict[str, Any]:
    payload = dict(event.payload)
    payload.setdefault("timestamp", event.timestamp.isoformat())
    correlation_id = payload.get("correlation_id") or get_correlation_id()
    if correlation_id:
        payload["correlation_id"] = str(correlation_id)
    return payload


async def publish_domain_event(
    event: DomainEvent,
    *,
    session: AsyncSession | None = None,
) -> None:
    payload = _serialize_payload(event)
    model = PipelineEventModel(
        event_type=event.event_type.value,
        entity_id=event.entity_id,
        payload=payload,
        created_at=event.timestamp,
    )

    try:
        # Always use an isolated transaction so observability never impacts
        # the business transaction or pipeline flow.
        _ = session  # reserved for future optimization, intentionally unused now.
        async with AsyncSessionFactory() as new_session:
            new_session.add(model)
            await new_session.commit()

        logger.info(
            "domain_event.published",
            event_type=event.event_type.value,
            entity_id=str(event.entity_id),
            correlation_id=payload.get("correlation_id"),
        )
    except Exception as exc:
        logger.warning(
            "domain_event.publish_failed",
            event_type=event.event_type.value,
            entity_id=str(event.entity_id),
            error=str(exc),
            correlation_id=payload.get("correlation_id"),
        )
