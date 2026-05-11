import logging
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

# Penalidade de sobre-qualificação em senioridade só é aplicada quando
# a diferença de níveis é >= este limiar (configurável).
_SENIORITY_PENALTY_THRESHOLD = 2
_CANONICAL_PRIORITY_WEIGHT = Decimal("0.50")
_CANONICAL_COMPLEMENTARY_WEIGHT = Decimal("0.10")
_CANONICAL_EXPERIENCE_WEIGHT = Decimal("0.20")
_CANONICAL_SENIORITY_WEIGHT = Decimal("0.10")
_CANONICAL_AI_WEIGHT = Decimal("0.00")
_OPTIONAL_BONUS_CAP_SLOTS = 5
_NO_REQUIREMENTS_SCORE_CAP = Decimal("44")
_STRONG_MATCH_THRESHOLD = Decimal("85")
_GOOD_MATCH_THRESHOLD = Decimal("70")
_POTENTIAL_THRESHOLD = Decimal("55")
_PRIORITY_THRESHOLD = Decimal("60")
_PRIORITY_SOFT_PENALTY_START = Decimal("80")
_PRIORITY_SOFT_PENALTY_MAX = Decimal("0")
_PRIORITY_STRONG_COVERAGE_STRONG_MATCH = Decimal("80")
_PRIORITY_STRONG_COVERAGE_GOOD_MATCH = Decimal("60")
_PRIORITY_STRONG_COVERAGE_CAP_THRESHOLD = Decimal("0")
_PRIORITY_STRONG_COVERAGE_CAP_SCORE = Decimal("100")
_MINIMUM_DOMAIN_FIT_CAP_SCORE = Decimal("49")
_LOW_PROFILE_COMPLETENESS_THRESHOLD = Decimal("0.60")
_SCORE_VERSION_EQUIVALENCE = "v4-priority-level"

logger = logging.getLogger(__name__)

from src.domain.entities.user import User
from src.domain.entities.user import UserRole
from src.application.services.audit_service import AuditService
from src.application.services.analysis_match_store import AnalysisMatchStore
from src.application.services.analysis_ranking_refresh_service import (
    AnalysisRankingRefreshService,
)
from src.application.services.eligibility_engine_service import EligibilityEngineService
from src.application.services.job_profiler_service import (
    JobProfilerService,
    build_job_profile_hash,
    job_skill_from_row,
)
from src.application.services.job_skill_priority_service import (
    is_complementary_skill,
    is_eliminatory_skill,
    is_priority_skill,
)
from src.application.services.skill_requirements_service import validate_skill_requirements
from src.application.services.skill_equivalence_service import SkillEquivalenceService
from src.application.services.skill_text_normalizer import (
    contains_whole_phrase,
    normalize_skill_name,
    normalize_skill_text,
)
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.infrastructure.ai.factory import AIServiceFactory, UnsupportedAIProviderError
from src.interface.api.schemas.analysis_schemas import (
    AnalysisGlobalItemResponse,
    AnalysisMatchResponse,
    AnalysisPipelineJobMatchResponse,
    AnalysisPipelineResponse,
)
from src.application.services.pipeline_service import PipelineService


# ── Validation State ──────────────────────────────────────────────────────────
@dataclass
class ValidationResult:
    """Represents validation outcome: PASS | FAIL | UNKNOWN."""
    status: str  # "pass" | "fail" | "unknown"
    reason: str | None = None  # Explanation for FAIL or UNKNOWN


# ── Education Level Hierarchy ──────────────────────────────────────────────────
EDUCATION_HIERARCHY = {
    None: -1,
    "none": 0,
    "high_school": 1,
    "technical": 2,
    "bachelor": 3,
    "postgraduate": 4,
    "master": 5,
    "phd": 6,
}


def _get_education_level_rank(level: str | None) -> int:
    """Get numeric rank of education level for comparison.

    Higher rank = higher education.
    Returns -1 if level is unknown or None.
    """
    if level is None:
        return -1
    return EDUCATION_HIERARCHY.get(level.lower(), -1)


def _extract_profile_completeness(candidate_result: object) -> Decimal | None:
    extracted = getattr(candidate_result, "extracted_data", None)
    if not isinstance(extracted, dict):
        return None
    value = extracted.get("profile_completeness")
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _skill_matches_exact_only(
    candidate_skill_name: str,
    job_skill_name: str,
) -> bool:
    """Check if candidate skill exactly matches job skill after normalization."""
    from src.application.services.skill_text_normalizer import normalize_skill_text

    candidate_normalized = normalize_skill_text(candidate_skill_name)
    job_normalized = normalize_skill_text(job_skill_name)

    return candidate_normalized == job_normalized


