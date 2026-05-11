from __future__ import annotations

from collections.abc import Callable
from decimal import Decimal
from typing import Any
from uuid import UUID

from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel


class CandidateRankingResponseBuilder:
    def __init__(
        self,
        *,
        to_decimal: Callable[[Any, Decimal], Decimal] | Callable[[Any], Decimal],
        score_delta_change_threshold: Decimal,
        score_delta_summary_limit: int,
    ) -> None:
        self._to_decimal = to_decimal
        self._score_delta_change_threshold = score_delta_change_threshold
        self._score_delta_summary_limit = score_delta_summary_limit

    def build_score_delta(
        self,
        *,
        candidate_id: UUID,
        persist_result: dict[str, Any],
    ) -> dict[str, Any]:
        delta_summary = persist_result.get("delta_summary") or {}
        return {
            "candidate_id": candidate_id,
            "previous_score": persist_result["previous_score"],
            "new_score": persist_result["new_score"],
            "delta": delta_summary.get("delta"),
            "monotonicity_decision": persist_result.get("monotonicity_decision"),
        }

    def build_single_candidate_response(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        persist_result: dict[str, Any],
        payload: dict[str, Any],
        version: ScoreModelVersionModel,
    ) -> dict[str, Any]:
        delta_summary = persist_result.get("delta_summary") or {}
        return {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "previous_score": persist_result["previous_score"],
            "job_fit_score": persist_result["new_score"],
            "delta": delta_summary.get("delta"),
            "monotonicity_decision": persist_result.get("monotonicity_decision"),
            "ranking_freshness_status": payload["freshness_status"],
            "computed_at": payload["computed_at"],
            "score_version": version.version,
            "source_analysis_id": payload["source_analysis_id"],
            "explainability_version": payload["explainability_version"],
            "score_factors": payload["factors"],
            "factor_summary": persist_result["factor_summary"],
        }

    def empty_delta_summary(
        self,
        *,
        current_score: Decimal | None,
    ) -> dict[str, Any]:
        return {
            "previous_score": None,
            "current_score": float(current_score.quantize(Decimal("0.01"))) if current_score is not None else None,
            "score_change": None,
            "change_reason": None,
            "top_changes": [],
        }

    def derive_delta_summary(
        self,
        *,
        previous_snapshot: dict[str, Any] | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        current_score = self._to_decimal(payload["final_score"]).quantize(Decimal("0.01"))
        if previous_snapshot is None:
            return self.empty_delta_summary(current_score=current_score)

        previous_score = self._to_decimal(previous_snapshot.get("final_score")).quantize(Decimal("0.01"))
        score_change = (current_score - previous_score).quantize(Decimal("0.01"))
        previous_factors = {
            (str(item.get("factor_type") or ""), str(item.get("factor_key") or "")): item
            for item in previous_snapshot.get("factors", [])
        }
        current_factors = {
            (str(item.get("factor_type") or ""), str(item.get("factor_key") or "")): item
            for item in payload.get("factors", [])
        }
        all_keys = set(previous_factors) | set(current_factors)
        top_changes: list[dict[str, Any]] = []

        for factor_key in all_keys:
            previous_factor = previous_factors.get(factor_key)
            current_factor = current_factors.get(factor_key)
            previous_impact = self._to_decimal(previous_factor.get("impact_score")) if previous_factor else Decimal("0.00")
            current_impact = self._to_decimal(current_factor.get("impact_score")) if current_factor else Decimal("0.00")
            impact_delta = (current_impact - previous_impact).quantize(Decimal("0.01"))
            if abs(impact_delta) < self._score_delta_change_threshold:
                continue
            base_factor = current_factor or previous_factor or {}
            top_changes.append({
                "factor_type": str(base_factor.get("factor_type") or ""),
                "factor_key": str(base_factor.get("factor_key") or ""),
                "factor_label": str(base_factor.get("factor_label") or ""),
                "previous_impact_score": float(previous_impact),
                "current_impact_score": float(current_impact),
                "impact_delta": float(impact_delta),
                "change_kind": (
                    "added"
                    if previous_factor is None
                    else "removed"
                    if current_factor is None
                    else "changed"
                ),
            })

        top_changes.sort(key=lambda item: abs(float(item["impact_delta"])), reverse=True)
        top_changes = top_changes[:self._score_delta_summary_limit]

        previous_input_hash = str(previous_snapshot.get("input_hash") or "")
        current_input_hash = str(payload.get("input_hash") or "")
        previous_job_signature_hash = str(previous_snapshot.get("job_signature_hash") or "")
        current_job_signature_hash = str(payload.get("job_signature_hash") or "")
        previous_ranking_version = str(previous_snapshot.get("ranking_version") or "")
        current_ranking_version = str(payload.get("score_model_version") or "")
        previous_analysis_id = str(previous_snapshot.get("source_analysis_id") or "")
        current_analysis_id = str(payload.get("source_analysis_id") or "")
        previous_analysis_created_at = str(previous_snapshot.get("source_analysis_created_at") or "")
        current_analysis_created_at = str(payload.get("source_analysis_created_at") or "")

        if previous_ranking_version and current_ranking_version and previous_ranking_version != current_ranking_version:
            change_reason = "score_model_changed"
        elif previous_job_signature_hash and current_job_signature_hash and previous_job_signature_hash != current_job_signature_hash:
            change_reason = "job_requirements_changed"
        elif (
            previous_analysis_id != current_analysis_id
            or previous_analysis_created_at != current_analysis_created_at
        ):
            change_reason = "candidate_analysis_changed"
        elif previous_input_hash == current_input_hash:
            change_reason = "manual_recompute_same_inputs"
        else:
            change_reason = "candidate_analysis_changed"

        return {
            "previous_score": float(previous_score),
            "current_score": float(current_score),
            "score_change": float(score_change),
            "change_reason": change_reason,
            "top_changes": top_changes,
        }
