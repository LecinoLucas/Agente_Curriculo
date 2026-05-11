from __future__ import annotations

from datetime import datetime
from time import perf_counter
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.observability.domain_events import DomainEvent, DomainEventType, publish_domain_event


class CandidateRankingObservability:
    def __init__(
        self,
        session: AsyncSession,
        *,
        logger: Any,
        coerce_utc_datetime: Any,
    ) -> None:
        self._session = session
        self._logger = logger
        self._coerce_utc_datetime = coerce_utc_datetime

    @staticmethod
    def compute_duration_ms(started_perf: float) -> int:
        return int((perf_counter() - started_perf) * 1000)

    def build_recompute_payload(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        payload: dict[str, Any],
        version: ScoreModelVersionModel,
        persist_result: dict[str, Any],
        duration_ms: int,
        actor_id: str | None = None,
    ) -> dict[str, Any]:
        source_analysis_created_at = self._coerce_utc_datetime(payload.get("source_analysis_created_at"))
        ranking_updated_at = self._coerce_utc_datetime(persist_result.get("ranking_updated_at"))
        context = structlog.contextvars.get_contextvars()
        trace_id = context.get("correlation_id")
        request_id = context.get("request_id")
        return {
            "candidate_id": str(candidate_id),
            "job_id": str(job_id),
            "source_analysis_id": str(payload["source_analysis_id"]) if payload.get("source_analysis_id") else None,
            "source_analysis_created_at": (
                source_analysis_created_at.isoformat()
                if source_analysis_created_at is not None
                else None
            ),
            "previous_score": float(persist_result["previous_score"]) if persist_result.get("previous_score") is not None else None,
            "new_score": float(persist_result["new_score"]) if persist_result.get("new_score") is not None else None,
            "ranking_freshness_status": payload["freshness_status"],
            "score_model_version": version.version,
            "compute_duration_ms": duration_ms,
            "monotonicity_decision": persist_result["monotonicity_decision"],
            "ranking_updated_at": (
                ranking_updated_at.isoformat()
                if ranking_updated_at is not None
                else None
            ),
            "ranking_version": version.version,
            "ranking_version_id": str(version.id),
            "trace_id": trace_id,
            "request_id": request_id,
            "input_hash": payload.get("input_hash"),
            "actor_id": actor_id,
        }

    async def emit_recomputed(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        payload: dict[str, Any],
        version: ScoreModelVersionModel,
        persist_result: dict[str, Any],
        duration_ms: int,
        actor_id: str | None = None,
    ) -> None:
        base_payload = self.build_recompute_payload(
            candidate_id=candidate_id,
            job_id=job_id,
            payload=payload,
            version=version,
            persist_result=persist_result,
            duration_ms=duration_ms,
            actor_id=actor_id,
        )
        self._logger.info("ranking.recomputed", **base_payload)
        await publish_domain_event(
            DomainEvent(
                event_type=DomainEventType.RANKING_RECOMPUTED,
                entity_id=candidate_id,
                payload={
                    "event": "ranking_recomputed",
                    **base_payload,
                },
            ),
            session=self._session,
        )