def _compute_skill_scores(
    job_skill_rows: list,
    all_candidate_skills: set[str],
    *,
    candidate_skill_context: dict[str, dict[str, object]] | None = None,
    weaken_uncontextualized: bool = False,
) -> dict:
    """Compute weighted skill scores using equivalence service.

    Uses exact normalized equality and SkillEquivalenceService for all equivalence logic.

    Returns dict with canonical priority/complementary/eliminatory breakdown.
    - matched_skill_names: list[str] (skills with score >= 0.8)
    - missing_skill_names: list[str] (skills with score == 0)
    - partial_matches: list[dict] (0 < score < 0.8)
    - has_any_strong_priority: bool (at least one exact/strong match)
    - weak_evidence_priority_skills: list[str] (priority skills downgraded due weak context)
    """
    equivalence_service = SkillEquivalenceService()
    priority_skills = [
        row
        for row in job_skill_rows
        if is_priority_skill(row.JobRequiredSkillModel.priority_level)
    ]
    complementary_skills = [
        row
        for row in job_skill_rows
        if is_complementary_skill(row.JobRequiredSkillModel.priority_level)
    ]
    eliminatory_skills = [
        row
        for row in job_skill_rows
        if is_eliminatory_skill(row.JobRequiredSkillModel.priority_level)
    ]

    priority_scores: list[Decimal] = []
    complementary_scores: list[Decimal] = []
    eliminatory_scores: list[Decimal] = []
    partial_matches: list[dict] = []
    matched_skill_names: list[str] = []
    matched_priority_skill_names: list[str] = []
    matched_complementary_skill_names: list[str] = []
    matched_eliminatory_skill_names: list[str] = []
    missing_skill_names: list[str] = []
    missing_complementary_skill_names: list[str] = []
    missing_eliminatory_skill_names: list[str] = []
    has_any_strong_priority = False
    weak_evidence_priority_skills: list[str] = []
    skill_evidence_details: list[dict] = []

    def _fulfills_required_skill(
        *,
        match_type: str,
        weak_evidence: bool,
        best_evidence: object | None,
    ) -> bool:
        if match_type == "exact":
            return not weak_evidence
        evidence_strength = str(getattr(best_evidence, "strength", "") or "").strip().lower()
        return evidence_strength == "strong" and not weak_evidence

    def _apply_context_guardrail(
        score: Decimal,
        candidate_skill_name: str | None,
        *,
        match_type: str,
        best_evidence: object | None = None,
    ) -> tuple[Decimal, bool, str, bool]:
        if not weaken_uncontextualized or score <= Decimal("0"):
            return score, False, "strong", False
        if not candidate_skill_name:
            return score, False, "unknown", False

        context_map = candidate_skill_context or {}
        normalized = normalize_skill_text(candidate_skill_name)
        context = context_map.get(normalized, {})
        has_context = bool(context.get("has_context"))
        confidence = str(context.get("confidence") or "medium").strip().lower()
        source = str(context.get("source") or "").strip().lower()
        context_missing = not has_context
        equivalence_strength = str(getattr(best_evidence, "strength", "") or "").strip().lower()

        if match_type == "exact" and source != "keyword_fallback":
            evidence_strength = "strong" if has_context else "weak"
            if confidence == "low":
                evidence_strength = "weak"
            return score, False, evidence_strength, context_missing

        if (
            match_type in {"relation", "group"}
            and equivalence_strength == "strong"
            and source == "skill_mention"
            and confidence != "low"
        ):
            return score, False, "strong", context_missing

        multiplier = Decimal("1.00")
        if source == "keyword_fallback":
            multiplier = Decimal("0.55")
        elif not has_context and match_type == "relation":
            multiplier = Decimal("0.85")
        elif not has_context:
            multiplier = Decimal("0.65")
        elif confidence == "low":
            multiplier = Decimal("0.85")
        elif confidence == "medium":
            multiplier = Decimal("0.95")

        evidence_strength = "weak" if multiplier < Decimal("0.80") else "medium"
        if multiplier >= Decimal("1.00"):
            return score, False, "strong", context_missing
        return (score * multiplier).quantize(Decimal("0.0001")), True, evidence_strength, context_missing

    def _resolve_best_match(job_skill_name: str) -> tuple[Decimal, str | None, object | None, str]:
        best_score = Decimal("0.0")
        best_candidate = None
        best_evidence = None
        best_match_type = "none"

        for candidate_skill in all_candidate_skills:
            if _skill_matches_exact_only(candidate_skill, job_skill_name):
                return Decimal("1.0"), candidate_skill, None, "exact"

            evidence = equivalence_service.match_skill(candidate_skill, job_skill_name)
            if evidence.matched and evidence.score > float(best_score):
                best_score = Decimal(str(evidence.score))
                best_candidate = candidate_skill
                best_evidence = evidence
                best_match_type = "relation" if evidence.source == "relation" else "group"

        return best_score, best_candidate, best_evidence, best_match_type

    def _append_partial_match(
        *,
        job_skill_name: str,
        best_candidate: str | None,
        adjusted_score: Decimal,
        best_evidence: object | None,
        weak_evidence: bool,
    ) -> None:
        if float(adjusted_score) <= 0 or float(adjusted_score) >= 0.8:
            return
        partial_matches.append({
            "required": job_skill_name,
            "candidate": best_candidate or "",
            "score": float(adjusted_score),
            "reason": best_evidence.reason if best_evidence else f'"{best_candidate}" parcialmente atende "{job_skill_name}".',
            "source": best_evidence.source if best_evidence else "none",
            "weak_evidence": weak_evidence,
        })

    # Process priority skills
    for job_skill_row in priority_skills:
        job_skill_name = job_skill_row.skill_name
        best_score, best_candidate, best_evidence, best_match_type = _resolve_best_match(job_skill_name)

        adjusted_score, weak_evidence, evidence_strength, context_missing = _apply_context_guardrail(
            best_score,
            best_candidate,
            match_type=best_match_type,
            best_evidence=best_evidence,
        )
        fulfills_requirement = _fulfills_required_skill(
            match_type=best_match_type,
            weak_evidence=weak_evidence,
            best_evidence=best_evidence,
        )
        priority_scores.append(adjusted_score)
        if weak_evidence:
            weak_evidence_priority_skills.append(job_skill_name)
        if best_candidate and adjusted_score > Decimal("0"):
            skill_evidence_details.append({
                "required": job_skill_name,
                "candidate": best_candidate,
                "match_type": best_match_type,
                "coverage": float(adjusted_score),
                "raw_coverage": float(best_score),
                "evidence_strength": evidence_strength,
                "context_missing": context_missing,
                "source": best_evidence.source if best_evidence else "exact",
                "weak_evidence": weak_evidence,
                "equivalence_strength": getattr(best_evidence, "strength", "exact") if best_evidence else "exact",
                "fulfills_requirement": fulfills_requirement,
                "priority_level": "priority",
            })

        if fulfills_requirement:
            matched_skill_names.append(job_skill_name)
            matched_priority_skill_names.append(job_skill_name)
            has_any_strong_priority = True

        if not fulfills_requirement:
            missing_skill_names.append(job_skill_name)

        _append_partial_match(
            job_skill_name=job_skill_name,
            best_candidate=best_candidate,
            adjusted_score=adjusted_score,
            best_evidence=best_evidence,
            weak_evidence=weak_evidence,
        )

    # Process complementary skills
    for job_skill_row in complementary_skills:
        job_skill_name = job_skill_row.skill_name
        best_score, best_candidate, best_evidence, best_match_type = _resolve_best_match(job_skill_name)

        adjusted_score, _, evidence_strength, context_missing = _apply_context_guardrail(
            best_score,
            best_candidate,
            match_type=best_match_type,
            best_evidence=best_evidence,
        )
        complementary_scores.append(adjusted_score)
        if best_candidate and adjusted_score > Decimal("0"):
            skill_evidence_details.append({
                "required": job_skill_name,
                "candidate": best_candidate,
                "match_type": best_match_type,
                "coverage": float(adjusted_score),
                "raw_coverage": float(best_score),
                "evidence_strength": evidence_strength,
                "context_missing": context_missing,
                "source": "exact" if best_match_type == "exact" else "equivalence",
                "equivalence_strength": getattr(best_evidence, "strength", "exact") if best_evidence else "exact",
                "priority_level": "complementary",
            })

        if adjusted_score >= Decimal("0.8"):
            matched_skill_names.append(job_skill_name)
            matched_complementary_skill_names.append(job_skill_name)

        if adjusted_score == Decimal("0.0"):
            missing_complementary_skill_names.append(job_skill_name)

    # Process eliminatory skills
    for job_skill_row in eliminatory_skills:
        job_skill_name = job_skill_row.skill_name
        best_score, best_candidate, best_evidence, best_match_type = _resolve_best_match(job_skill_name)
        adjusted_score, weak_evidence, evidence_strength, context_missing = _apply_context_guardrail(
            best_score,
            best_candidate,
            match_type=best_match_type,
            best_evidence=best_evidence,
        )
        fulfills_requirement = _fulfills_required_skill(
            match_type=best_match_type,
            weak_evidence=weak_evidence,
            best_evidence=best_evidence,
        )
        eliminatory_scores.append(adjusted_score)
        if best_candidate and adjusted_score > Decimal("0"):
            skill_evidence_details.append({
                "required": job_skill_name,
                "candidate": best_candidate,
                "match_type": best_match_type,
                "coverage": float(adjusted_score),
                "raw_coverage": float(best_score),
                "evidence_strength": evidence_strength,
                "context_missing": context_missing,
                "source": best_evidence.source if best_evidence else "exact",
                "weak_evidence": weak_evidence,
                "equivalence_strength": getattr(best_evidence, "strength", "exact") if best_evidence else "exact",
                "fulfills_requirement": fulfills_requirement,
                "priority_level": "eliminatory",
            })
        if fulfills_requirement:
            matched_skill_names.append(job_skill_name)
            matched_eliminatory_skill_names.append(job_skill_name)
        else:
            missing_eliminatory_skill_names.append(job_skill_name)
        _append_partial_match(
            job_skill_name=job_skill_name,
            best_candidate=best_candidate,
            adjusted_score=adjusted_score,
            best_evidence=best_evidence,
            weak_evidence=weak_evidence,
        )

    # Compute weighted scores
    priority_score_weighted = (
        sum(priority_scores) / Decimal(len(priority_scores)) * Decimal("100")
        if priority_scores
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    complementary_score_raw_weighted = (
        sum(complementary_scores) / Decimal(len(complementary_scores)) * Decimal("100")
        if complementary_scores
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    complementary_bonus_cap_slots = (
        min(len(complementary_scores), _OPTIONAL_BONUS_CAP_SLOTS)
        if complementary_scores
        else 0
    )
    complementary_bonus_scores = (
        sorted((score for score in complementary_scores if score > Decimal("0")), reverse=True)[:complementary_bonus_cap_slots]
        if complementary_bonus_cap_slots > 0
        else []
    )
    complementary_score_weighted = (
        sum(complementary_bonus_scores) / Decimal(complementary_bonus_cap_slots) * Decimal("100")
        if complementary_bonus_cap_slots > 0
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    priority_strong_coverage = (
        Decimal(len(matched_priority_skill_names)) / Decimal(len(priority_scores)) * Decimal("100")
        if priority_scores
        else Decimal("100")
    ).quantize(Decimal("0.01"))

    eliminatory_score_weighted = (
        sum(eliminatory_scores) / Decimal(len(eliminatory_scores)) * Decimal("100")
        if eliminatory_scores
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    return {
        "priority_score_weighted": priority_score_weighted,
        "complementary_score_weighted": complementary_score_weighted,
        "complementary_score_raw_weighted": complementary_score_raw_weighted,
        "priority_strong_coverage": priority_strong_coverage,
        "priority_matched": len(matched_priority_skill_names),
        "complementary_matched": sum(1 for s in complementary_scores if s >= Decimal("0.8")),
        "eliminatory_matched": len(matched_eliminatory_skill_names),
        "matched_priority_skill_names": matched_priority_skill_names,
        "matched_complementary_skill_names": matched_complementary_skill_names,
        "matched_eliminatory_skill_names": matched_eliminatory_skill_names,
        "missing_complementary_skill_names": missing_complementary_skill_names,
        "missing_eliminatory_skill_names": missing_eliminatory_skill_names,
        "complementary_bonus_cap_slots": complementary_bonus_cap_slots,
        "matched_skill_names": matched_skill_names,
        "missing_skill_names": missing_skill_names,
        "partial_matches": partial_matches,
        "has_any_strong_priority": has_any_strong_priority,
        "weak_evidence_priority_skills": weak_evidence_priority_skills,
        "skill_evidence_details": skill_evidence_details,
        "eliminatory_score_weighted": eliminatory_score_weighted,
        "priority_score_weighted": priority_score_weighted,
        "complementary_score_weighted": complementary_score_weighted,
        "complementary_score_raw_weighted": complementary_score_raw_weighted,
        "priority_strong_coverage": priority_strong_coverage,
        "priority_matched": len(matched_priority_skill_names),
        "complementary_matched": sum(1 for s in complementary_scores if s >= Decimal("0.8")),
        "matched_priority_skill_names": matched_priority_skill_names,
        "matched_complementary_skill_names": matched_complementary_skill_names,
        "missing_complementary_skill_names": missing_complementary_skill_names,
        "complementary_bonus_cap_slots": complementary_bonus_cap_slots,
    }


async def _safe_session_flush(session: object | None) -> None:
    flush_fn = getattr(session, "flush", None)
    if not callable(flush_fn):
        return
    try:
        await _maybe_await(flush_fn())
    except Exception:
        logger.debug("analysis_service.session_flush_unavailable", exc_info=True)


def make_json_safe(value: object) -> object:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        integral_value = value.to_integral_value()
        return int(value) if value == integral_value else float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): make_json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [make_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [make_json_safe(item) for item in value]
    return value


def _validate_education(
    candidate_level: str | None,
    required_level: str | None,
    profile_completeness: Decimal | None = None,
) -> ValidationResult:
    """Validate candidate education against job requirement.

    Returns:
        PASS: candidate >= required
        FAIL: candidate < required
        UNKNOWN: candidate education level not provided
    """
    if required_level is None:
        return ValidationResult(status="pass")

    normalized_level = str(candidate_level).strip().lower() if candidate_level is not None else None

    if normalized_level in {None, "", "unknown", "undefined"}:
        return ValidationResult(
            status="unknown",
            reason=f"Educação não informada (exigido: {required_level})"
        )

    if normalized_level == "none":
        if (
            profile_completeness is None
            or profile_completeness < _LOW_PROFILE_COMPLETENESS_THRESHOLD
        ):
            return ValidationResult(
                status="unknown",
                reason=(
                    f"Educação ausente ou inconclusiva no currículo "
                    f"(exigido: {required_level})"
                ),
            )
        return ValidationResult(
            status="fail",
            reason=f"Educação insuficiente ({normalized_level} < {required_level})"
        )

    candidate_rank = _get_education_level_rank(normalized_level)
    required_rank = _get_education_level_rank(required_level)

    if candidate_rank < 0:
        return ValidationResult(
            status="unknown",
            reason=f"Educação não classificável ({candidate_level})"
        )

    if candidate_rank < required_rank:
        return ValidationResult(
            status="fail",
            reason=f"Educação insuficiente ({normalized_level} < {required_level})"
        )

    return ValidationResult(status="pass")


def _validate_experience(
    candidate_years: Decimal | None, required_years: Decimal | None
) -> ValidationResult:
    """Validate candidate experience against job requirement.

    Returns:
        PASS: candidate >= required
        FAIL: candidate < required
        UNKNOWN: candidate experience years not provided
    """
    if required_years is None:
        return ValidationResult(status="pass")

    if candidate_years is None:
        return ValidationResult(
            status="unknown",
            reason=f"Experiência não informada (exigido: {float(required_years):.1f} anos)"
        )

    if candidate_years < required_years:
        return ValidationResult(
            status="fail",
            reason=f"Experiência insuficiente ({float(candidate_years):.1f} < {float(required_years):.1f} anos)"
        )

    return ValidationResult(status="pass")


def _calculate_experience_score(
    candidate_years: Decimal | None,
    required_years: Decimal | None,
) -> Decimal:
    """Calculate an experience score from explicit years, not from AI summary."""
    if required_years is None:
        return Decimal("50") if candidate_years is not None else Decimal("40")

    if candidate_years is None:
        return Decimal("50")

    if required_years <= 0:
        return Decimal("70")

    ratio = candidate_years / required_years
    if ratio >= Decimal("1.25"):
        return Decimal("100")
    if ratio >= Decimal("1.00"):
        return Decimal("90")
    if ratio >= Decimal("0.80"):
        return Decimal("75")
    if ratio >= Decimal("0.60"):
        return Decimal("60")
    if ratio >= Decimal("0.40"):
        return Decimal("40")
    return Decimal("20")


def _calculate_seniority_score(
    candidate_level: str | None,
    job_level: str | None,
) -> Decimal:
    seniority_map = {
        "intern": 0,
        "junior": 1,
        "mid": 2,
        "senior": 3,
        "lead": 4,
        "principal": 5,
        "director": 6,
    }
    if job_level and candidate_level:
        candidate_sen = seniority_map.get(candidate_level or "", 2)
        job_sen = seniority_map.get(job_level or "", 2)
        distance = abs(candidate_sen - job_sen)
        sen_scores = {0: Decimal("100"), 1: Decimal("75"), 2: Decimal("45"), 3: Decimal("20")}
        seniority_score = sen_scores.get(distance, Decimal("0"))
        if candidate_sen > job_sen and distance >= _SENIORITY_PENALTY_THRESHOLD:
            return (seniority_score * Decimal("0.90")).quantize(Decimal("0.01"))
        return seniority_score.quantize(Decimal("0.01"))
    return Decimal("50.00")


def _canonical_component_weights(
    *,
    total_priority: int,
    total_complementary: int,
) -> dict[str, Decimal]:
    w_priority = _CANONICAL_PRIORITY_WEIGHT
    w_complementary = _CANONICAL_COMPLEMENTARY_WEIGHT
    w_exp = _CANONICAL_EXPERIENCE_WEIGHT
    w_sen = _CANONICAL_SENIORITY_WEIGHT

    if total_priority == 0 and total_complementary > 0:
        w_complementary += w_priority
        w_priority = Decimal("0")
    elif total_priority == 0 and total_complementary == 0:
        w_exp += w_priority + (w_complementary / 2)
        w_sen += w_complementary / 2
        w_priority = Decimal("0")
        w_complementary = Decimal("0")
    elif total_complementary == 0:
        w_priority += w_complementary
        w_complementary = Decimal("0")

    total = w_priority + w_complementary + w_exp + w_sen
    if total <= 0:
        return {
            "priority": Decimal("0"),
            "complementary": Decimal("0"),
            "experience": Decimal("0.67"),
            "seniority": Decimal("0.33"),
        }

    return {
        "priority": w_priority / total,
        "complementary": w_complementary / total,
        "experience": w_exp / total,
        "seniority": w_sen / total,
    }


def _priority_soft_penalty(priority_percentage: Decimal) -> Decimal:
    """Progressively penalize borderline priority coverage from 60% to 80%."""
    if priority_percentage >= _PRIORITY_SOFT_PENALTY_START:
        return Decimal("0")

    coverage_window = _PRIORITY_SOFT_PENALTY_START - _PRIORITY_THRESHOLD
    shortfall = _PRIORITY_SOFT_PENALTY_START - priority_percentage
    penalty_ratio = shortfall / coverage_window
    return (penalty_ratio * _PRIORITY_SOFT_PENALTY_MAX).quantize(Decimal("0.01"))


def _job_has_structured_requirements(
    *,
    total_skills: int,
    seniority_level: str | None,
    minimum_years_experience: Decimal | None,
    minimum_education_level: str | None,
    deal_breakers: list[dict] | None,
) -> bool:
    if total_skills > 0:
        return True
    if seniority_level and str(seniority_level).strip():
        return True
    if minimum_years_experience is not None:
        return True
    if minimum_education_level and str(minimum_education_level).strip():
        return True
    if deal_breakers:
        return True
    return False


def _skill_matches(
    candidate_skill_name: str,
    job_skill_name: str,
) -> bool:
    """
    Check if candidate skill matches the job skill using the canonical JSON catalog.

    The only matching rules here are exact normalized equality and
    SkillEquivalenceService, which reads backend/src/domain/catalogs/skill_equivalences.json.
    """
    candidate_normalized = normalize_skill_text(candidate_skill_name)
    job_normalized = normalize_skill_text(job_skill_name)
    if candidate_normalized == "" and job_normalized == "":
        return True
    if not candidate_normalized or not job_normalized:
        return False

    if candidate_normalized == job_normalized:
        return True

    return SkillEquivalenceService().match_skill(candidate_skill_name, job_skill_name).matched


def _unique_skill_names(skill_names: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for raw_name in skill_names:
        name = str(raw_name or "").strip()
        normalized = normalize_skill_text(name)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(name)
    return unique


def _looks_like_structured_skill_name(skill_name: str | None) -> bool:
    normalized = normalize_skill_text(skill_name or "")
    if not normalized:
        return False
    if len(normalized) > 40 or len(normalized.split()) > 4:
        return False
    if any(marker in normalized for marker in (",", ";", ":", " / ")):
        return False
    if any(phrase in normalized for phrase in ("utilizando", "experiencia em", "conhecimento em", "dominio de")):
        return False

    generic_phrases = {
        "test requirements",
        "test description",
        "job requirements",
        "job description",
        "requirements",
        "requirement",
        "description",
        "responsibilities",
    }
    if normalized in generic_phrases:
        return False
    if any(token in normalized.split() for token in {"requirements", "requirement", "description", "responsibilities"}):
        return False
    return True


def _candidate_profile_analysis_is_incomplete(profile: CandidateProfileAnalysisModel) -> bool:
    return (
        not getattr(profile, "education_level", None)
        or getattr(profile, "education_level", None) == "none"
        or getattr(profile, "experience_years", None) is None
        or not list(getattr(profile, "skills_json", None) or [])
    )


def _skill_names_from_extracted_data(extracted_data: dict | None) -> list[str]:
    if not isinstance(extracted_data, dict):
        return []
    raw_skills = extracted_data.get("skills")
    if not isinstance(raw_skills, list):
        return []
    return _unique_skill_names([
        str(skill.get("name")).strip()
        for skill in raw_skills
        if isinstance(skill, dict)
        and str(skill.get("name", "")).strip()
        and _looks_like_structured_skill_name(str(skill.get("name", "")).strip())
    ])


def _resume_text_skill_search_terms(skill_name: str) -> set[str]:
    normalized = normalize_skill_name(skill_name)
    if not normalized:
        return set()

    terms = {
        normalized,
        normalize_skill_text(skill_name),
        normalized.replace(".", ""),
    }

    alias_map = {
        "backend": {
            "backend",
            "back end",
            "back-end",
            "desenvolvimento de back end",
            "desenvolvedor backend",
        },
        "frontend": {
            "frontend",
            "front end",
            "front-end",
            "desenvolvimento de front end",
            "desenvolvedor frontend",
        },
        "node.js": {"node.js", "nodejs"},
        "javascript": {"javascript"},
        "sql": {"sql"},
        "typescript": {"typescript", "type script"},
    }
    terms.update(alias_map.get(normalized, set()))
    return {
        normalize_skill_name(term)
        for term in terms
        if normalize_skill_name(term)
    }


def _extract_resume_text_skill_names(
    resume_text: str | None,
    job_skill_rows: list,
) -> list[str]:
    if not resume_text or not isinstance(resume_text, str):
        return []

    normalized_text = normalize_skill_name(resume_text)
    if not normalized_text:
        return []

    matched: list[str] = []
    for row in job_skill_rows:
        skill_name = str(getattr(row, "skill_name", "") or "").strip()
        if not skill_name:
            continue
        for term in _resume_text_skill_search_terms(skill_name):
            if contains_whole_phrase(term, normalized_text):
                matched.append(skill_name)
                break
    return _unique_skill_names(matched)


def _extract_resume_text_experience_years(resume_text: str | None) -> Decimal | None:
    if not resume_text or not isinstance(resume_text, str):
        return None

    normalized_text = normalize_skill_name(resume_text)
    if not normalized_text:
        return None

    patterns = [
        r"\((\d+)\s+anos?(?:\s+(?:e\s+)?(\d+)\s+mes(?:es)?)?\)",
        r"\((\d+)\s+years?(?:\s+(?:and\s+)?(\d+)\s+months?)?\)",
        r"(\d+)\s+anos?(?:\s+(?:e\s+)?(\d+)\s+mes(?:es)?)",
        r"(\d+)\s+years?(?:\s+(?:and\s+)?(\d+)\s+months?)",
    ]

    durations_in_months: list[int] = []
    for pattern in patterns:
        for years_raw, months_raw in re.findall(pattern, normalized_text):
            years = int(years_raw or 0)
            months = int(months_raw or 0)
            total_months = (years * 12) + months
            if total_months > 0:
                durations_in_months.append(total_months)

    if not durations_in_months:
        return None

    return (Decimal(max(durations_in_months)) / Decimal("12")).quantize(Decimal("0.1"))


def _build_candidate_skill_context(extracted_data: dict | None) -> dict[str, dict[str, object]]:
    if not isinstance(extracted_data, dict):
        return {}

    raw_skills = extracted_data.get("skills")
    if not isinstance(raw_skills, list):
        return {}

    experience_terms: set[str] = set()
    raw_experiences = extracted_data.get("experiences")
    if isinstance(raw_experiences, list):
        for exp in raw_experiences:
            if not isinstance(exp, dict):
                continue
            activities = exp.get("activities") or []
            if isinstance(activities, list):
                experience_terms.update(
                    normalize_skill_text(str(item))
                    for item in activities
                    if str(item or "").strip()
                )
            role = str(exp.get("role") or "").strip()
            if role:
                experience_terms.add(normalize_skill_text(role))

    context: dict[str, dict[str, object]] = {}
    for raw_skill in raw_skills:
        if not isinstance(raw_skill, dict):
            continue
        display_name = str(raw_skill.get("name") or "").strip()
        if not display_name or not _looks_like_structured_skill_name(display_name):
            continue
        normalized_name = normalize_skill_text(display_name)
        if not normalized_name:
            continue

        confidence = str(raw_skill.get("confidence") or "medium").strip().lower()
        evidence = raw_skill.get("evidence") if isinstance(raw_skill.get("evidence"), list) else []
        evidence_terms = {
            normalize_skill_text(str(item))
            for item in evidence
            if str(item or "").strip()
        }
        has_context = bool(evidence_terms) or any(
            normalized_name in term or term in normalized_name
            for term in experience_terms
            if term
        )
        context[normalized_name] = {
            "confidence": confidence,
            "has_context": has_context,
            "source": str(raw_skill.get("source") or "skill_mention"),
        }

    return context


def _job_profile_analysis_is_incomplete(profile: JobProfileAnalysisModel) -> bool:
    raw_payload = getattr(profile, "raw_response_json", None)
    return not isinstance(raw_payload, dict) or not raw_payload


class AnalysisNotFoundError(Exception):
    pass


class AnalysisNotCompletedError(Exception):
    pass


class AnalysisResultNotFoundError(Exception):
    pass


class JobNotFoundError(Exception):
    pass


class AnalysisDiscardBlockedError(Exception):
    pass


@dataclass(frozen=True)
class AnalysisResultDetails:
    analysis: AnalysisModel
    result: AnalysisResultModel


class AnalysisService:
    def __init__(
        self,
        repository: SQLAlchemyAnalysisRepository,
        eligibility_engine_service: EligibilityEngineService | None = None,
        audit_service: AuditService | None = None,
    ) -> None:
        self._repository = repository
        self._eligibility_engine_service = eligibility_engine_service
        self._audit_service = audit_service
        self._match_store = AnalysisMatchStore(repository)
        self._ranking_refresh_service = AnalysisRankingRefreshService(
            repository._session,
            logger=logger,
        )

    def _get_eligibility_engine_service(self) -> EligibilityEngineService:
        if self._eligibility_engine_service is not None:
            return self._eligibility_engine_service
        self._eligibility_engine_service = EligibilityEngineService()
        return self._eligibility_engine_service

    async def list(
        self,
        current_user: User,
        page: int,
        page_size: int,
        status_filter: str | None,
    ) -> tuple[list[AnalysisModel], int]:
        return await self._repository.list_for_user(current_user, page, page_size, status_filter)

    async def list_global(
        self,
        page: int,
        page_size: int,
        status_filter: str | None = None,
        search: str | None = None,
        used_real_ai: bool | None = None,
    ) -> tuple[list[AnalysisGlobalItemResponse], int]:
        rows, total = await self._repository.list_global(
            page, page_size, status_filter, search, used_real_ai
        )
        items = [
            AnalysisGlobalItemResponse(
                id=row["id"],
                job_id=row["job_id"],
                candidate_id=row["candidate_id"],
                candidate_name=row["candidate_name"],
                candidate_email=row["candidate_email"],
                resume_file_name=row["resume_file_name"],
                resume_version_id=row["resume_version_id"],
                status=row["status"],
                failure_reason=row["failure_reason"],
                discarded_at=row.get("discarded_at"),
                discarded_by=row.get("discarded_by"),
                discard_reason=row.get("discard_reason"),
                discard_reason_note=row.get("discard_reason_note"),
                used_real_ai=row["used_real_ai"],
                retry_count=row["retry_count"],
                created_at=row["created_at"],
                started_at=row["started_at"],
                completed_at=row["completed_at"],
                failed_at=row["failed_at"],
            )
            for row in rows
        ]
        return items, total

    async def get(self, analysis_id: UUID, current_user: User) -> AnalysisModel:
        analysis = await self._repository.find_for_user(analysis_id, current_user)
        if analysis is None:
            raise AnalysisNotFoundError
        return analysis

    async def discard(
        self,
        analysis_id: UUID,
        *,
        current_user: User,
        reason: str,
        note: str | None = None,
    ) -> AnalysisModel:
        analysis = await self.get(analysis_id, current_user)
        if analysis.status == "discarded":
            raise ValidationException("A análise já está descartada.")
        if analysis.status == "processing":
            raise ValidationException("Não é possível descartar uma análise em processamento.")

        if (
            await self._repository.is_decision_linked(analysis.id)
            and current_user.role != UserRole.ADMIN
        ):
            raise AnalysisDiscardBlockedError(
                "Esta análise já foi usada em decisão do processo. Somente administradores podem descartá-la."
            )

        previous_status = str(analysis.status)
        now = datetime.now(UTC)
        analysis.status = "discarded"
        analysis.discarded_at = now
        analysis.discarded_by = current_user.id
        analysis.discard_reason = reason.strip()
        analysis.discard_reason_note = note.strip() if isinstance(note, str) and note.strip() else None
        analysis.updated_at = now
        saved = await self._repository.save(analysis)
        await self._log_discard_audit(
            analysis=saved,
            current_user=current_user,
            reason=analysis.discard_reason,
            note=analysis.discard_reason_note,
            before_state={"status": previous_status},
            after_state={"status": "discarded"},
        )
        return saved

    async def get_result(self, analysis_id: UUID, current_user: User) -> AnalysisResultDetails:
        analysis = await self.get(analysis_id, current_user)
        if analysis.status != "completed":
            raise AnalysisNotCompletedError

        result = await self._repository.find_result(analysis_id)
        if result is None:
            raise AnalysisResultNotFoundError
        return AnalysisResultDetails(analysis=analysis, result=result)

    async def get_pipeline_status(
        self,
        analysis_id: UUID,
        current_user: User,
    ) -> AnalysisPipelineResponse:
        analysis = await self.get(analysis_id, current_user)
        target_job_id = analysis.job_id
        has_persisted_match = False
        if target_job_id is not None:
            has_persisted_match = (
                await self._repository.find_candidate_job_match_for_analysis(
                    analysis_id,
                    target_job_id,
                )
            ) is not None

        published_jobs_total = 1 if target_job_id is not None else 0
        matched_jobs_count = 1 if has_persisted_match else 0
        pending_jobs_count = 1 if target_job_id is not None and not has_persisted_match else 0
        recent_matches = await self._repository.list_recent_job_matches_for_analysis(analysis_id)

        if analysis.status in {"failed", "cancelled", "discarded"}:
            matching_status = "blocked"
        elif analysis.status != "completed":
            matching_status = "waiting_analysis"
        elif target_job_id is None:
            matching_status = "idle"
        elif has_persisted_match:
            matching_status = "completed"
        else:
            matching_status = "idle"

        return AnalysisPipelineResponse(
            analysis_id=analysis.id,
            job_id=target_job_id,
            analysis_status=analysis.status,
            matching_status=matching_status,
            published_jobs_total=published_jobs_total,
            matched_jobs_count=matched_jobs_count,
            pending_jobs_count=pending_jobs_count,
            recent_matches=[
                AnalysisPipelineJobMatchResponse(**row)
                for row in recent_matches
            ],
        )

    async def match_to_job(
        self,
        analysis_id: UUID,
        job_id: UUID,
        current_user: User,
    ) -> AnalysisMatchResponse:
        details = await self.get_result(analysis_id, current_user)
        return await self._match_details_to_job(details, job_id)

    async def match_completed_analysis_to_job(
        self,
        analysis_id: UUID,
        job_id: UUID,
        score_model_version: ScoreModelVersionModel | None = None,
        *,
        force_recompute: bool = False,
    ) -> AnalysisMatchResponse:
        analysis = await self._repository.find_completed(analysis_id)
        if analysis is None:
            raise AnalysisNotCompletedError

        result = await self._repository.find_result(analysis_id)
        if result is None:
            raise AnalysisResultNotFoundError

        details = AnalysisResultDetails(analysis=analysis, result=result)
        return await self._match_details_to_job(
            details,
            job_id,
            score_model_version=score_model_version,
            force_recompute=force_recompute,
        )

    async def _log_discard_audit(
        self,
        *,
        analysis: AnalysisModel,
        current_user: User,
        reason: str | None,
        note: str | None,
        before_state: dict[str, str] | None,
        after_state: dict[str, str] | None,
    ) -> None:
        if self._audit_service is None:
            return
        await self._audit_service.log_event(
            action="discard_analysis",
            resource_type="analysis",
            resource_id=analysis.id,
            user_id=current_user.id,
            metadata={
                "entityType": "analysis",
                "entityId": str(analysis.id),
                "reason": reason,
                "note": note,
                "timestamp": datetime.now(UTC).isoformat(),
            },
            before_state=before_state,
            after_state=after_state,
        )

    async def _ensure_candidate_profile_analysis(
        self,
        *,
        analysis: AnalysisModel,
        result: AnalysisResultModel,
    ) -> CandidateProfileAnalysisModel:
        cached = await self._repository.find_latest_candidate_profile_analysis_for_resume(
            analysis.resume_version_id
        )
        if cached is not None:
            if _candidate_profile_analysis_is_incomplete(cached):
                extracted = result.extracted_data or {}
                refreshed_skills = _skill_names_from_extracted_data(extracted)
                if not refreshed_skills:
                    refreshed_skills = _unique_skill_names([
                        str(skill)
                        for skill in (result.keywords or [])
                        if str(skill).strip()
                    ])
                cached.education_level = result.highest_education_level
                cached.experience_years = result.total_experience_years
                cached.seniority_level = result.seniority_level
                cached.skills_json = refreshed_skills
                cached.summary = result.candidate_summary
            await _safe_session_flush(getattr(self._repository, "_session", None))
            return cached

        ai_prompt_row = await self._repository._session.execute(
            sa.select(AIModelModel.provider, AIModelModel.model_id, PromptTemplateModel.version)
            .select_from(AnalysisModel)
            .join(AIModelModel, AIModelModel.id == AnalysisModel.ai_model_id)
            .join(PromptTemplateModel, PromptTemplateModel.id == AnalysisModel.prompt_template_id)
            .where(AnalysisModel.id == analysis.id)
        )
        config = ai_prompt_row.first()
        provider = str(config[0]) if config is not None else "unknown"
        model_id = str(config[1]) if config is not None else "unknown"
        prompt_version = str(config[2]) if config is not None else "unknown"

        candidate_id = await self._repository.get_candidate_id_from_analysis(analysis.id)
        if candidate_id is None:
            raise RuntimeError("Candidate not found for analysis when ensuring profile analysis")

        extracted = result.extracted_data or {}
        extracted_candidate = extracted.get("candidate") if isinstance(extracted, dict) else {}
        if not isinstance(extracted_candidate, dict):
            extracted_candidate = {}

        skills = _skill_names_from_extracted_data(extracted)
        if not skills:
            skills = _unique_skill_names([
                str(skill)
                for skill in (result.keywords or [])
                if str(skill).strip()
            ])

        profile = CandidateProfileAnalysisModel(
            candidate_id=candidate_id,
            resume_version_id=analysis.resume_version_id,
            provider=provider,
            model_id=model_id,
            prompt_version=prompt_version,
            professional_area=(
                extracted_candidate.get("professional_area")
                or extracted_candidate.get("area")
                or (extracted.get("professional_area") if isinstance(extracted, dict) else None)
            ),
            seniority_level=result.seniority_level,
            education_level=result.highest_education_level,
            experience_years=result.total_experience_years,
            skills_json=skills,
            summary=result.candidate_summary,
            strengths_json=list(result.strengths or []),
            weaknesses_json=list(result.weaknesses or []),
            raw_response_json={"analysis_result_fields": extracted},
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
        )
        return await self._repository.save_candidate_profile_analysis(profile)

    async def _ensure_job_profile_analysis(
        self,
        job: object,
        *,
        force_refresh: bool = False,
    ) -> JobProfileAnalysisModel:
        job_skills = await self._repository.list_active_job_skill_rows(job.id)
        linked_skills = [job_skill_from_row(row) for row in job_skills]
        signature_hash = build_job_profile_hash(
            title=job.title,
            description=job.description,
            requirements=job.requirements,
            seniority_level=job.seniority_level,
            minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
            minimum_education_level=job.minimum_education_level,
            job_area=job.job_area,
            responsibilities=job.responsibilities,
            experience_context=job.experience_context,
            behavioral_requirements=tuple(job.behavioral_requirements or ()),
            priority=job.priority,
            linked_skills=tuple(linked_skills),
        )

        active_model = await self._repository.find_preferred_ai_model()
        provider = active_model.provider if active_model is not None else "deterministic"
        model_id = active_model.model_id if active_model is not None else "deterministic"
        prompt_version = "job_profiler_v1"

        cached = await self._repository.find_job_profile_analysis_by_signature(
            job_id=job.id,
            provider=provider,
            model_id=model_id,
            prompt_version=prompt_version,
            job_signature_hash=signature_hash,
        )
        if (
            cached is not None
            and not force_refresh
            and not _job_profile_analysis_is_incomplete(cached)
        ):
            job.job_profile_hash = signature_hash
            job.job_profile_json = dict(cached.raw_response_json)
            await _safe_session_flush(getattr(self._repository, "session", None))
            return cached

        cached_any = cached
        if cached_any is None:
            cached_any = await self._repository.find_any_job_profile_analysis_by_signature(
                job_id=job.id,
                provider=provider,
                model_id=model_id,
                prompt_version=prompt_version,
                job_signature_hash=signature_hash,
            )

        ai_service = None
        if active_model is not None:
            try:
                ai_service = AIServiceFactory.create(active_model.provider, active_model.model_id)
            except UnsupportedAIProviderError:
                ai_service = None

        profile = await JobProfilerService(ai_service=ai_service).generate_profile(
            job.description or "",
            title=job.title,
            requirements=job.requirements,
            seniority_level=job.seniority_level,
            minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
            minimum_education_level=job.minimum_education_level,
            job_area=job.job_area,
            responsibilities=job.responsibilities,
            experience_context=job.experience_context,
            behavioral_requirements=list(job.behavioral_requirements or []),
            priority=job.priority,
            linked_skills=linked_skills,
        )

        job.job_profile_json = profile.to_dict()
        job.job_profile_hash = signature_hash

        if cached_any is not None:
            was_active = bool(cached_any.is_active)
            cached_any.job_area = profile.area
            cached_any.seniority_required = profile.target_level
            cached_any.education_required = job.minimum_education_level
            cached_any.experience_required = job.minimum_years_experience
            cached_any.responsibilities_json = list(profile.responsibilities)
            cached_any.raw_response_json = profile.to_dict()
            cached_any.is_active = True
            cached_any.superseded_at = None
            if was_active:
                await _safe_session_flush(getattr(self._repository, "session", None))
                return cached_any
            return await self._repository.save_job_profile_analysis(cached_any)

        record = JobProfileAnalysisModel(
            job_id=job.id,
            provider=provider,
            model_id=model_id,
            prompt_version=prompt_version,
            job_signature_hash=signature_hash,
            job_area=profile.area,
            seniority_required=profile.target_level,
            education_required=job.minimum_education_level,
            experience_required=job.minimum_years_experience,
            responsibilities_json=list(profile.responsibilities),
            raw_response_json=profile.to_dict(),
            input_tokens=None,
            output_tokens=None,
            is_active=True,
            superseded_at=None,
        )
        return await self._repository.save_job_profile_analysis(record)

    async def _match_details_to_job(
        self,
        details: AnalysisResultDetails,
        job_id: UUID,
        score_model_version: ScoreModelVersionModel | None = None,
        *,
        force_recompute: bool = False,
    ) -> AnalysisMatchResponse:
        analysis_id = details.analysis.id
        result = details.result

        job = await self._repository.find_active_job(job_id)
        if job is None:
            raise JobNotFoundError
        try:
            candidate_profile_analysis = await self._ensure_candidate_profile_analysis(
                analysis=details.analysis,
                result=result,
            )
            job_profile_analysis = await self._ensure_job_profile_analysis(
                job,
                force_refresh=force_recompute,
            )
        except Exception:
            logger.exception(
                "profile_analysis.ensure_failed",
                extra={
                    "analysis_id": str(analysis_id),
                    "job_id": str(job_id),
                },
            )
            raise

        persisted_job_skills = await self._repository.list_active_job_skill_rows(job_id)
        job_skills = persisted_job_skills
        extracted: dict = result.extracted_data or {}
        resume_version = await self._repository.find_resume_version(details.analysis.resume_version_id)
        resume_text = (
            str(resume_version.extracted_text)
            if resume_version is not None and isinstance(resume_version.extracted_text, str)
            else None
        )
        candidate_skill_context = _build_candidate_skill_context(extracted)
        candidate_skill_names: set[str] = {
            normalize_skill_text(skill_name)
            for skill_name in _skill_names_from_extracted_data(extracted)
            if normalize_skill_text(skill_name)
        }
        for skill_name in _extract_resume_text_skill_names(resume_text, job_skills):
            normalized = normalize_skill_text(skill_name)
            if not normalized:
                continue
            candidate_skill_names.add(normalized)
            candidate_skill_context.setdefault(
                normalized,
                {
                    "confidence": "medium",
                    "has_context": True,
                    "source": "resume_text_fallback",
                },
            )
        if candidate_skill_names:
            all_candidate_skills = candidate_skill_names
        else:
            all_candidate_skills = {
                normalize_skill_text(kw)
                for kw in (result.keywords or [])
                if kw and normalize_skill_text(kw)
            }
            candidate_skill_context = {
                skill_name: {
                    "confidence": "low",
                    "has_context": False,
                    "source": "keyword_fallback",
                }
                for skill_name in all_candidate_skills
            }

        priority_skills = [
            row for row in job_skills if is_priority_skill(row.JobRequiredSkillModel.priority_level)
        ]
        complementary_skills = [
            row for row in job_skills if is_complementary_skill(row.JobRequiredSkillModel.priority_level)
        ]
        eliminatory_skills = [
            row for row in job_skills if is_eliminatory_skill(row.JobRequiredSkillModel.priority_level)
        ]

        # Compute skill scores using equivalence service
        skill_scores = _compute_skill_scores(
            job_skills,
            all_candidate_skills,
            candidate_skill_context=candidate_skill_context,
            weaken_uncontextualized=True,
        )
        priority_matched = skill_scores["priority_matched"]
        complementary_matched = skill_scores["complementary_matched"]
        eliminatory_matched = skill_scores["eliminatory_matched"]
        matched_skill_names = skill_scores["matched_skill_names"]
        missing_skill_names = skill_scores["missing_skill_names"]
        partial_matches = skill_scores["partial_matches"]
        weak_evidence_priority_skills = skill_scores["weak_evidence_priority_skills"]

        total_priority = len(priority_skills)
        total_complementary = len(complementary_skills)
        total_eliminatory = len(eliminatory_skills)

        adaptive_explanation = None
        adaptive_strengths: list[str] = []
        adaptive_gaps: list[str] = []
        adaptive_risk_points: list[str] = []
        adaptive_behavioral_indicators: list[str] = []
        adaptive_score_breakdown: dict[str, object] = {}
        engine_used = "canonical"

        candidate_years = (
            Decimal(str(result.total_experience_years))
            if result.total_experience_years is not None
            else _extract_resume_text_experience_years(resume_text)
        )
        required_years = (
            Decimal(str(job.minimum_years_experience))
            if job.minimum_years_experience is not None
            else None
        )

        priority_score = skill_scores["priority_score_weighted"]
        complementary_score = skill_scores["complementary_score_weighted"]
        complementary_score_raw = skill_scores["complementary_score_raw_weighted"]
        priority_strong_coverage = skill_scores["priority_strong_coverage"]
        experience_score = _calculate_experience_score(candidate_years, required_years)
        weights = _canonical_component_weights(
            total_priority=total_priority,
            total_complementary=total_complementary,
        )
        w_priority = weights["priority"]
        w_complementary = weights["complementary"]
        w_exp = weights["experience"]
        w_sen = weights["seniority"]

        seniority_score = _calculate_seniority_score(
            result.seniority_level,
            job.seniority_level,
        )

        priority_component_impact = (priority_score * w_priority).quantize(Decimal("0.01"))
        complementary_component_impact = (complementary_score * w_complementary).quantize(Decimal("0.01"))
        experience_component_impact = (experience_score * w_exp).quantize(Decimal("0.01"))
        seniority_component_impact = (seniority_score * w_sen).quantize(Decimal("0.01"))

        profile_completeness = _extract_profile_completeness(result)
        education_result = _validate_education(
            result.highest_education_level,
            job.minimum_education_level,
            profile_completeness,
        )
        experience_result = _validate_experience(
            candidate_years,
            required_years,
        )

        failed_rule: str | None = None
        failed_dimension: str | None = None
        eligibility_status = "PASS"

        validation_status = "pass"
        missing_evidence = []
        validation_reasons = []
        reason: str | None = None
        weak_evidence_detected = bool(weak_evidence_priority_skills)
        if weak_evidence_detected:
            weak_skills = ", ".join(weak_evidence_priority_skills[:4])
            validation_reasons.append(
                f"Evidência contextual fraca para skills essenciais: {weak_skills}"
            )

        if education_result.status == "fail":
            validation_status = "fail"
            validation_reasons.append(education_result.reason)
        elif education_result.status == "unknown":
            if validation_status != "fail":
                validation_status = "unknown"
            missing_evidence.append("education")
            validation_reasons.append(education_result.reason)

        if experience_result.status == "fail":
            validation_status = "fail"
            validation_reasons.append(experience_result.reason)
        elif experience_result.status == "unknown":
            if validation_status != "fail":
                validation_status = "unknown"
            missing_evidence.append("experience")
            validation_reasons.append(experience_result.reason)

        has_domain_evidence = priority_matched > 0 or complementary_matched > 0 or bool(partial_matches)
        missing_eliminatory_skills = list(skill_scores["missing_eliminatory_skill_names"])
        if education_result.status == "fail":
            failed_rule = "minimum_education"
            failed_dimension = "education"
            eligibility_status = "FAIL"
            recommendation = "not_match"
            reason = " | ".join(validation_reasons)
        elif experience_result.status == "fail":
            failed_rule = "minimum_experience"
            failed_dimension = "experience"
            eligibility_status = "FAIL"
            recommendation = "not_match"
            reason = " | ".join(validation_reasons)
        elif missing_eliminatory_skills:
            failed_rule = "missing_eliminatory_skills"
            failed_dimension = "skills"
            eligibility_status = "FAIL"
            recommendation = "not_match"
            reason = (
                "Não atende critérios eliminatórios de skill: "
                + ", ".join(missing_eliminatory_skills[:4])
            )
            validation_reasons.append(reason)
        else:
            if total_priority > 0 and priority_matched == 0 and has_domain_evidence:
                validation_reasons.append(
                    f"Sem skill essencial atendida com evidência forte ({priority_matched}/{total_priority})."
                )

            if weak_evidence_detected and validation_status != "fail":
                eligibility_status = "REVIEW"
                recommendation = "review_manually"
                if not reason:
                    reason = " | ".join(validation_reasons)

            if validation_status == "unknown":
                eligibility_status = "REVIEW"
                recommendation = "review_manually"
                reason = (
                    f"Dados insuficientes: {', '.join(missing_evidence)}. "
                    f"{' | '.join(validation_reasons)}"
                )
            elif eligibility_status == "REVIEW":
                recommendation = "review_manually"
                reason = " | ".join(validation_reasons)

            if eligibility_status == "PASS":
                if priority_strong_coverage >= _PRIORITY_STRONG_COVERAGE_STRONG_MATCH:
                    recommendation = "strong_match"
                elif priority_strong_coverage >= _PRIORITY_STRONG_COVERAGE_GOOD_MATCH:
                    recommendation = "good_match"
                elif priority_matched > 0 or complementary_matched > 0 or partial_matches:
                    recommendation = "potential"
                else:
                    recommendation = "not_recommended"
                reason = None

        if reason:
            summary = reason
        else:
            base_summary = (
                f"{priority_matched}/{total_priority} skills essenciais, "
                f"{complementary_matched}/{total_complementary} diferenciais e "
                f"{eliminatory_matched}/{total_eliminatory} eliminatórias atendidas."
            )
            if partial_matches and not adaptive_explanation:
                partial_txt = ", ".join(f"{pm['candidate']}→{pm['required']}" for pm in partial_matches[:3])
                summary = f"{base_summary} Correspondências parciais: {partial_txt}."
            else:
                summary = adaptive_explanation or base_summary
        await PipelineService(
            SQLAlchemyPipelineRepository(self._repository._session)
        ).register_match_entry(
            analysis_id=analysis_id,
            job_id=job_id,
        )

        persisted_match_context = await self._match_store.persist_candidate_job_match(
            analysis_id=analysis_id,
            job_id=job_id,
            job=job,
            candidate_profile_analysis=candidate_profile_analysis,
            job_profile_analysis=job_profile_analysis,
            result=result,
            recommendation=recommendation,
            matched_skill_names=matched_skill_names,
            missing_skill_names=missing_skill_names,
            skill_scores=skill_scores,
            partial_matches=partial_matches,
            weak_evidence_priority_skills=weak_evidence_priority_skills,
            validation_status=validation_status,
            validation_reasons=validation_reasons,
            failed_rule=failed_rule,
            failed_dimension=failed_dimension,
            eligibility_status=eligibility_status,
            candidate_years=candidate_years,
            required_years=required_years,
            priority_matched=priority_matched,
            total_priority=total_priority,
            complementary_matched=complementary_matched,
            total_complementary=total_complementary,
            eliminatory_matched=eliminatory_matched,
            total_eliminatory=total_eliminatory,
            priority_component_impact=priority_component_impact,
            complementary_component_impact=complementary_component_impact,
            experience_component_impact=experience_component_impact,
            seniority_component_impact=seniority_component_impact,
            has_domain_evidence=has_domain_evidence,
            summary=summary,
            score_version=_SCORE_VERSION_EQUIVALENCE,
        )
        candidate_id = persisted_match_context.candidate_id
        resume_version_id = persisted_match_context.resume_version_id
        adaptive_score_breakdown = dict(
            persisted_match_context.persisted_match.skill_evidence_breakdown or {}
        )

        ranking_refresh = await self._ranking_refresh_service.refresh_after_match(
            analysis_id=analysis_id,
            source_analysis_created_at=details.analysis.created_at,
            job_id=job_id,
            candidate_id=candidate_id,
            resume_version_id=resume_version_id,
            score_model_version=score_model_version,
            force_recompute=force_recompute,
        )
        ranking_refresh_status = ranking_refresh.ranking_refresh_status
        ranking_freshness_status = ranking_refresh.ranking_freshness_status
        ranking_refreshed_at = ranking_refresh.ranking_refreshed_at
        ranking_warning = ranking_refresh.ranking_warning
        public_job_fit_score = ranking_refresh.public_job_fit_score
        ranking_result = ranking_refresh.ranking_result

        if force_recompute:
            logger.info(
                "analysis.recomputed",
                extra={
                    "analysis_id": str(analysis_id),
                    "candidate_id": str(candidate_id),
                    "job_id": str(job_id),
                    "resume_version_id": str(resume_version_id),
                    "job_profile_analysis_id": str(job_profile_analysis.id),
                    "previous_score": (
                        ranking_result.get("previous_score")
                        if isinstance(ranking_result, dict)
                        else None
                    ),
                    "new_score": public_job_fit_score,
                    "ranking_refresh_status": ranking_refresh_status,
                    "ranking_freshness_status": ranking_freshness_status,
                    "forced": True,
                },
            )

        return AnalysisMatchResponse(
            analysis_id=analysis_id,
            job_id=job_id,
            job_fit_score=public_job_fit_score,
            match_freshness_status="fresh",
            recommendation=recommendation,
            priority_skills_matched=priority_matched,
            priority_skills_total=total_priority,
            complementary_skills_matched=complementary_matched,
            complementary_skills_total=total_complementary,
            seniority_score=float(seniority_score.quantize(Decimal("0.01"))),
            candidate_seniority=result.seniority_level,
            job_seniority=job.seniority_level,
            validation_status=validation_status,
            missing_evidence=missing_evidence,
            rejection_reasons=validation_reasons,
            engine_used=engine_used,
            score_breakdown=adaptive_score_breakdown,
            strengths=adaptive_strengths,
            gaps=adaptive_gaps,
            risk_points=adaptive_risk_points,
            explanation=adaptive_explanation,
            behavioral_indicators=adaptive_behavioral_indicators,
            ranking_refresh_status=ranking_refresh_status,
            ranking_freshness_status=ranking_freshness_status,
            ranking_refreshed_at=ranking_refreshed_at,
            ranking_warning=ranking_warning,
        )
