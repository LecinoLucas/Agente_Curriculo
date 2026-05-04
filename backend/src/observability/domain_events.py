from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from src.infrastructure.database.connection import AsyncSessionFactory
from src.observability.context import get_correlation_id

logger = structlog.get_logger(__name__)


class DomainEventType(Enum):
    AI_PROCESSING_STARTED = "ai.processing.started"
    AI_PROCESSING_COMPLETED = "ai.processing.completed"
    AI_PROCESSING_FAILED = "ai.processing.failed"
    DOCUMENT_UPLOADED = "document.uploaded"
    ADMISSION_STATUS_CHANGED = "admission.status_changed"
    CANDIDATE_JOB_TRANSFERRED = "candidate.job.transferred"


@dataclass(frozen=True)
class DomainEvent:
    event_type: DomainEventType
    entity_id: UUID
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


async def publish_domain_event(event: DomainEvent, session: AsyncSession | None = None) -> None:
    """Persist a ocorrência na tabela `pipeline_events`.

    Se um `session` for fornecido, o evento é adicionado a essa sessão (sem
    commit) para que o chamador controle a transação. Caso contrário, a
    função criará uma sessão própria e fará commit imediatamente.
    """
    try:
        row = PipelineEventModel(
            event_type=event.event_type.value,
            entity_id=event.entity_id,
            payload=event.payload or {},
            created_at=event.timestamp,
        )

        if session is not None:
            session.add(row)
            # Não comitar aqui — o chamador pode querer agrupar operações.
            try:
                await session.flush()
            except Exception:
                # flush pode falhar dependendo do contexto transacional; ignoramos.
                logger.debug("observability.pipeline_event_flush_failed", event_type=event.event_type.value)
            return

        # Sem sessão passada -> criar e commitar internamente.
        async with AsyncSessionFactory() as s:
            s.add(row)
            await s.commit()

    except Exception as exc:  # pragma: no cover - logging path
        logger.exception("observability.publish_domain_event_failed", error=str(exc), event_type=event.event_type.value)