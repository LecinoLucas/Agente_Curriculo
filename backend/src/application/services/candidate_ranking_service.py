from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from time import perf_counter
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import (
    _MINIMUM_DOMAIN_FIT_CAP_SCORE,
    _NO_REQUIREMENTS_SCORE_CAP,
    _PRIORITY_STRONG_COVERAGE_CAP_SCORE,
    _PRIORITY_STRONG_COVERAGE_CAP_THRESHOLD,
    _PRIORITY_THRESHOLD,
    _calculate_experience_score,
    _calculate_seniority_score,
    _canonical_component_weights,
    _job_has_structured_requirements,
    _priority_soft_penalty,
    _validate_education,
    _validate_experience,
)
from src.application.services.candidate_ranking_context_loader import CandidateRankingContextLoader
from src.application.services.candidate_ranking_explanation_builder import (
    CandidateRankingExplanationBuilder,
    _build_reason_codes,
    _build_score_factors,
    _render_score_explanation,
    _summarize_score_factors,
    _validate_score_factors,
)
from src.application.services.candidate_ranking_observability import CandidateRankingObservability
from src.application.services.candidate_ranking_public_builder import CandidateRankingPublicBuilder
from src.application.services.candidate_ranking_response_builder import CandidateRankingResponseBuilder
from src.application.services.candidate_ranking_score_store import CandidateRankingScoreStore
from src.application.services.job_skill_priority_service import (
    is_complementary_skill,
    is_eliminatory_skill,
    is_priority_skill,
)
from src.application.services.match_confidence_service import (
    compute_match_confidence,
)
from src.application.services.strict_payload import (
    optional_dict,
)
from src.application.services.skill_requirements_service import validate_skill_requirements
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.domain.services.deal_breaker_evaluator import evaluate_deal_breakers

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class RankingJobNotFoundError(Exception):
    pass


class NoActiveScoreVersionError(Exception):
    pass


class NoPersistedScoresError(Exception):
    pass


