from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import mean
from typing import Any, AsyncIterator
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.pipeline_event_model import PipelineEventModel
from src.observability.domain_events import DomainEventType


@dataclass(slots=True)
class EventRow:
    event_type: str
    entity_id: UUID
    payload: dict[str, Any]
    created_at: datetime


class PipelineMetricsService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ─────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────

    def _safe_int(self, value: Any) -> int | None:
        try:
            return int(value)
        except Exception:
            return None

    async def _stream_events(
        self,
        stmt,
    ) -> AsyncIterator[EventRow]:
        result = await self._session.stream(stmt)

        async for row in result:
            yield EventRow(
                event_type=row.event_type,
                entity_id=row.entity_id,
                payload=dict(row.payload or {}),
                created_at=row.created_at,
            )

    # ─────────────────────────────────────────
    # METRICS
    # ─────────────────────────────────────────

    async def get_metrics(
        self,
        *,
        window_hours: int = 24,
        limit: int = 5000,
    ) -> dict[str, Any]:

        since = datetime.now(UTC) - timedelta(hours=window_hours)

        stmt = (
            sa.select(
                PipelineEventModel.event_type,
                PipelineEventModel.entity_id,
                PipelineEventModel.payload,
                PipelineEventModel.created_at,
            )
            .where(PipelineEventModel.created_at >= since)
            .order_by(PipelineEventModel.created_at.asc())
            .limit(limit)
        )

        events: list[EventRow] = []

        async for event in self._stream_events(stmt):
            events.append(event)

        return self._aggregate(events, since, window_hours)

    # ─────────────────────────────────────────
    # TRACE
    # ─────────────────────────────────────────

    async def get_trace_by_correlation(
        self,
        correlation_id: str,
        *,
        limit: int = 500,
    ) -> dict[str, Any]:

        stmt = (
            sa.select(
                PipelineEventModel.event_type,
                PipelineEventModel.entity_id,
                PipelineEventModel.payload,
                PipelineEventModel.created_at,
            )
            .where(
                sa.cast(
                    PipelineEventModel.payload["correlation_id"].astext,
                    sa.String,
                )
                == correlation_id
            )
            .order_by(PipelineEventModel.created_at.asc())
            .limit(limit)
        )

        events = []

        async for event in self._stream_events(stmt):
            events.append(event)

        return {
            "correlation_id": correlation_id,
            "event_count": len(events),
            "events": [
                {
                    "event_type": e.event_type,
                    "entity_id": str(e.entity_id),
                    "created_at": e.created_at.isoformat(),
                    "payload": e.payload,
                }
                for e in events
            ],
        }

    # ─────────────────────────────────────────
    # AGGREGATE
    # ─────────────────────────────────────────

    def _aggregate(
        self,
        events: list[EventRow],
        since: datetime,
        window_hours: int,
    ) -> dict[str, Any]:

        ai_started = []
        ai_completed = []
        ai_failed = []
        uploaded = []
        status_changed = []

        for e in events:
            match e.event_type:
                case DomainEventType.AI_PROCESSING_STARTED.value:
                    ai_started.append(e)
                case DomainEventType.AI_PROCESSING_COMPLETED.value:
                    ai_completed.append(e)
                case DomainEventType.AI_PROCESSING_FAILED.value:
                    ai_failed.append(e)
                case DomainEventType.DOCUMENT_UPLOADED.value:
                    uploaded.append(e)
                case DomainEventType.ADMISSION_STATUS_CHANGED.value:
                    status_changed.append(e)

        processing_ms_values = [
            v
            for e in ai_completed
            if (v := self._safe_int(e.payload.get("processing_ms"))) is not None
        ]

        avg_processing_ms = round(mean(processing_ms_values), 2) if processing_ms_values else None

        total_ai_terminal = len(ai_completed) + len(ai_failed)
        ai_failure_rate = (len(ai_failed) / total_ai_terminal) if total_ai_terminal else 0.0

        retry_events = [
            e
            for e in ai_started
            if (v := self._safe_int(e.payload.get("retry_count"))) and v > 0
        ]

        retry_rate = (len(retry_events) / len(ai_started)) if ai_started else 0.0

        throughput_by_worker: dict[str, int] = {}
        for e in ai_completed + ai_failed:
            worker = str(e.payload.get("worker_name") or "unknown")
            throughput_by_worker[worker] = throughput_by_worker.get(worker, 0) + 1

        return {
            "window": {
                "hours": window_hours,
                "since": since.isoformat(),
                "event_count": len(events),
            },
            "metrics": {
                "ai_average_processing_ms": avg_processing_ms,
                "ai_failure_rate": round(ai_failure_rate, 4),
                "retry_rate": round(retry_rate, 4),
                "throughput_by_worker": throughput_by_worker,
            },
        }