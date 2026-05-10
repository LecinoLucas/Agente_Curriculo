from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import mean
from typing import Any, AsyncIterator
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.scoring_model import (
    CandidateJobScoreModel,
    ScoreModelVersionModel,
)
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

    def _safe_float(self, value: Any) -> float | None:
        try:
            return float(value)
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

        base = self._aggregate(events, since, window_hours)
        base["ranking"] = await self._aggregate_ranking_metrics(events)
        return base

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

    async def _aggregate_ranking_metrics(self, events: list[EventRow]) -> dict[str, Any]:
        recomputed = [
            e for e in events if e.event_type == DomainEventType.RANKING_RECOMPUTED.value
        ]
        recompute_failed = [
            e for e in events if e.event_type == DomainEventType.RANKING_RECOMPUTE_FAILED.value
        ]

        recompute_duration_ms = [
            value
            for e in [*recomputed, *recompute_failed]
            if (value := self._safe_int(e.payload.get("compute_duration_ms"))) is not None
        ]
        success_total = sum(
            1
            for e in recomputed
            if str(e.payload.get("monotonicity_decision") or "") == "updated"
        )
        skipped_total = sum(
            1
            for e in recomputed
            if str(e.payload.get("monotonicity_decision") or "") == "skipped_older_analysis"
        )
        total = len(recomputed) + len(recompute_failed)
        failed_total = len(recompute_failed)
        stale_detected_total = sum(
            1
            for e in [*recomputed, *recompute_failed]
            if str(e.payload.get("ranking_freshness_status") or "") == "stale"
        )

        stale_snapshot = await self._ranking_freshness_snapshot()

        return {
            "counters": {
                "ranking_recompute_total": total,
                "ranking_recompute_failed_total": failed_total,
                "ranking_recompute_success_total": success_total,
                "ranking_recompute_skipped_monotonicity_total": skipped_total,
                "ranking_stale_detected_total": stale_detected_total,
            },
            "histograms": {
                "ranking_recompute_duration_ms": _distribution_summary(recompute_duration_ms),
                "ranking_stale_age_ms": _distribution_summary(stale_snapshot["stale_age_values_ms"]),
            },
            "gauges": {
                "ranking_stale_candidates_total": stale_snapshot["stale_candidates_total"],
                "ranking_unknown_freshness_total": stale_snapshot["unknown_freshness_total"],
            },
        }

    async def _ranking_freshness_snapshot(self) -> dict[str, Any]:
        version = await self._session.scalar(
            sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
        )
        if version is None:
            return {
                "stale_candidates_total": 0,
                "unknown_freshness_total": 0,
                "stale_age_values_ms": [],
            }

        latest_match = (
            sa.select(
                CandidateJobMatchModel.candidate_id,
                CandidateJobMatchModel.job_id,
                sa.func.coalesce(
                    CandidateJobMatchModel.updated_at,
                    CandidateJobMatchModel.created_at,
                ).label("match_updated_at"),
                sa.func.row_number()
                .over(
                    partition_by=(
                        CandidateJobMatchModel.candidate_id,
                        CandidateJobMatchModel.job_id,
                    ),
                    order_by=(
                        sa.case(
                            (CandidateJobMatchModel.candidate_job_pipeline_id.isnot(None), 0),
                            else_=1,
                        ),
                        sa.func.coalesce(
                            CandidateJobMatchModel.updated_at,
                            CandidateJobMatchModel.created_at,
                        ).desc(),
                        CandidateJobMatchModel.id.desc(),
                    ),
                )
                .label("rn"),
            )
            .subquery("latest_match")
        )

        result = await self._session.execute(
            sa.select(
                CandidateJobScoreModel.freshness_status,
                CandidateJobScoreModel.updated_at,
                latest_match.c.match_updated_at,
            )
            .select_from(CandidateJobScoreModel)
            .outerjoin(
                latest_match,
                sa.and_(
                    latest_match.c.candidate_id == CandidateJobScoreModel.candidate_id,
                    latest_match.c.job_id == CandidateJobScoreModel.job_id,
                    latest_match.c.rn == 1,
                ),
            )
            .where(CandidateJobScoreModel.version_id == version.id)
        )

        stale_count = 0
        stale_age_values_ms: list[int] = []

        for row in result.mappings().all():
            ranking_updated_at = row.get("updated_at")
            match_updated_at = row.get("match_updated_at")
            persisted_status = row.get("freshness_status")
            if persisted_status != "fresh":
                resolved = "stale"
            elif ranking_updated_at is None or match_updated_at is None:
                resolved = "stale"
            elif ranking_updated_at >= match_updated_at:
                resolved = "fresh"
            else:
                resolved = "stale"

            if resolved == "stale":
                stale_count += 1
                if ranking_updated_at is not None and match_updated_at is not None:
                    stale_age_values_ms.append(
                        max(0, int((match_updated_at - ranking_updated_at).total_seconds() * 1000))
                    )

        return {
            "stale_candidates_total": stale_count,
            "unknown_freshness_total": 0,
            "stale_age_values_ms": stale_age_values_ms,
        }


def _distribution_summary(values: list[int]) -> dict[str, Any]:
    if not values:
        return {"count": 0, "avg": None, "p95": None, "max": None}
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * 0.95)))
    return {
        "count": len(ordered),
        "avg": round(mean(ordered), 2),
        "p95": ordered[index],
        "max": ordered[-1],
    }
