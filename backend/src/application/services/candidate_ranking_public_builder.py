from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from src.application.services.strict_payload import (
    optional_dict,
    optional_list,
    optional_str,
    require_datetime,
    require_key,
)
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel


class CandidateRankingPublicBuilder:
    def __init__(
        self,
        *,
        normalize_score_breakdown: Callable[..., dict[str, Any]],
        normalize_reason_codes: Callable[[Any], list[dict[str, Any]]],
        normalize_factor_summary: Callable[[Any], dict[str, list[dict[str, Any]]]],
        resolve_freshness_status: Callable[..., tuple[str, str | None]],
    ) -> None:
        self._normalize_score_breakdown = normalize_score_breakdown
        self._normalize_reason_codes = normalize_reason_codes
        self._normalize_factor_summary = normalize_factor_summary
        self._resolve_freshness_status = resolve_freshness_status

    def build_entry(
        self,
        *,
        row: dict[str, Any],
        rank: int,
        version: ScoreModelVersionModel,
    ) -> dict[str, Any]:
        breakdown_raw = optional_dict(row, "breakdown")
        reason_tags_raw = optional_list(row, "reason_codes")
        score_factors_raw = optional_dict(row, "factor_summary_json")

        ranking_updated_at = require_datetime(row, "ranking_updated_at")
        match_updated_at = require_datetime(row, "match_updated_at")
        computed_at = require_datetime(row, "computed_at")
        job_updated_at = require_datetime(row, "job_updated_at")
        public_job_fit_score = Decimal(str(require_key(row, "final_score")))
        score_breakdown = self._normalize_score_breakdown(
            breakdown_raw,
            public_job_fit_score=public_job_fit_score,
        )

        ranking_freshness_status, stale_reason = self._resolve_freshness_status(
            ranking_updated_at=ranking_updated_at,
            match_updated_at=match_updated_at,
            persisted_status=require_key(row, "freshness_status"),
            score_job_signature_hash=require_key(row, "job_signature_hash"),
            job_signature_hash=require_key(row, "job_profile_hash"),
            score_computed_at=computed_at,
            job_updated_at=job_updated_at,
            score_source_analysis_id=row.get("source_analysis_id"),
            pipeline_current_analysis_id=row.get("current_analysis_id"),
        )

        return {
            "rank": rank,
            "candidate_id": require_key(row, "candidate_id"),
            "candidate_name": require_key(row, "candidate_name"),
            "stage": require_key(row, "stage"),
            "pipeline_status": require_key(row, "pipeline_status"),
            "score_breakdown": score_breakdown,
            "decision_suggestion": require_key(row, "decision_suggestion"),
            "reason_tags": self._normalize_reason_codes(reason_tags_raw),
            "score_factors": self._normalize_factor_summary(score_factors_raw),
            "ranking_summary_text": require_key(row, "explanation_text"),
            "job_fit_score": public_job_fit_score,
            "data_confidence_score": float(score_breakdown["confidence_score"]),
            "entered_at": row.get("entered_at"),
            "computed_at": computed_at,
            "ranking_freshness_status": ranking_freshness_status,
            "match_freshness_status": require_key(row, "match_freshness_status"),
            "recalculation_required": ranking_freshness_status != "fresh",
            "stale_reason": stale_reason,
            "score_computed_at": computed_at,
            "source_analysis_id": require_key(row, "source_analysis_id"),
            "source_analysis_created_at": require_key(row, "source_analysis_created_at"),
            "score_model_version": optional_str(row, "score_model_version", version.version) or version.version,
            "match_updated_at": match_updated_at,
            "ranking_updated_at": ranking_updated_at,
            "version": version.version,
            "ranking_version": version.version,
            "data_quality_status": require_key(row, "data_quality_status"),
        }

    def build_ranking_response(
        self,
        *,
        job_id: UUID,
        entries: list[dict[str, Any]],
        threshold_high: Decimal,
        threshold_low: Decimal,
        version: ScoreModelVersionModel,
        data_quality_stats: dict[str, int] | None,
    ) -> dict[str, Any]:
        return {
            "job_id": job_id,
            "total_candidates": len(entries),
            "threshold_high": threshold_high,
            "threshold_low": threshold_low,
            "score_version": version.version,
            "candidates": entries,
            "data_quality_stats": data_quality_stats,
        }
