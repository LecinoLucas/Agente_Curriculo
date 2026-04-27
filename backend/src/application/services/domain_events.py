"""Domain events emitted by application services.

Events are plain dataclasses — no framework coupling. The service creates and
dispatches them via `dispatch_event`; when a real event bus is ready, only that
function needs to change.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

import structlog

from src.observability.context import get_correlation_id

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class CandidateStageChangedEvent:
    """Emitted every time a candidate moves between pipeline stages."""

    candidate_id: UUID
    job_id: UUID
    from_stage: str | None
    to_stage: str
    trigger: str          # 'manual' | 'auto_match' | 'system'
    moved_by: UUID | None
    moved_at: datetime
    reason: str | None = None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(UTC))


def dispatch_event(event: CandidateStageChangedEvent) -> None:
    """Extension point for domain event dispatching.

    Currently logs the event. Replace the body with a Celery task, Redis
    publish, or webhook call when the integration is ready — no other file
    needs to change.
    """
    logger.info(
        "pipeline.stage_changed",
        candidate_id=str(event.candidate_id),
        job_id=str(event.job_id),
        from_stage=event.from_stage,
        to_stage=event.to_stage,
        trigger=event.trigger,
        moved_by=str(event.moved_by) if event.moved_by else None,
        reason=event.reason,
        moved_at=event.moved_at.isoformat(),
        occurred_at=event.occurred_at.isoformat(),
        correlation_id=get_correlation_id(),
    )