class CandidateNotInActivePipelineError(Exception):
    pass


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class CandidateRankingService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._context_loader = CandidateRankingContextLoader(
            session,
            ranking_job_not_found_error=RankingJobNotFoundError,
            no_active_score_version_error=NoActiveScoreVersionError,
            resolve_thresholds=_resolve_thresholds,
            enrich_match_row=_enrich_match_row_for_deal_breakers,
        )
        self._response_builder = CandidateRankingResponseBuilder(
            to_decimal=_to_decimal,
            score_delta_change_threshold=_SCORE_DELTA_CHANGE_THRESHOLD,
            score_delta_summary_limit=_SCORE_DELTA_SUMMARY_LIMIT,
        )
        self._explanation_builder = CandidateRankingExplanationBuilder()
        self._public_builder = CandidateRankingPublicBuilder(
            normalize_score_breakdown=_normalize_score_breakdown,
            normalize_reason_codes=_normalize_reason_codes,
            normalize_factor_summary=_normalize_factor_summary,
            resolve_freshness_status=_resolve_freshness_status,
        )
        self._score_store = CandidateRankingScoreStore(
            session,
            explainability_version=_EXPLAINABILITY_VERSION,
            validate_score_factors=self._explanation_builder.validate_score_factors,
            summarize_score_factors=self._explanation_builder.summarize_score_factors,
            derive_delta_summary=self._response_builder.derive_delta_summary,
            render_score_explanation=self._explanation_builder.render_score_explanation,
            empty_delta_summary=self._response_builder.empty_delta_summary,
            coerce_utc_datetime=_coerce_utc_datetime,
            logger=logger,
        )
        self._observability = CandidateRankingObservability(
            session,
            logger=logger,
            coerce_utc_datetime=_coerce_utc_datetime,
        )

    # ------------------------------------------------------------------
    # Write path: compute scores and persist them
    # ------------------------------------------------------------------

    async def compute_and_persist(self, job_id: UUID) -> list[dict]:
        """Persist a ranking snapshot into CandidateJobScore.final_score.

        Returns a list of score deltas.

        Raises RankingJobNotFoundError if the job does not exist.
        Raises NoActiveScoreVersionError if no active score model version exists.
        """
        job, version, threshold_high, threshold_low, job_skill_rows = await self._context_loader.load_scoring_context(job_id)
        rows = await self._context_loader.fetch_match_rows(job_id)
        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash - cannot compute ranking safely")
        
        score_deltas = []

        for row in rows:
            if not _has_canonical_skill_evidence(row):
                logger.info(
                    "ranking.skip_missing_skill_evidence",
                    candidate_id=str(row.get("candidate_id") or ""),
                    job_id=str(job_id),
                )
                continue
            started_perf = perf_counter()
            payload = self._build_score_payload(
                row=row,
                job=job,
                job_skill_rows=job_skill_rows,
                threshold_high=threshold_high,
                threshold_low=threshold_low,
                score_version=version.version,
            )
            persist_result = await self._score_store.persist_score(
                candidate_id=row["candidate_id"],
                job_id=job_id,
                version=version,
                payload=payload,
            )
            duration_ms = self._observability.compute_duration_ms(started_perf)
            await self._observability.emit_recomputed(
                candidate_id=row["candidate_id"],
                job_id=job_id,
                payload=payload,
                version=version,
                persist_result=persist_result,
                duration_ms=duration_ms,
            )
            
            score_deltas.append(
                self._response_builder.build_score_delta(
                    candidate_id=row["candidate_id"],
                    persist_result=persist_result,
                )
            )

        return score_deltas

    async def assert_candidate_active_in_job(self, candidate_id: UUID, job_id: UUID) -> None:
        pipeline = await self._session.scalar(
            sa.select(CandidateJobPipelineModel).where(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.pipeline_status == "active",
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        if pipeline is None:
            raise CandidateNotInActivePipelineError()

    async def compute_single_candidate(
        self,
        job_id: UUID,
        candidate_id: UUID,
        recompute_reason: str = "manual",
        actor_id: str | None = None,
    ) -> dict[str, Any] | None:
        job, version, threshold_high, threshold_low, job_skill_rows = await self._context_loader.load_scoring_context(job_id)
        rows = await self._context_loader.fetch_match_rows(job_id, candidate_id=candidate_id)
        if not rows:
            return None

        row = rows[0]
        if not _has_canonical_skill_evidence(row):
            return None
        started_perf = perf_counter()
        payload = self._build_score_payload(
            row=row,
            job=job,
            job_skill_rows=job_skill_rows,
            threshold_high=threshold_high,
            threshold_low=threshold_low,
            score_version=version.version,
        )
        # CRITICAL: Set freshness context - these are required for all scores
        payload["recompute_reason"] = recompute_reason
        payload["freshness_status"] = "fresh"
        payload["job_signature_hash"] = job.job_profile_hash  # REQUIRED for validation
        payload["job_updated_at"] = job.updated_at  # REQUIRED for validation

        # Validate that job has hash (if not, something is critically broken)
        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash - cannot compute score safely")
        persist_result = await self._score_store.persist_score(
            candidate_id=candidate_id,
            job_id=job_id,
            version=version,
            payload=payload,
        )
        duration_ms = self._observability.compute_duration_ms(started_perf)
        await self._observability.emit_recomputed(
            candidate_id=candidate_id,
            job_id=job_id,
            payload=payload,
            version=version,
            persist_result=persist_result,
            duration_ms=duration_ms,
            actor_id=actor_id,
        )
        return self._response_builder.build_single_candidate_response(
            candidate_id=candidate_id,
            job_id=job_id,
            persist_result=persist_result,
            payload=payload,
            version=version,
        )

    async def mark_candidate_stale(self, job_id: UUID, candidate_id: UUID) -> None:
        version = await self._context_loader.load_active_version()
        await self._score_store.mark_candidate_stale(
            job_id=job_id,
            candidate_id=candidate_id,
            version_id=version.id,
        )

    # ------------------------------------------------------------------
    # Compatibility wrappers for extracted private helpers
    # ------------------------------------------------------------------

    async def _load_scoring_context(
        self,
        job_id: UUID,
    ) -> tuple[JobModel, ScoreModelVersionModel, Decimal, Decimal, list[Any]]:
        return await self._context_loader.load_scoring_context(job_id)

    async def _assert_job_exists(self, job_id: UUID) -> None:
        await self._context_loader.assert_job_exists(job_id)

    async def _load_job_with_deal_breakers(self, job_id: UUID) -> JobModel:
        return await self._context_loader.load_job_with_deal_breakers(job_id)

    async def _load_active_version(self) -> ScoreModelVersionModel:
        return await self._context_loader.load_active_version()

    async def _fetch_match_rows(
        self,
        job_id: UUID,
        *,
        candidate_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        return await self._context_loader.fetch_match_rows(job_id, candidate_id=candidate_id)

    async def _load_job_skill_rows(self, job_id: UUID) -> list[Any]:
        return await self._context_loader.load_job_skill_rows(job_id)

    def _json_shape_filter(self, column: Any, expected_type: str) -> Any:
        return self._context_loader._json_shape_filter(column, expected_type)

    def _json_key_exists_filter(self, column: Any, key: str) -> Any:
        return self._context_loader._json_key_exists_filter(column, key)

    # ------------------------------------------------------------------
    # Read path: return persisted ranking (never recomputes)
    # ------------------------------------------------------------------

    async def get_ranking(
        self,
        job_id: UUID,
    ) -> dict[str, Any]:
        """Return the ranking for this job from persisted candidate_job_scores.

        Only scores computed with the currently active version are returned.
        Raises RankingJobNotFoundError / NoActiveScoreVersionError as needed.
        """
        await self._context_loader.assert_job_exists(job_id)
        version = await self._context_loader.load_active_version()
        threshold_high, threshold_low = _resolve_thresholds(version)

        rows = await self._score_store.fetch_persisted_scores(job_id, version.id)

        entries = []
        for row in rows:
            if not _has_valid_persisted_ranking_row(row):
                logger.info(
                    "ranking.skip_invalid_persisted_score",
                    candidate_id=str(row.get("candidate_id") or ""),
                    job_id=str(job_id),
                )
                continue
            entries.append(
                self._public_builder.build_entry(
                    row=row,
                    rank=len(entries) + 1,
                    version=version,
                )
            )

        # Get accurate stats directly from database (not from already-filtered entries)
        stats = await self._score_store.calculate_data_quality_stats(job_id)

        return self._public_builder.build_ranking_response(
            job_id=job_id,
            entries=entries,
            threshold_high=threshold_high,
            threshold_low=threshold_low,
            version=version,
            data_quality_stats=stats,
        )

    # ------------------------------------------------------------------
    # DB helpers
    # ------------------------------------------------------------------

    def _build_score_payload(
        self,
        *,
        row: dict[str, Any],
        job: JobModel,
        job_skill_rows: list[Any],
        threshold_high: Decimal,
        threshold_low: Decimal,
        score_version: str,
    ) -> dict[str, Any]:
        bd = _compute_breakdown(
            row=row,
            job=job,
            job_skill_rows=job_skill_rows,
        )
        deal_breaker_missing_fields = _find_missing_deal_breaker_fields(job.deal_breakers, row)
        deal_breaker_violations = evaluate_deal_breakers(job.deal_breakers, row)
        if deal_breaker_missing_fields and not deal_breaker_violations and bd.get("validation_status") != "fail":
            row["validation_status"] = "unknown"
            bd["validation_status"] = "unknown"
            bd["validation_reason"] = _append_validation_reason(
                bd.get("validation_reason"),
                _format_missing_deal_breaker_evidence_reason(deal_breaker_missing_fields),
            )
        _apply_validation_guardrails(row, bd)
        _apply_deal_breaker_guardrails(bd, deal_breaker_violations)
        _apply_eliminatory_skill_guardrails(row=row, job=job, job_skill_rows=job_skill_rows, bd=bd)
        bd["final_score_after_cap"] = _to_decimal(bd["final_score"]).quantize(Decimal("0.01"))
        decision = _decide(bd["final_score"], threshold_high, threshold_low)
        if deal_breaker_missing_fields and not deal_breaker_violations and decision == "approved":
            decision = "review"
        matched = _coerce_list(row.get("matched_skills"))
        missing = _coerce_list(row.get("missing_skills"))
        factors = self._explanation_builder.build_score_factors(
            row=row,
            job=job,
            job_skill_rows=job_skill_rows,
            bd=bd,
            matched=matched,
            missing=missing,
            deal_breaker_violations=deal_breaker_violations,
        )
        reason_codes = self._explanation_builder.build_reason_codes(factors)
        factor_summary = self._explanation_builder.summarize_score_factors(factors)
        explanation = self._explanation_builder.render_score_explanation(
            final_score=bd["final_score"],
            decision=decision,
            factor_summary=factor_summary,
            delta_summary=None,
            breakdown=_serialize_breakdown(bd),
        )
        now = datetime.now(UTC)
        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash")
        if job.updated_at is None:
            raise ValueError(f"Job {job.id} missing updated_at")
        job_signature_hash = str(job.job_profile_hash)
        input_hash = _build_score_input_hash(
            row=row,
            score_version=score_version,
            job_signature_hash=job_signature_hash,
        )
        return {
            "source_analysis_id": row.get("source_analysis_id"),
            "source_analysis_created_at": row.get("source_analysis_created_at"),
            "job_signature_hash": job_signature_hash,
            "input_hash": input_hash,
            "score_model_version": score_version,
            "explainability_version": _EXPLAINABILITY_VERSION,
            "final_score": bd["final_score"],
            "decision_suggestion": decision,
            "breakdown": _serialize_breakdown(bd),
            "factors": factors,
            "factor_summary_json": factor_summary,
            "reason_codes": [{**rc, "impact": float(rc["impact"])} for rc in reason_codes],
            "explanation_text": explanation,
            "freshness_status": "fresh",
            "job_updated_at": job.updated_at,
            "recompute_reason": "bulk_recompute",
            "computed_at": now,
            "updated_at": now,
        }

# ---------------------------------------------------------------------------
# Pure scoring functions — no I/O, fully deterministic
# ---------------------------------------------------------------------------

_MISSING_SKILL_PENALTY = Decimal("3")
_MAX_PENALTY = Decimal("20")
_ELIMINATORY_MISSING_CAP = Decimal("49.00")
_EXPLAINABILITY_VERSION = "v1_structured_factors"
_SCORE_DELTA_CHANGE_THRESHOLD = Decimal("2.00")
_SCORE_DELTA_SUMMARY_LIMIT = 4


def _compute_breakdown(
    *,
    row: dict,
    job: JobModel,
    job_skill_rows: list[Any],
) -> dict[str, Any]:
    q = Decimal("0.01")
    priority_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if _is_skill_priority(row) and str(row.skill_name).strip()
    }
    complementary_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if _is_skill_complementary(row) and str(row.skill_name).strip()
    }
    eliminatory_names = {
        str(row.skill_name).strip()
        for row in job_skill_rows
        if _is_skill_eliminatory(row) and str(row.skill_name).strip()
    }
    matched_names = set(_coerce_list(row.get("matched_skills")))

    priority_total = len(priority_names)
    complementary_total = len(complementary_names)
    eliminatory_total = len(eliminatory_names)
    priority_matched = len((priority_names & matched_names) or set()) if priority_total else 0
    complementary_matched = len((complementary_names & matched_names) or set()) if complementary_total else 0
    eliminatory_matched = len((eliminatory_names & matched_names) or set()) if eliminatory_total else 0

    priority_score_fallback = (
        Decimal(priority_matched) / Decimal(priority_total) * Decimal("100")
        if priority_total > 0
        else Decimal("0")
    )
    complementary_score_fallback = (
        Decimal(complementary_matched) / Decimal(complementary_total) * Decimal("100")
        if complementary_total > 0
        else Decimal("0")
    )
    skill_match_score = (
        priority_score_fallback * Decimal("0.80") + complementary_score_fallback * Decimal("0.20")
        if priority_total or complementary_total
        else Decimal("0")
    )
    match_debug = row.get("skill_evidence_breakdown")
    if not isinstance(match_debug, dict):
        raise ValueError("skill_evidence_breakdown is required for canonical ranking")

    experience_detected_from_breakdown = (
        _to_decimal(match_debug.get("experience_detected"))
        if match_debug.get("experience_detected") is not None
        else None
    )
    candidate_years = (
        Decimal(str(row.get("total_experience_years")))
        if row.get("total_experience_years") is not None
        else experience_detected_from_breakdown
    )
    required_years = (
        Decimal(str(job.minimum_years_experience))
        if job.minimum_years_experience is not None
        else None
    )
    experience_match = _calculate_experience_score(candidate_years, required_years)
    seniority_match = _calculate_seniority_score(row.get("seniority_level"), job.seniority_level)
    education_result = _validate_education(row.get("education_level"), job.minimum_education_level)
    if job.minimum_education_level is None:
        education = Decimal("50")
    elif education_result.status == "fail":
        education = Decimal("0")
    elif education_result.status == "unknown":
        education = Decimal("50")
    else:
        education = Decimal("100")

    weights = _canonical_component_weights(
        total_priority=priority_total,
        total_complementary=complementary_total,
    )
    priority_score = _to_decimal(
        match_debug.get("priority_score_weighted"),
        default=priority_score_fallback,
    ).quantize(q)
    complementary_score = _to_decimal(
        match_debug.get("complementary_score_weighted"),
        default=complementary_score_fallback,
    ).quantize(q)
    complementary_score_raw = _to_decimal(
        match_debug.get("complementary_score_raw_weighted"),
        default=complementary_score,
    ).quantize(q)
    priority_component_impact = _to_decimal(
        match_debug.get("priority_component_impact"),
        default=(priority_score * weights["priority"]),
    ).quantize(q)
    complementary_component_impact = _to_decimal(
        match_debug.get("complementary_component_impact"),
        default=(complementary_score * weights["complementary"]),
    ).quantize(q)
    experience_component_impact = _to_decimal(
        match_debug.get("experience_component_impact"),
        default=(experience_match * weights["experience"]),
    ).quantize(q)
    seniority_component_impact = _to_decimal(
        match_debug.get("seniority_component_impact"),
        default=(seniority_match * weights["seniority"]),
    ).quantize(q)
    reconstructed = (
        priority_score * weights["priority"]
        + complementary_score * weights["complementary"]
        + experience_match * weights["experience"]
        + seniority_match * weights["seniority"]
    ).quantize(q)

    priority_strong_coverage = _to_decimal(
        match_debug.get("priority_strong_coverage"),
        default=priority_score,
    ).quantize(q)
    partial_matches = list(match_debug.get("partial_matches") or [])
    weak_evidence_priority_skills = [
        str(skill).strip()
        for skill in (
            match_debug.get("weak_evidence_priority_skills")
            or match_debug.get("weak_evidence_required_skills")
            or []
        )
        if str(skill).strip()
    ]
    has_structured_requirements = _job_has_structured_requirements(
        total_skills=len(job_skill_rows),
        seniority_level=job.seniority_level,
        minimum_years_experience=job.minimum_years_experience,
        minimum_education_level=job.minimum_education_level,
        deal_breakers=getattr(job, "deal_breakers", None),
    )
    has_domain_evidence = priority_matched > 0 or complementary_matched > 0 or bool(partial_matches)

    confidence_assessment = compute_match_confidence(
        final_score=reconstructed,
        structured_mandatory_skill_count=priority_total,
        structured_total_skill_count=priority_total + complementary_total + eliminatory_total,
        has_job_seniority=bool(job.seniority_level),
        has_job_min_experience=job.minimum_years_experience is not None,
        candidate_structured_skill_count=len(_coerce_list(row.get("candidate_skills"))),
        candidate_has_experience=row.get("total_experience_years") is not None,
        candidate_has_education=str(row.get("education_level") or "").strip().lower()
        not in {"", "none", "unknown", "undefined"},
    )

    final_score = reconstructed
    if not has_structured_requirements:
        final_score = min(final_score, _NO_REQUIREMENTS_SCORE_CAP).quantize(q)

    final_score_before_validation = final_score
    penalty = max(Decimal("0.00"), reconstructed - final_score_before_validation).quantize(q)
    validation_penalty = Decimal("0.00")

    validation_reasons: list[str] = [
        str(item).strip()
        for item in (match_debug.get("validation_reasons") or [])
        if str(item).strip()
    ]
    if weak_evidence_priority_skills:
        validation_reasons.append(
            "Evidência contextual fraca para skills essenciais: "
            + ", ".join(weak_evidence_priority_skills[:4])
        )

    validation_status = "pass"
    failed_rule: str | None = None
    failed_dimension: str | None = None
    eligibility_status = "PASS"
    cap_applied = final_score_before_validation < reconstructed
    cap_reason: str | None = None

    experience_result = _validate_experience(candidate_years, required_years)
    if education_result.status == "fail":
        validation_status = "fail"
        failed_rule = "minimum_education"
        failed_dimension = "education"
        eligibility_status = "FAIL"
        cap_reason = "minimum_education"
        validation_reasons.append(education_result.reason)
    elif education_result.status == "unknown":
        validation_status = "unknown"
        validation_reasons.append(education_result.reason)

    if experience_result.status == "fail":
        validation_status = "fail"
        failed_rule = "minimum_experience"
        failed_dimension = "experience"
        eligibility_status = "FAIL"
        cap_reason = "minimum_experience"
        validation_reasons.append(experience_result.reason)
    elif experience_result.status == "unknown" and validation_status != "fail":
        validation_status = "unknown"
        validation_reasons.append(experience_result.reason)

    missing_eliminatory_skills = list(
        match_debug.get("missing_eliminatory_skills") or sorted(eliminatory_names - matched_names)
    )
    if validation_status != "fail" and missing_eliminatory_skills:
        failed_rule = "missing_eliminatory_skills"
        failed_dimension = "skills"
        eligibility_status = "FAIL"
        cap_reason = "missing_eliminatory_skills"
        final_score = min(final_score, Decimal("24.00")).quantize(q)
        cap_applied = True
        validation_reasons.append(
            "Não atende critérios eliminatórios: "
            + ", ".join(missing_eliminatory_skills[:4])
        )

    if validation_status != "fail" and weak_evidence_priority_skills:
        eligibility_status = "REVIEW"

    if validation_status == "unknown":
        eligibility_status = "REVIEW"

    return {
        "skill_match_score": skill_match_score.quantize(q),
        "priority_score_weighted": priority_score,
        "complementary_score_weighted": complementary_score,
        "complementary_score_raw_weighted": complementary_score_raw,
        "experience_match_score": experience_match.quantize(q),
        "seniority_match_score": seniority_match.quantize(q),
        "education_score": education.quantize(q),
        "confidence_score": confidence_assessment.confidence_score.quantize(q),
        "priority_component_impact": priority_component_impact,
        "complementary_component_impact": complementary_component_impact,
        "experience_component_impact": experience_component_impact,
        "seniority_component_impact": seniority_component_impact,
        "penalty_score": penalty,
        "validation_penalty_score": validation_penalty,
        "deal_breaker_penalty_score": Decimal("0.00"),
        "final_score": final_score,
        "score_source": "candidate_job_match_evidence",
        "raw_score": reconstructed,
        "final_score_before_cap": final_score_before_validation,
        "final_score_after_cap": final_score,
        "cap_applied": cap_applied,
        "cap_reason": cap_reason,
        "validation_status": validation_status,
        "validation_reason": " | ".join(validation_reasons) if validation_reasons else None,
        "failed_rule": failed_rule,
        "failed_dimension": failed_dimension,
        "eligibility_status": eligibility_status,
        "missing_required_skills": list(match_debug.get("missing_required_skills") or []) or sorted(priority_names - matched_names),
        "matched_required_skills": list(match_debug.get("matched_required_skills") or []) or sorted(priority_names & matched_names),
        "priority_skills_matched": int(match_debug.get("priority_skills_matched", priority_matched)),
        "priority_skills_total": int(match_debug.get("priority_skills_total", priority_total)),
        "complementary_skills_matched": int(match_debug.get("complementary_skills_matched", complementary_matched)),
        "complementary_skills_total": int(match_debug.get("complementary_skills_total", complementary_total)),
        "eliminatory_skills_matched": int(match_debug.get("eliminatory_skills_matched", eliminatory_matched)),
        "eliminatory_skills_total": int(match_debug.get("eliminatory_skills_total", eliminatory_total)),
        "matched_priority_skills": list(match_debug.get("matched_priority_skills") or []) or sorted(priority_names & matched_names),
        "missing_priority_skills": list(match_debug.get("missing_priority_skills") or []) or sorted(priority_names - matched_names),
        "matched_complementary_skills": list(match_debug.get("matched_complementary_skills") or []) or sorted(complementary_names & matched_names),
        "missing_complementary_skills": list(match_debug.get("missing_complementary_skills") or []) or sorted(complementary_names - matched_names),
        "matched_eliminatory_skills": list(match_debug.get("matched_eliminatory_skills") or []) or sorted(eliminatory_names & matched_names),
        "missing_eliminatory_skills": missing_eliminatory_skills,
        "complementary_bonus_cap_slots": int(match_debug.get("complementary_bonus_cap_slots", min(complementary_total, 5))),
        "priority_strong_coverage": priority_strong_coverage,
        "education_detected": match_debug.get("education_detected", row.get("education_level")),
        "minimum_education_required": match_debug.get("minimum_education_required", job.minimum_education_level),
        "experience_detected": match_debug.get("experience_detected", float(candidate_years) if candidate_years is not None else None),
        "minimum_experience_required": match_debug.get("minimum_experience_required", float(required_years) if required_years is not None else None),
    }


def _apply_validation_guardrails(row: dict, bd: dict[str, Decimal]) -> None:
    q = Decimal("0.01")
    validation_status = bd.get("validation_status") or row.get("validation_status")

    if validation_status == "fail":
        capped_score = min(bd["final_score"], Decimal("39.00")).quantize(q)
        bd["validation_penalty_score"] = max(Decimal("0.00"), bd["final_score"] - capped_score).quantize(q)
        bd["final_score"] = capped_score
        return

    if validation_status == "unknown":
        bd["validation_penalty_score"] = Decimal("0.00").quantize(q)


def _apply_deal_breaker_guardrails(bd: dict[str, Decimal], violations: list[dict]) -> None:
    """Apply deal-breaker violations as hard rejections.

    If any deal-breaker is violated, score becomes 0 (hard rejection).
    """
    q = Decimal("0.01")
    if violations:
        bd["deal_breaker_penalty_score"] = bd["final_score"].quantize(q)
        bd["final_score"] = Decimal("0.00")


def _apply_eliminatory_skill_guardrails(
    *,
    row: dict[str, Any],
    job: JobModel,
    job_skill_rows: list[Any],
    bd: dict[str, Any],
) -> None:
    q = Decimal("0.01")
    raw_requirements = getattr(job, "skill_requirements", None)
    try:
        skill_requirements = validate_skill_requirements(raw_requirements or {})
    except ValueError:
        skill_requirements = {"eliminatory": []}

    critical_names = {
        str(skill).strip()
        for skill in skill_requirements.get("eliminatory", [])
        if str(skill).strip()
    }
    if not critical_names:
        return

    missing_from_breakdown = {
        str(skill).strip()
        for skill in (bd.get("missing_eliminatory_skills") or [])
        if str(skill).strip() in critical_names
    }
    missing_from_row = {
        str(skill).strip()
        for skill in _coerce_list(row.get("missing_skills"))
        if str(skill).strip() in critical_names
    }
    missing_critical = missing_from_breakdown | missing_from_row
    if not missing_critical:
        return

    before_cap = _to_decimal(bd.get("final_score"))
    after_cap = min(before_cap, _ELIMINATORY_MISSING_CAP).quantize(q)
    bd["final_score"] = after_cap
    bd["eligibility_status"] = "FAIL"
    if after_cap < before_cap:
        bd["cap_applied"] = True
        bd["cap_reason"] = "missing_eliminatory_skills"
        bd["failed_rule"] = "missing_eliminatory_skills"
        bd["failed_dimension"] = "skills"


def _decide(final_score: Decimal, threshold_high: Decimal, threshold_low: Decimal) -> str:
    if final_score >= threshold_high:
        return "approved"
    if final_score >= threshold_low:
        return "review"
    return "rejected_suggested"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (ValueError, TypeError) as exc:
        logger.warning(
            "ranking.decimal_conversion_failed",
            value=str(value)[:100],
            error=str(exc),
            using_default=str(default),
        )
        return default


def _is_skill_priority(item: Any) -> bool:
    try:
        if not hasattr(item, "JobRequiredSkillModel"):
            logger.warning(
                "job_skill_row_missing_relation",
                item_type=type(item).__name__,
            )
            return False

        link = item.JobRequiredSkillModel
        if not hasattr(link, "priority_level"):
            return False

        return is_priority_skill(link.priority_level)
    except Exception as exc:
        logger.error(
            "job_skill_priority_check_failed",
            error=str(exc),
            error_type=type(exc).__name__,
        )
        return False


def _is_skill_complementary(item: Any) -> bool:
    try:
        if not hasattr(item, "JobRequiredSkillModel"):
            return False
        return is_complementary_skill(item.JobRequiredSkillModel.priority_level)
    except Exception:
        return False


def _is_skill_eliminatory(item: Any) -> bool:
    try:
        if not hasattr(item, "JobRequiredSkillModel"):
            return False
        return is_eliminatory_skill(item.JobRequiredSkillModel.priority_level)
    except Exception:
        return False


def _skill_priority_label(item: Any) -> str:
    if _is_skill_eliminatory(item):
        return "eliminatory"
    if _is_skill_priority(item):
        return "priority"
    return "complementary"


def _resolve_thresholds(version: ScoreModelVersionModel) -> tuple[Decimal, Decimal]:
    thresholds = {k: Decimal(str(v)) for k, v in version.thresholds.items()}
    high = thresholds.get("high", Decimal("70"))
    low = thresholds.get("low", Decimal("55"))
    return high, low


def _coerce_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _resolve_freshness_status(
    *,
    ranking_updated_at: datetime | None,
    match_updated_at: datetime | None,
    persisted_status: str | None,
    score_job_signature_hash: str | None = None,
    job_signature_hash: str | None = None,
    score_computed_at: datetime | None = None,
    job_updated_at: datetime | None = None,
) -> tuple[str, str | None]:
    if persisted_status != "fresh":
        return ("stale", "Registro persistido não está fresh. Recompute necessário.")
    if score_job_signature_hash is None or not str(score_job_signature_hash).strip():
        return ("stale", "Score sem job_signature_hash válido. Recompute necessário.")
    if job_signature_hash is None or not str(job_signature_hash).strip():
        return ("stale", "Vaga sem job_profile_hash válido. Recompute necessário.")
    if score_job_signature_hash != job_signature_hash:
        return ("stale", "Score computado com outra assinatura de vaga. Recompute necessário.")
    if job_updated_at is None:
        return ("stale", "Vaga sem updated_at. Recompute necessário.")
    if score_computed_at is None:
        return ("stale", "Score sem computed_at. Recompute necessário.")
    if score_computed_at < job_updated_at:
        return ("stale", "Vaga foi modificada após o score. Recompute necessário.")
    if ranking_updated_at is None or match_updated_at is None:
        return ("stale", "Faltam timestamps do ranking ou match. Recompute necessário.")
    if ranking_updated_at < match_updated_at:
        return ("stale", "Match mais recente que ranking. Recompute necessário.")
    return ("fresh", None)


def _build_score_input_hash(
    *,
    row: dict[str, Any],
    score_version: str,
    job_signature_hash: str,
) -> str:
    raw = "|".join([
        str(row.get("candidate_id") or ""),
        str(row.get("source_analysis_id") or ""),
        str(row.get("source_analysis_created_at") or ""),
        str(row.get("resume_version_id") or ""),
        ",".join(_coerce_list(row.get("matched_skills"))),
        ",".join(_coerce_list(row.get("missing_skills"))),
        str(row.get("total_experience_years") or ""),
        str(row.get("seniority_level") or ""),
        job_signature_hash,
        score_version,
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _build_job_signature_hash(*, job: JobModel, job_skill_rows: list[Any]) -> str:
    raw = "|".join([
        str(job.title or ""),
        str(job.description or ""),
        str(job.requirements or ""),
        str(job.seniority_level or ""),
        str(job.minimum_education_level or ""),
        str(job.minimum_years_experience or ""),
        str(job.deal_breakers or []),
        "|".join(
            sorted(
                [
                    ":".join(
                        [
                            str(item.skill_name or ""),
                            _skill_priority_label(item),
                            str(getattr(item.JobRequiredSkillModel, "minimum_level", None) or ""),
                            str(getattr(item.JobRequiredSkillModel, "minimum_years", None) or ""),
                            str(getattr(item.JobRequiredSkillModel, "weight", None) or ""),
                        ]
                    )
                    for item in job_skill_rows
                    if str(item.skill_name or "").strip()
                ]
            )
        ),
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _default_score_breakdown(*, public_job_fit_score: Any | None = None) -> dict[str, Any]:
    """Return a safe default score breakdown for malformed data."""
    zero = Decimal("0.00")
    job_fit_score = zero
    if public_job_fit_score is not None:
        job_fit_score = _to_decimal(public_job_fit_score).quantize(Decimal("0.01"))
    return {
        "skill_match_score": zero,
        "experience_match_score": zero,
        "seniority_match_score": zero,
        "education_score": zero,
        "confidence_score": zero,
        "penalty_score": zero,
        "validation_penalty_score": zero,
        "job_fit_score": job_fit_score,
    }


def _normalize_score_breakdown(
    raw: Any,
    *,
    public_job_fit_score: Any | None = None,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        logger.warning("ranking.invalid_score_breakdown_type", type=type(raw).__name__)
        return _default_score_breakdown(public_job_fit_score=public_job_fit_score)

    breakdown = dict(raw)
    if public_job_fit_score is not None and breakdown.get("job_fit_score") is None:
        breakdown["job_fit_score"] = public_job_fit_score

    q = Decimal("0.01")
    defaults = _default_score_breakdown(public_job_fit_score=public_job_fit_score)
    normalized: dict[str, Any] = {
        "skill_match_score": _to_decimal(
            breakdown.get("skill_match_score", defaults["skill_match_score"]),
        ).quantize(q),
        "experience_match_score": _to_decimal(
            breakdown.get("experience_match_score", defaults["experience_match_score"]),
        ).quantize(q),
        "seniority_match_score": _to_decimal(
            breakdown.get("seniority_match_score", defaults["seniority_match_score"]),
        ).quantize(q),
        "education_score": _to_decimal(
            breakdown.get("education_score", defaults["education_score"]),
        ).quantize(q),
        "confidence_score": _to_decimal(
            breakdown.get("confidence_score", defaults["confidence_score"]),
        ).quantize(q),
        "penalty_score": _to_decimal(
            breakdown.get("penalty_score", defaults["penalty_score"]),
        ).quantize(q),
        "validation_penalty_score": _to_decimal(
            breakdown.get("validation_penalty_score", defaults["validation_penalty_score"]),
        ).quantize(q),
        "job_fit_score": _to_decimal(
            breakdown.get("job_fit_score", defaults["job_fit_score"]),
        ).quantize(q),
    }
    decimal_keys = (
        "raw_score",
        "priority_score_weighted",
        "complementary_score_weighted",
        "complementary_score_raw_weighted",
        "priority_component_impact",
        "complementary_component_impact",
        "experience_component_impact",
        "seniority_component_impact",
        "deal_breaker_penalty_score",
    )
    for key in decimal_keys:
        if breakdown.get(key) is not None:
            normalized[key] = _to_decimal(breakdown.get(key)).quantize(q)

    forbidden_public_keys = {
        "final_score",
        "final_score_before_cap",
        "final_score_after_cap",
    }
    for key, value in breakdown.items():
        if key in normalized or key in forbidden_public_keys:
            continue
        normalized[key] = value

    return normalized


def _serialize_breakdown(raw: dict[str, Any]) -> dict[str, Any]:
    serialized: dict[str, Any] = {}
    for key, value in raw.items():
        if isinstance(value, Decimal):
            serialized[key] = float(value)
        else:
            serialized[key] = value
    if serialized.get("job_fit_score") is None and raw.get("final_score") is not None:
        serialized["job_fit_score"] = float(_to_decimal(raw.get("final_score")).quantize(Decimal("0.01")))
    return serialized


def _normalize_reason_codes(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []

    normalized: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        normalized_item = dict(item)
        normalized_item["type"] = str(item.get("type") or "")
        normalized_item["field"] = str(item.get("field") or "")
        normalized_item["impact"] = float(item.get("impact") or 0)
        normalized_item["description"] = str(item.get("description") or "")
        normalized.append(normalized_item)
    return normalized


def _normalize_factor_summary(raw: Any) -> dict[str, list[dict[str, Any]]]:
    default = {"positive": [], "negative": [], "contextual": []}
    if not isinstance(raw, dict):
        return default

    normalized = dict(default)
    for key in ("positive", "negative", "contextual"):
        value = raw.get(key)
        if isinstance(value, list):
            normalized[key] = [dict(item) for item in value if isinstance(item, dict)]
    return normalized

def _eligibility_sort_rank(value: Any) -> int:
    normalized = str(value).strip().upper()
    if normalized == "PASS":
        return 0
    if normalized == "REVIEW":
        return 1
    if normalized == "FAIL":
        return 2
    return 3


def _coerce_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if str(v).strip()]
    return []


def _has_canonical_skill_evidence(row: dict[str, Any]) -> bool:
    evidence = row.get("skill_evidence_breakdown")
    if not isinstance(evidence, dict):
        return False
    return evidence.get("priority_score_weighted") is not None


def _has_valid_persisted_ranking_row(row: dict[str, Any]) -> bool:
    if row.get("final_score") is None:
        return False
    if not isinstance(row.get("breakdown"), dict):
        return False
    if not isinstance(row.get("reason_codes"), list):
        return False
    if row.get("computed_at") is None:
        return False
    if row.get("match_updated_at") is None:
        return False
    return True


def _enrich_match_row_for_deal_breakers(row: dict[str, Any]) -> dict[str, Any]:
    analysis_fields = _extract_analysis_result_fields(row.get("analysis_extracted_data"))
    profile_fields = _extract_candidate_profile_fields(row.get("candidate_profile_raw_response_json"))

    row["location_city"] = _first_non_empty_string(
        row.get("location_city"),
        analysis_fields.get("location_city"),
        analysis_fields.get("location"),
        profile_fields.get("location_city"),
        profile_fields.get("location"),
    )
    row["internal_notes"] = _first_non_empty_string(row.get("internal_notes"))
    row["work_model"] = _first_non_empty_string(
        analysis_fields.get("work_model"),
        profile_fields.get("work_model"),
    )
    row["languages"] = _normalize_languages(
        analysis_fields.get("languages")
        if analysis_fields.get("languages") is not None
        else profile_fields.get("languages")
    )
    row["availability"] = _first_non_empty_string(
        analysis_fields.get("availability"),
        profile_fields.get("availability"),
    )
    return row


def _extract_analysis_result_fields(raw: Any) -> dict[str, Any]:
    return raw if isinstance(raw, dict) else {}


def _extract_candidate_profile_fields(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    analysis_fields = raw.get("analysis_result_fields")
    if isinstance(analysis_fields, dict):
        return analysis_fields
    return raw


def _first_non_empty_string(*values: Any) -> str | None:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _normalize_languages(raw: Any) -> list[str]:
    values = raw if isinstance(raw, list) else [raw] if raw is not None else []
    languages: list[str] = []
    for item in values:
        if isinstance(item, dict):
            text = item.get("language") or item.get("name") or item.get("value")
        else:
            text = item
        if text is None:
            continue
        normalized = str(text).strip()
        if normalized and normalized not in languages:
            languages.append(normalized)
    return languages


def _find_missing_deal_breaker_fields(
    deal_breakers: list[dict[str, Any]] | None,
    row: dict[str, Any],
) -> list[str]:
    if not deal_breakers:
        return []

    missing: list[str] = []
    seen: set[str] = set()
    for deal_breaker in deal_breakers:
        if not deal_breaker.get("is_active", True):
            continue

        field = str(deal_breaker.get("field") or "").strip()
        missing_key: str | None = None
        if field == "location" and not _first_non_empty_string(row.get("location_city")):
            missing_key = "location_city"
        elif field == "work_model" and not _first_non_empty_string(row.get("work_model")):
            missing_key = "work_model"
        elif field == "education_level" and not _first_non_empty_string(row.get("education_level")):
            missing_key = "education_level"
        elif field == "experience_years" and row.get("total_experience_years") is None:
            missing_key = "total_experience_years"
        elif field == "language" and not _normalize_languages(row.get("languages")):
            missing_key = "languages"
        elif field == "availability" and not _first_non_empty_string(row.get("availability")):
            missing_key = "availability"
        elif field == "custom_text":
            has_searchable_text = any(
                _first_non_empty_string(row.get(key))
                for key in ("candidate_name", "location_city", "internal_notes")
            )
            if not has_searchable_text:
                missing_key = "custom_text_context"

        if missing_key is not None and missing_key not in seen:
            seen.add(missing_key)
            missing.append(missing_key)

    return missing


def _format_missing_deal_breaker_evidence_reason(fields: list[str]) -> str:
    return "Evidência ausente para deal-breaker: " + ", ".join(fields)


def _append_validation_reason(existing: Any, new_reason: str) -> str:
    reasons = [str(existing).strip()] if isinstance(existing, str) and str(existing).strip() else []
    if new_reason and new_reason not in reasons:
        reasons.append(new_reason)
    return " | ".join(reasons)
