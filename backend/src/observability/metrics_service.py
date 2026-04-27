from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import mean
from typing import Any
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

    async def get_metrics(self, *, window_hours: int = 24) -> dict[str, Any]:
        since = datetime.now(UTC) - timedelta(hours=window_hours)
        rows = await self._session.execute(
            sa.select(
                PipelineEventModel.event_type,
                PipelineEventModel.entity_id,
                PipelineEventModel.payload,
                PipelineEventModel.created_at,
            )
            .where(PipelineEventModel.created_at >= since)
            .order_by(PipelineEventModel.created_at.asc())
        )
        events = [
            EventRow(
                event_type=row.event_type,
                entity_id=row.entity_id,
                payload=dict(row.payload or {}),
                created_at=row.created_at,
            )
            for row in rows.all()
        ]
        return self._aggregate(events, since=since, window_hours=window_hours)

    async def get_trace_by_correlation(
        self,
        correlation_id: str,
        *,
        limit: int = 500,
    ) -> dict[str, Any]:
        rows = await self._session.execute(
            sa.select(
                PipelineEventModel.event_type,
                PipelineEventModel.entity_id,
                PipelineEventModel.payload,
                PipelineEventModel.created_at,
            )
            .order_by(PipelineEventModel.created_at.asc())
            .limit(limit)
        )
        events = [
            EventRow(
                event_type=row.event_type,
                entity_id=row.entity_id,
                payload=dict(row.payload or {}),
                created_at=row.created_at,
            )
            for row in rows.all()
            if str((row.payload or {}).get("correlation_id", "")) == correlation_id
        ]
        return {
            "correlation_id": correlation_id,
            "event_count": len(events),
            "events": [
                {
                    "event_type": event.event_type,
                    "entity_id": str(event.entity_id),
                    "created_at": event.created_at.isoformat(),
                    "payload": event.payload,
                }
                for event in events
            ],
        }

    def _aggregate(
        self,
        events: list[EventRow],
        *,
        since: datetime,
        window_hours: int,
    ) -> dict[str, Any]:
        ai_started = [e for e in events if e.event_type == DomainEventType.AI_PROCESSING_STARTED.value]
        ai_completed = [e for e in events if e.event_type == DomainEventType.AI_PROCESSING_COMPLETED.value]
        ai_failed = [e for e in events if e.event_type == DomainEventType.AI_PROCESSING_FAILED.value]
        uploaded = [e for e in events if e.event_type == DomainEventType.DOCUMENT_UPLOADED.value]
        status_changed = [e for e in events if e.event_type == DomainEventType.ADMISSION_STATUS_CHANGED.value]

        processing_ms_values = [
            int(e.payload.get("processing_ms", 0))
            for e in ai_completed
            if e.payload.get("processing_ms") is not None
        ]
        avg_processing_ms = round(mean(processing_ms_values), 2) if processing_ms_values else None

        total_ai_terminal = len(ai_completed) + len(ai_failed)
        ai_failure_rate = (len(ai_failed) / total_ai_terminal) if total_ai_terminal > 0 else 0.0

        retried_starts = [
            e for e in ai_started if int(e.payload.get("retry_count", 0) or 0) > 0
        ]
        retry_rate = (len(retried_starts) / len(ai_started)) if ai_started else 0.0

        throughput_by_worker: dict[str, int] = {}
        for event in ai_completed + ai_failed:
            worker = str(event.payload.get("worker_name") or "unknown")
            throughput_by_worker[worker] = throughput_by_worker.get(worker, 0) + 1

        upload_first_by_admission: dict[str, datetime] = {}
        for event in uploaded:
            admission_id = str(event.payload.get("admission_id") or "")
            if not admission_id:
                continue
            current = upload_first_by_admission.get(admission_id)
            if current is None or event.created_at < current:
                upload_first_by_admission[admission_id] = event.created_at

        final_status_events = [
            e
            for e in status_changed
            if str(e.payload.get("to_status", "")) in {"approved", "rejected"}
        ]
        final_first_by_admission: dict[str, datetime] = {}
        for event in final_status_events:
            admission_id = str(event.entity_id)
            current = final_first_by_admission.get(admission_id)
            if current is None or event.created_at < current:
                final_first_by_admission[admission_id] = event.created_at

        upload_to_final_values_ms: list[int] = []
        for admission_id, final_time in final_first_by_admission.items():
            upload_time = upload_first_by_admission.get(admission_id)
            if upload_time is None:
                continue
            delta_ms = int((final_time - upload_time).total_seconds() * 1000)
            if delta_ms >= 0:
                upload_to_final_values_ms.append(delta_ms)

        avg_upload_to_final_ms = (
            round(mean(upload_to_final_values_ms), 2) if upload_to_final_values_ms else None
        )

        return {
            "window": {
                "hours": window_hours,
                "since": since.isoformat(),
                "event_count": len(events),
            },
            "metrics": {
                "ai_average_processing_ms": avg_processing_ms,
                "ai_failure_rate": round(ai_failure_rate, 4),
                "upload_to_final_decision_ms": avg_upload_to_final_ms,
                "retry_rate": round(retry_rate, 4),
                "throughput_by_worker": throughput_by_worker,
            },
        }
