from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.strict_payload import require_key
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.observability.domain_events import DomainEvent, DomainEventType, publish_domain_event


@dataclass(frozen=True)
class AnalysisRankingRefreshResult:
    ranking_refresh_status: str
    ranking_freshness_status: str
    ranking_refreshed_at: datetime | None
    ranking_warning: str | None
    public_job_fit_score: float | None
    ranking_result: dict[str, Any] | None


class AnalysisRankingRefreshService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        logger: Any,
    ) -> None:
        self._session = session
        self._logger = logger

    async def refresh_after_match(
        self,
        *,
        analysis_id: UUID,
        source_analysis_created_at: datetime,
        job_id: UUID,
        candidate_id: UUID,
        resume_version_id: UUID,
        score_model_version: ScoreModelVersionModel | None,
        force_recompute: bool,
    ) -> AnalysisRankingRefreshResult:
        ranking_refresh_status = "unknown"
        ranking_freshness_status = "stale"
        ranking_refreshed_at = None
        ranking_warning = None
        public_job_fit_score = None
        ranking_service = None
        ranking_result = None

        try:
            from src.application.services.candidate_ranking_service import CandidateRankingService

            ranking_service = CandidateRankingService(self._session)
            async with self._session.begin_nested():
                ranking_result = await ranking_service.compute_single_candidate(
                    job_id,
                    candidate_id,
                    recompute_reason="force_recompute" if force_recompute else "post_match",
                )

            if ranking_result is None:
                ranking_refresh_status = "skipped"
                ranking_warning = "Ranking incremental não encontrou contexto suficiente para o candidato."
            else:
                ranking_refresh_status = "updated"
                ranking_freshness_status = str(
                    require_key(ranking_result, "ranking_freshness_status")
                )
                ranking_refreshed_at = require_key(ranking_result, "computed_at")
                public_score = ranking_result.get("job_fit_score")
                if public_score is None:
                    raise ValueError("Ranking incremental retornou sem job_fit_score")
                public_job_fit_score = float(public_score)
        except Exception:
            ranking_refresh_status = "failed"
            ranking_freshness_status = "stale"
            ranking_warning = (
                "Match salvo, mas o ranking incremental falhou e pode estar desatualizado."
            )
            self._logger.warning(
                "ranking.single_recompute_failed",
                exc_info=True,
                extra={
                    "analysis_id": str(analysis_id),
                    "candidate_id": str(candidate_id),
                    "job_id": str(job_id),
                    "resume_version_id": str(resume_version_id),
                    "recompute_reason": "match_to_job_sync",
                },
            )
            await publish_domain_event(
                DomainEvent(
                    event_type=DomainEventType.RANKING_RECOMPUTE_FAILED,
                    entity_id=candidate_id,
                    payload={
                        "event": "ranking_recompute_failed",
                        "candidate_id": str(candidate_id),
                        "job_id": str(job_id),
                        "source_analysis_id": str(analysis_id),
                        "source_analysis_created_at": source_analysis_created_at.isoformat(),
                        "score_model_version": score_model_version.version if score_model_version else None,
                        "ranking_version": score_model_version.version if score_model_version else None,
                        "ranking_freshness_status": "stale",
                        "recompute_reason": "match_to_job_sync",
                    },
                ),
                session=self._session,
            )
            if ranking_service is not None:
                try:
                    async with self._session.begin_nested():
                        await ranking_service.mark_candidate_stale(job_id, candidate_id)
                except Exception:
                    self._logger.warning(
                        "ranking.mark_stale_failed",
                        exc_info=True,
                        extra={
                            "analysis_id": str(analysis_id),
                            "candidate_id": str(candidate_id),
                            "job_id": str(job_id),
                        },
                    )

        return AnalysisRankingRefreshResult(
            ranking_refresh_status=ranking_refresh_status,
            ranking_freshness_status=ranking_freshness_status,
            ranking_refreshed_at=ranking_refreshed_at,
            ranking_warning=ranking_warning,
            public_job_fit_score=public_job_fit_score,
            ranking_result=ranking_result if isinstance(ranking_result, dict) else None,
        )
