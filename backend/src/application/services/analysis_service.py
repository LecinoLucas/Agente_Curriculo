import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid5

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

# Penalidade de sobre-qualificação em senioridade só é aplicada quando
# a diferença de níveis é >= este limiar (configurável).
_SENIORITY_PENALTY_THRESHOLD = 2
_CANONICAL_MANDATORY_WEIGHT = Decimal("0.45")
_CANONICAL_OPTIONAL_WEIGHT = Decimal("0.15")
_CANONICAL_EXPERIENCE_WEIGHT = Decimal("0.20")
_CANONICAL_SENIORITY_WEIGHT = Decimal("0.10")
_CANONICAL_AI_WEIGHT = Decimal("0.00")
_MANDATORY_THRESHOLD = Decimal("60")
_MANDATORY_SOFT_PENALTY_START = Decimal("80")
_MANDATORY_SOFT_PENALTY_MAX = Decimal("12")
_NO_REQUIREMENTS_SCORE_CAP = Decimal("44")
_STRONG_MATCH_THRESHOLD = Decimal("85")
_GOOD_MATCH_THRESHOLD = Decimal("70")
_POTENTIAL_THRESHOLD = Decimal("55")
_MANDATORY_STRONG_COVERAGE_STRONG_MATCH = Decimal("80")
_MANDATORY_STRONG_COVERAGE_GOOD_MATCH = Decimal("60")
_MANDATORY_STRONG_COVERAGE_CAP_THRESHOLD = Decimal("50")
_MANDATORY_STRONG_COVERAGE_CAP_SCORE = Decimal("54")
_MINIMUM_DOMAIN_FIT_CAP_SCORE = Decimal("49")
_LOW_PROFILE_COMPLETENESS_THRESHOLD = Decimal("0.60")
_SCORE_VERSION_EQUIVALENCE = "v3.1-equivalence"

logger = logging.getLogger(__name__)

from src.domain.entities.user import User
from src.domain.entities.user import UserRole
from src.application.services.audit_service import AuditService
from src.application.services.eligibility_engine_service import EligibilityEngineService
from src.application.services.job_profiler_service import (
    JobProfilerService,
    build_job_profile_hash,
    job_skill_from_row,
)
from src.application.services.skill_requirements_service import validate_skill_requirements
from src.application.services.skill_normalizer_service import (
    candidate_satisfies_job_requirement,
)
from src.application.services.skill_equivalence_service import SkillEquivalenceService
from src.application.services.skill_text_normalizer import (
    contains_whole_phrase,
    normalize_skill_text,
)
from src.application.services.strict_payload import require_key
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_skill_repository import (
    SQLAlchemySkillRepository,
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
from src.observability.domain_events import DomainEvent, DomainEventType, publish_domain_event


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


def _skill_matches_exact_and_aliases_only(
    candidate_skill_name: str,
    job_skill_name: str,
    job_skill_aliases: list[str] | None = None,
) -> bool:
    """Check if candidate skill exactly matches job skill or is in aliases.

    F7.1 restriction: Only exact/alias matches.
    This allows SkillEquivalenceService to handle all scoring logic.

    Returns True only for:
    1. Exact string match (normalized)
    2. Alias match (from job_skill_aliases list)

    Does NOT use:
    - Legacy _DIRECTIONAL_EQUIVALENCES
    - Token containment
    - Levenshtein distance
    """
    from src.application.services.skill_text_normalizer import normalize_skill_text

    candidate_normalized = normalize_skill_text(candidate_skill_name)
    job_normalized = normalize_skill_text(job_skill_name)

    # 1. Exact match
    if candidate_normalized == job_normalized:
        return True

    # 2. Alias match
    if job_skill_aliases:
        aliases_normalized = {
            normalize_skill_text(alias)
            for alias in job_skill_aliases
            if alias and normalize_skill_text(alias)
        }
        if candidate_normalized in aliases_normalized:
            return True

    return False


def _compute_skill_scores(
    job_skill_rows: list,
    all_candidate_skills: set[str],
) -> dict:
    """Compute weighted skill scores using equivalence service.

    F7.1 fix: Uses SkillEquivalenceService for ALL equivalence logic.
    Only uses exact/alias matching.

    Returns dict with:
    - mandatory_score_weighted: Decimal (sum of scores / total * 100)
    - optional_score_weighted: Decimal
    - mandatory_strong_coverage: Decimal (% of skills with score >= 0.8)
    - mandatory_matched: int (count with score >= 0.8)
    - optional_matched: int
    - matched_skill_names: list[str] (skills with score >= 0.8)
    - missing_skill_names: list[str] (skills with score == 0)
    - partial_matches: list[dict] (0 < score < 0.8)
    - has_any_strong_mandatory: bool (at least one exact/strong match)
    """
    equivalence_service = SkillEquivalenceService()
    mandatory_skills = [row for row in job_skill_rows if row.JobRequiredSkillModel.is_mandatory]
    optional_skills = [row for row in job_skill_rows if not row.JobRequiredSkillModel.is_mandatory]

    mandatory_scores: list[Decimal] = []
    optional_scores: list[Decimal] = []
    partial_matches: list[dict] = []
    matched_skill_names: list[str] = []
    missing_skill_names: list[str] = []
    has_any_strong_mandatory = False

    # Process mandatory skills
    for job_skill_row in mandatory_skills:
        job_skill_name = job_skill_row.skill_name
        job_skill_aliases = job_skill_row.skill_aliases or []
        best_score = Decimal("0.0")
        best_candidate = None
        best_evidence = None

        for candidate_skill in all_candidate_skills:
            # F7.1: Only check exact/alias.
            if _skill_matches_exact_and_aliases_only(candidate_skill, job_skill_name, job_skill_aliases):
                best_score = Decimal("1.0")
                best_candidate = candidate_skill
                best_evidence = None
                break

            # Use SkillEquivalenceService for ALL equivalence scoring
            evidence = equivalence_service.match_skill(candidate_skill, job_skill_name)
            if evidence.matched and evidence.score > float(best_score):
                best_score = Decimal(str(evidence.score))
                best_candidate = candidate_skill
                best_evidence = evidence

        mandatory_scores.append(best_score)

        # Track matched skills (score >= 0.8)
        if best_score >= Decimal("0.8"):
            matched_skill_names.append(job_skill_name)
            has_any_strong_mandatory = True

        # Track missing skills (score == 0)
        if best_score == Decimal("0.0"):
            missing_skill_names.append(job_skill_name)

        # Track partial matches (0 < score < 0.8)
        if float(best_score) > 0 and float(best_score) < 0.8:
            partial_matches.append({
                "required": job_skill_name,
                "candidate": best_candidate or "",
                "score": float(best_score),
                "reason": best_evidence.reason if best_evidence else f'"{best_candidate}" parcialmente atende "{job_skill_name}".',
                "source": best_evidence.source if best_evidence else "none",
            })

    # Process optional skills
    for job_skill_row in optional_skills:
        job_skill_name = job_skill_row.skill_name
        job_skill_aliases = job_skill_row.skill_aliases or []
        best_score = Decimal("0.0")
        best_candidate = None

        for candidate_skill in all_candidate_skills:
            # F7.1: Only check exact/alias.
            if _skill_matches_exact_and_aliases_only(candidate_skill, job_skill_name, job_skill_aliases):
                best_score = Decimal("1.0")
                best_candidate = candidate_skill
                break

            # Use SkillEquivalenceService for ALL equivalence scoring
            evidence = equivalence_service.match_skill(candidate_skill, job_skill_name)
            if evidence.matched and evidence.score > float(best_score):
                best_score = Decimal(str(evidence.score))
                best_candidate = candidate_skill

        optional_scores.append(best_score)

        # Track matched optional skills (score >= 0.8)
        if best_score >= Decimal("0.8"):
            matched_skill_names.append(job_skill_name)

    # Compute weighted scores
    mandatory_score_weighted = (
        sum(mandatory_scores) / Decimal(len(mandatory_scores)) * Decimal("100")
        if mandatory_scores
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    optional_score_weighted = (
        sum(optional_scores) / Decimal(len(optional_scores)) * Decimal("100")
        if optional_scores
        else Decimal("0")
    ).quantize(Decimal("0.01"))

    # Compute strong coverage (% with score >= 0.8)
    mandatory_strong_coverage = (
        Decimal(sum(1 for s in mandatory_scores if s >= Decimal("0.8"))) / Decimal(len(mandatory_scores)) * Decimal("100")
        if mandatory_scores
        else Decimal("100")
    ).quantize(Decimal("0.01"))

    return {
        "mandatory_score_weighted": mandatory_score_weighted,
        "optional_score_weighted": optional_score_weighted,
        "mandatory_strong_coverage": mandatory_strong_coverage,
        "mandatory_matched": sum(1 for s in mandatory_scores if s >= Decimal("0.8")),
        "optional_matched": sum(1 for s in optional_scores if s >= Decimal("0.8")),
        "matched_skill_names": matched_skill_names,
        "missing_skill_names": missing_skill_names,
        "partial_matches": partial_matches,
        "has_any_strong_mandatory": has_any_strong_mandatory,
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


def _evaluate_deal_breaker(
    deal_breaker: dict,
    candidate_result,
) -> tuple[bool, str | None]:
    """Evaluate if candidate triggers a deal-breaker criterion.

    Deal-breaker rejects candidates that MATCH a specific criteria.

    Structure: {
        "field": "seniority_level",
        "operator": "equals",  # equals | not_equals | contains | in
        "value": "intern",  # single value or list for 'in' operator
        "reason": "Vaga não aceita nível junior ou menos",
        "is_active": true
    }

    Operators:
    - equals: reject if candidate_value == value (case-insensitive for strings)
    - not_equals: reject if candidate_value != value (case-insensitive for strings)
    - contains: reject if value is in candidate_value (for lists/strings)
    - in: reject if candidate_value is in values[] (for lists)

    Returns:
        (breaker_hit, reason) - True if deal-breaker is triggered, with reason
    """
    if not deal_breaker.get("is_active", True):
        return False, None

    field = deal_breaker.get("field")
    operator = deal_breaker.get("operator", "equals")  # Default to equals for backward compat
    value = deal_breaker.get("value")
    reason = deal_breaker.get("reason", f"Não atende requisito: {field}")

    if not field or value is None:
        return False, None

    # Prefer explicit persisted fields, but fall back to extracted_data when
    # the matching phase is running from an AnalysisResultModel loaded from DB.
    candidate_value = getattr(candidate_result, field, None)
    if candidate_value is None:
        extracted = getattr(candidate_result, "extracted_data", None) or {}
        candidate_section = extracted.get("candidate") if isinstance(extracted, dict) else None
        if isinstance(candidate_section, dict) and field in candidate_section:
            candidate_value = candidate_section.get(field)
        elif isinstance(extracted, dict):
            candidate_value = extracted.get(field)

    # No explicit data = no deal-breaker hit
    if candidate_value is None:
        return False, None

    # Apply operator logic
    if operator == "equals":
        # Reject if candidate equals the prohibited value
        if isinstance(candidate_value, str) and isinstance(value, str):
            if candidate_value.lower() == value.lower():
                return True, reason
        elif candidate_value == value:
            return True, reason

    elif operator == "not_equals":
        # Reject if candidate does NOT equal the required value
        if isinstance(candidate_value, str) and isinstance(value, str):
            if candidate_value.lower() != value.lower():
                return True, f"{reason} (condição proibida: {candidate_value})"
        elif candidate_value != value:
            return True, f"{reason} (condição proibida: {candidate_value})"

    elif operator == "contains":
        # Reject if value appears in candidate_value (list or string)
        if isinstance(candidate_value, list):
            # Normalize strings in list for comparison
            normalized_list = [
                str(v).lower() if isinstance(v, str) else v
                for v in candidate_value
            ]
            check_value = value.lower() if isinstance(value, str) else value
            if check_value in normalized_list:
                return True, reason
        elif isinstance(candidate_value, str):
            if isinstance(value, str) and value.lower() in candidate_value.lower():
                return True, reason

    elif operator == "in":
        # Reject if candidate_value is in the values list
        if not isinstance(value, list):
            return False, None

        if isinstance(candidate_value, str):
            # Case-insensitive comparison for strings
            normalized_values = [
                v.lower() if isinstance(v, str) else v for v in value
            ]
            if candidate_value.lower() in normalized_values:
                return True, reason
        else:
            # Direct comparison for non-strings
            if candidate_value in value:
                return True, reason

    return False, None


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
    total_mandatory: int,
    total_optional: int,
) -> dict[str, Decimal]:
    w_mand = _CANONICAL_MANDATORY_WEIGHT
    w_opt = _CANONICAL_OPTIONAL_WEIGHT
    w_exp = _CANONICAL_EXPERIENCE_WEIGHT
    w_sen = _CANONICAL_SENIORITY_WEIGHT

    if total_mandatory == 0 and total_optional > 0:
        w_opt += w_mand
        w_mand = Decimal("0")
    elif total_mandatory == 0 and total_optional == 0:
        w_exp += w_mand + (w_opt / 2)
        w_sen += w_opt / 2
        w_mand = Decimal("0")
        w_opt = Decimal("0")
    elif total_optional == 0:
        w_mand += w_opt
        w_opt = Decimal("0")

    total = w_mand + w_opt + w_exp + w_sen
    if total <= 0:
        return {
            "mandatory": Decimal("0"),
            "optional": Decimal("0"),
            "experience": Decimal("0.67"),
            "seniority": Decimal("0.33"),
        }

    return {
        "mandatory": w_mand / total,
        "optional": w_opt / total,
        "experience": w_exp / total,
        "seniority": w_sen / total,
    }


def _mandatory_soft_penalty(mandatory_percentage: Decimal) -> Decimal:
    """Progressively penalize borderline mandatory coverage from 60% to 80%."""
    if mandatory_percentage >= _MANDATORY_SOFT_PENALTY_START:
        return Decimal("0")

    coverage_window = _MANDATORY_SOFT_PENALTY_START - _MANDATORY_THRESHOLD
    shortfall = _MANDATORY_SOFT_PENALTY_START - mandatory_percentage
    penalty_ratio = shortfall / coverage_window
    return (penalty_ratio * _MANDATORY_SOFT_PENALTY_MAX).quantize(Decimal("0.01"))


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


# ── Skill Matching: Exact + Aliases + Levenshtein (for typos only) ─────────────


def _levenshtein_distance(s1: str, s2: str) -> int:
    """Calculate Levenshtein distance between two strings.

    Used only for detecting typos in skill names.
    Only accepts distance <= 2 and length >= 4 to avoid false positives.
    """
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def _skill_matches(
    candidate_skill_name: str,
    job_skill_name: str,
    job_skill_aliases: list[str] | None = None,
) -> bool:
    """
    Check if candidate skill matches job skill using multi-strategy approach:

    1. Exact match after normalization (case-insensitive, markdown stripped)
    2. Alias lookup from SkillModel.aliases
    3. Token / phrase containment for real-world text variants
    4. Levenshtein distance <= 2 (only for skill names >= 4 chars)

    Args:
        candidate_skill_name: Skill from candidate resume (e.g., "javascript")
        job_skill_name: Skill from job requirement (e.g., "Java")
        job_skill_aliases: List of aliases from SkillModel (e.g., ["JS", "Node"])

    Returns:
        True if skills match, False otherwise

    Examples:
        _skill_matches("Java", "Java")              → True (exact)
        _skill_matches("javascript", "Java")        → False (different)
        _skill_matches("JS", "JavaScript", ["JS"]) → True (alias)
        _skill_matches("Pythn", "Python")           → True (typo, distance=1)
        _skill_matches("Jv", "Java")                → False (too short for Levenshtein)
    """
    candidate_normalized = normalize_skill_text(candidate_skill_name)
    job_normalized = normalize_skill_text(job_skill_name)
    if candidate_normalized == "" and job_normalized == "":
        return True
    if not candidate_normalized or not job_normalized:
        return False

    if candidate_satisfies_job_requirement(
        candidate_skill_name,
        job_skill_name,
        job_skill_aliases,
    ):
        return True

    if candidate_normalized == job_normalized:
        return True

    aliases = [
        normalize_skill_text(alias)
        for alias in (job_skill_aliases or [])
        if normalize_skill_text(alias)
    ]
    if candidate_normalized in aliases:
        return True

    shorter, longer = sorted((candidate_normalized, job_normalized), key=len)
    if contains_whole_phrase(shorter, longer):
        return True
    if any(
        contains_whole_phrase(*sorted((candidate_normalized, alias), key=len))
        for alias in aliases
    ):
        return True

    comparable_targets = [job_normalized, *aliases]
    if len(candidate_normalized) >= 4:
        for target in comparable_targets:
            if len(target) >= 4 and _levenshtein_distance(candidate_normalized, target) <= 2:
                return True

    return False


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

    def _get_eligibility_engine_service(self) -> EligibilityEngineService:
        if self._eligibility_engine_service is not None:
            return self._eligibility_engine_service
        skill_repository = SQLAlchemySkillRepository(self._repository.session)
        self._eligibility_engine_service = EligibilityEngineService(repository=skill_repository)
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
    ) -> AnalysisMatchResponse:
        analysis = await self._repository.find_completed(analysis_id)
        if analysis is None:
            raise AnalysisNotCompletedError

        result = await self._repository.find_result(analysis_id)
        if result is None:
            raise AnalysisResultNotFoundError

        details = AnalysisResultDetails(analysis=analysis, result=result)
        return await self._match_details_to_job(
            details, job_id, score_model_version=score_model_version
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
            await _safe_session_flush(getattr(self._repository, "session", None))
            return cached

        ai_prompt_row = await self._repository.session.execute(
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

    async def _ensure_job_profile_analysis(self, job: object) -> JobProfileAnalysisModel:
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
        if cached is not None and not _job_profile_analysis_is_incomplete(cached):
            job.job_profile_hash = signature_hash
            job.job_profile_json = dict(cached.raw_response_json)
            await _safe_session_flush(getattr(self._repository, "session", None))
            return cached

        ai_service = None
        if active_model is not None:
            try:
                ai_service = AIServiceFactory.create(active_model.provider, active_model.model_id)
            except UnsupportedAIProviderError:
                ai_service = None

        profiler_ai = ai_service if cached is None else None
        profile = await JobProfilerService(ai_service=profiler_ai).generate_profile(
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

        if cached is not None:
            cached.job_area = profile.area
            cached.seniority_required = profile.target_level
            cached.education_required = job.minimum_education_level
            cached.experience_required = job.minimum_years_experience
            cached.responsibilities_json = list(profile.responsibilities)
            cached.raw_response_json = profile.to_dict()
            cached.is_active = True
            cached.superseded_at = None
            await _safe_session_flush(getattr(self._repository, "session", None))
            return cached

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
            job_profile_analysis = await self._ensure_job_profile_analysis(job)
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
        has_structured_requirements = _job_has_structured_requirements(
            total_skills=len(persisted_job_skills),
            seniority_level=job.seniority_level,
            minimum_years_experience=job.minimum_years_experience,
            minimum_education_level=job.minimum_education_level,
            deal_breakers=job.deal_breakers,
        )
        job_skills = persisted_job_skills
        extracted: dict = result.extracted_data or {}
        candidate_skill_names: set[str] = {
            normalize_skill_text(skill_name)
            for skill_name in _skill_names_from_extracted_data(extracted)
            if normalize_skill_text(skill_name)
        }
        if candidate_skill_names:
            all_candidate_skills = candidate_skill_names
        else:
            all_candidate_skills = {
                normalize_skill_text(kw)
                for kw in (result.keywords or [])
                if kw and normalize_skill_text(kw)
            }

        # Separate mandatory and optional skills for computing totals
        mandatory_skills = [row for row in job_skills if row.JobRequiredSkillModel.is_mandatory]
        optional_skills = [row for row in job_skills if not row.JobRequiredSkillModel.is_mandatory]

        # Compute skill scores using equivalence service
        skill_scores = _compute_skill_scores(job_skills, all_candidate_skills)
        mandatory_matched = skill_scores["mandatory_matched"]
        optional_matched = skill_scores["optional_matched"]
        matched_skill_names = skill_scores["matched_skill_names"]
        missing_skill_names = skill_scores["missing_skill_names"]
        partial_matches = skill_scores["partial_matches"]

        def _is_bonus(cand_skill: str) -> bool:
            """Check if candidate skill is not a job requirement (bonus skill)."""
            for job_row in job_skills:
                if _skill_matches(cand_skill, job_row.skill_name, job_row.skill_aliases or []):
                    return False
            return True

        bonus_skill_names = sorted(s for s in all_candidate_skills if s and _is_bonus(s))

        total_mandatory = len(mandatory_skills)
        total_optional = len(optional_skills)

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
            else None
        )
        required_years = (
            Decimal(str(job.minimum_years_experience))
            if job.minimum_years_experience is not None
            else None
        )

        # Pure-Decimal scores using weighted equivalence matching
        mandatory_score = skill_scores["mandatory_score_weighted"]
        optional_score = skill_scores["optional_score_weighted"]
        mandatory_strong_coverage = skill_scores["mandatory_strong_coverage"]
        mandatory_percentage = mandatory_score
        experience_score = _calculate_experience_score(candidate_years, required_years)
        weights_source = "canonical_v3_deterministic"
        weights = _canonical_component_weights(
            total_mandatory=total_mandatory,
            total_optional=total_optional,
        )
        w_mand = weights["mandatory"]
        w_opt = weights["optional"]
        w_exp = weights["experience"]
        w_sen = weights["seniority"]

        seniority_score = _calculate_seniority_score(
            result.seniority_level,
            job.seniority_level,
        )

        overall = min(
            mandatory_score * w_mand
            + optional_score * w_opt
            + experience_score * w_exp
            + seniority_score * w_sen,
            Decimal("100"),
        ).quantize(Decimal("0.01"))

        raw_weighted_score = overall

        if total_mandatory > 0 and mandatory_percentage >= _MANDATORY_THRESHOLD:
            overall = max(
                Decimal("0"),
                overall - _mandatory_soft_penalty(mandatory_percentage),
            ).quantize(Decimal("0.01"))

        # Cap score if strong coverage is too low (< 50%)
        if total_mandatory > 0 and mandatory_strong_coverage < _MANDATORY_STRONG_COVERAGE_CAP_THRESHOLD:
            overall = min(overall, _MANDATORY_STRONG_COVERAGE_CAP_SCORE).quantize(Decimal("0.01"))

        # Cap for all-partial mandatory skills (no strong/exact matches)
        all_mandatory_partial = (
            total_mandatory > 0
            and skill_scores["mandatory_matched"] == 0
            and not skill_scores.get("has_any_strong_mandatory", False)
            and bool(partial_matches)
        )
        if all_mandatory_partial:
            overall = min(overall, Decimal("64")).quantize(Decimal("0.01"))

        if not has_structured_requirements:
            overall = min(overall, _NO_REQUIREMENTS_SCORE_CAP).quantize(Decimal("0.01"))

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

        final_score_before_cap = overall
        cap_applied = False
        cap_reason: str | None = None
        failed_rule: str | None = None
        failed_dimension: str | None = None
        eligibility_status = "PASS"
        deal_breaker_failed = False
        domain_fit_review = False
        domain_fit_cap_applied = False

        # Track validation status and missing evidence
        validation_status = "pass"  # Default: everything is ok
        missing_evidence = []  # Fields that returned UNKNOWN
        validation_reasons = []  # All validation failure/unknown reasons

        # Check education: if FAIL, mark as failed. If UNKNOWN, add to missing evidence.
        if education_result.status == "fail":
            validation_status = "fail"
            validation_reasons.append(education_result.reason)
            logger.info(
                f"[Objective Education Validation] {education_result.reason} FAIL."
            )
        elif education_result.status == "unknown":
            if validation_status != "fail":  # Only override if not already failed
                validation_status = "unknown"
            missing_evidence.append("education")
            validation_reasons.append(education_result.reason)
            logger.info(
                f"[Objective Education Validation] {education_result.reason} UNKNOWN."
            )

        # Check experience: if FAIL, mark as failed. If UNKNOWN, add to missing evidence.
        if experience_result.status == "fail":
            validation_status = "fail"
            validation_reasons.append(experience_result.reason)
            logger.info(
                f"[Objective Experience Validation] {experience_result.reason} FAIL."
            )
        elif experience_result.status == "unknown":
            if validation_status != "fail":  # Only override if not already failed
                validation_status = "unknown"
            missing_evidence.append("experience")
            validation_reasons.append(experience_result.reason)
            logger.info(
                f"[Objective Experience Validation] {experience_result.reason} UNKNOWN."
            )

        # ── DEAL-BREAKER EVALUATION ────────────────────────────────────────
        # Check if candidate matches any active deal-breaker criteria
        deal_breakers = job.deal_breakers or []
        for deal_breaker in deal_breakers:
            breaker_hit, breaker_reason = _evaluate_deal_breaker(deal_breaker, result)
            if breaker_hit:
                validation_status = "fail"  # Deal-breaker is a hard reject
                validation_reasons.append(breaker_reason)
                failed_rule = "explicit_deal_breaker"
                failed_dimension = "deal_breaker"
                deal_breaker_failed = True
                logger.info(
                    f"[Deal-Breaker] {breaker_reason} Candidate REJECTED."
                )

        # ── APPLY MANDATORY FILTER & OBJECTIVE VALIDATIONS ───────────────────
        # Decision logic:
        # 1. If FAIL: reject (score <= 39)
        # 2. If only UNKNOWN: don't reject, but mark for manual review + light penalty
        # 3. Otherwise: normal scoring

        has_domain_evidence = mandatory_matched > 0 or optional_matched > 0 or bool(partial_matches)

        if deal_breaker_failed:
            # Objective validation FAILED (candidate below minimum threshold)
            overall = min(overall, Decimal("39"))  # Cap score at 39 (below "potential")
            cap_applied = True
            cap_reason = "explicit_deal_breaker"
            eligibility_status = "FAIL"
            recommendation = "not_match"
            reason = " | ".join(validation_reasons)
            logger.info(
                f"[Objective Validation] Candidate REJECTED. "
                f"Reasons: {reason}. Score capped at 39."
            )
        elif education_result.status == "fail":
            overall = min(overall, Decimal("39"))
            cap_applied = True
            cap_reason = "minimum_education"
            failed_rule = "minimum_education"
            failed_dimension = "education"
            eligibility_status = "FAIL"
            recommendation = "not_match"
            reason = " | ".join(validation_reasons)
        elif experience_result.status == "fail":
            overall = min(overall, Decimal("39"))
            cap_applied = True
            cap_reason = "minimum_experience"
            failed_rule = "minimum_experience"
            failed_dimension = "experience"
            eligibility_status = "FAIL"
            recommendation = "not_match"
            reason = " | ".join(validation_reasons)
        else:
            if total_mandatory > 0 and mandatory_percentage < _MANDATORY_THRESHOLD:
                reason = (
                    f"Não atende integralmente habilidades obrigatórias "
                    f"({mandatory_matched}/{total_mandatory})"
                )
                validation_reasons.append(reason)
                failed_rule = "missing_required_skills"
                failed_dimension = "skills"
                eligibility_status = "REVIEW"
                if has_domain_evidence:
                    domain_fit_review = True
                    logger.info(
                        "[Domain Fit] Candidate has partial mandatory fit. "
                        "Flagged for review without hard cap."
                    )
                else:
                    domain_fit_review = True
                    domain_fit_cap_applied = True
                    cap_applied = True
                    cap_reason = "minimum_domain_fit"
                    failed_rule = "minimum_domain_fit"
                    overall = min(overall, _MINIMUM_DOMAIN_FIT_CAP_SCORE).quantize(Decimal("0.01"))
                    logger.info(
                        "[Domain Fit] Candidate lacks minimum domain fit. "
                        "Score capped for review."
                    )

            if validation_status == "unknown":
                eligibility_status = "REVIEW"
                recommendation = "review_manually"
                if not domain_fit_cap_applied:
                    penalty = Decimal("0.90")  # Apply 10% penalty for missing evidence
                    overall = (overall * penalty).quantize(Decimal("0.01"))
                reason = (
                    f"Dados insuficientes: {', '.join(missing_evidence)}. "
                    f"{' | '.join(validation_reasons)}"
                )
                logger.info(
                    f"[Objective Validation] Missing evidence detected. "
                    f"Flagged for manual review. "
                    f"Reasons: {' | '.join(validation_reasons)}"
                )
            elif domain_fit_review:
                recommendation = "review_manually"
                reason = " | ".join(validation_reasons)

            enough_mandatory_for_strong = (
                mandatory_strong_coverage >= _MANDATORY_STRONG_COVERAGE_STRONG_MATCH
                if total_mandatory else True
            )
            enough_mandatory_for_good = (
                mandatory_strong_coverage >= _MANDATORY_STRONG_COVERAGE_GOOD_MATCH
                if total_mandatory else True
            )

            if not domain_fit_review and validation_status != "unknown":
                if overall >= _STRONG_MATCH_THRESHOLD and enough_mandatory_for_strong:
                    recommendation = "strong_match"
                elif overall >= _GOOD_MATCH_THRESHOLD and enough_mandatory_for_good:
                    recommendation = "good_match"
                elif overall >= _POTENTIAL_THRESHOLD:
                    recommendation = "potential"
                else:
                    recommendation = "not_recommended"
                reason = None

                # Prevent all-partial from becoming strong_match or good_match
                if all_mandatory_partial and recommendation in ("strong_match", "good_match"):
                    recommendation = "potential"

        final_score_after_cap = overall

        skills_score = (
            mandatory_score * Decimal("0.75") + optional_score * Decimal("0.25")
        ).quantize(Decimal("0.01"))

        if reason:
            # Rejected due to mandatory filter
            summary = reason
        else:
            base_summary = (
                f"{mandatory_matched}/{total_mandatory} skills obrigatórias e "
                f"{optional_matched}/{total_optional} skills opcionais atendidas."
            )
            if partial_matches and not adaptive_explanation:
                partial_txt = ", ".join(f"{pm['candidate']}→{pm['required']}" for pm in partial_matches[:3])
                summary = f"{base_summary} Correspondências parciais: {partial_txt}."
            else:
                summary = adaptive_explanation or base_summary
        await PipelineService(
            SQLAlchemyPipelineRepository(self._repository.session)
        ).register_match_entry(
            analysis_id=analysis_id,
            job_id=job_id,
        )

        candidate_id = await self._repository.get_candidate_id_from_analysis(analysis_id)
        resume_version_id = await self._repository.get_resume_version_id_from_analysis(analysis_id)
        if candidate_id is None or resume_version_id is None:
            raise ValueError("Could not resolve analysis context for candidate_job_match persistence")

        pipeline_key = uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
        skill_evidence_breakdown = {
            "partial_matches": partial_matches,
            "mandatory_score_weighted": float(skill_scores["mandatory_score_weighted"]),
            "mandatory_strong_coverage": float(mandatory_strong_coverage),
            "score_version": _SCORE_VERSION_EQUIVALENCE,
            "raw_score": float(raw_weighted_score),
            "final_score_before_cap": float(final_score_before_cap),
            "final_score_after_cap": float(final_score_after_cap),
            "cap_applied": cap_applied,
            "cap_reason": cap_reason,
            "validation_status": validation_status,
            "validation_reasons": list(validation_reasons),
            "failed_rule": failed_rule,
            "failed_dimension": failed_dimension,
            "missing_required_skills": list(missing_skill_names),
            "education_detected": result.highest_education_level,
            "minimum_education_required": job.minimum_education_level,
            "experience_detected": float(candidate_years) if candidate_years is not None else None,
            "minimum_experience_required": float(required_years) if required_years is not None else None,
            "eligibility_status": eligibility_status,
            "mandatory_skills_matched": mandatory_matched,
            "mandatory_skills_total": total_mandatory,
            "domain_fit_review": domain_fit_review,
            "has_domain_evidence": has_domain_evidence,
        }

        if not job.job_profile_hash:
            raise ValueError(f"Job {job.id} missing job_profile_hash during match persistence")

        persisted_match = CandidateJobMatchModel(
            candidate_id=candidate_id,
            job_id=job_id,
            resume_version_id=resume_version_id,
            candidate_profile_analysis_id=candidate_profile_analysis.id,
            job_profile_analysis_id=job_profile_analysis.id,
            candidate_job_pipeline_id=pipeline_key,
            recommendation=recommendation,
            matched_skills_json=matched_skill_names,
            missing_skills_json=missing_skill_names,
            skill_evidence_breakdown=skill_evidence_breakdown,
            explanation=summary,
            eligibility_status=eligibility_status,
            created_at=datetime.now(UTC),
            score_version=_SCORE_VERSION_EQUIVALENCE if partial_matches else None,
            freshness_status="fresh",
            job_signature_hash=str(job.job_profile_hash),
        )

        await self._repository.upsert_candidate_job_match(persisted_match)

        if cap_applied:
            logger.info(
                "score.cap_applied",
                extra={
                    "candidate_id": str(candidate_id),
                    "job_id": str(job_id),
                    "raw_score": float(raw_weighted_score),
                    "final_score": float(final_score_after_cap),
                    "validation_status": validation_status,
                    "validation_reason": " | ".join(validation_reasons) if validation_reasons else None,
                    "failed_rule": failed_rule,
                    "failed_dimension": failed_dimension,
                    "missing_required_skills": list(missing_skill_names),
                    "education_detected": result.highest_education_level,
                    "minimum_education_required": job.minimum_education_level,
                    "experience_detected": float(candidate_years) if candidate_years is not None else None,
                    "minimum_experience_required": float(required_years) if required_years is not None else None,
                    "cap_reason": cap_reason,
                },
            )

        ranking_refresh_status = "unknown"
        ranking_freshness_status = "stale"
        ranking_refreshed_at = None
        ranking_warning = None
        public_final_score = None
        ranking_service = None
        try:
            from src.application.services.candidate_ranking_service import CandidateRankingService

            ranking_service = CandidateRankingService(self._repository.session)
            async with self._repository.session.begin_nested():
                ranking_result = await ranking_service.compute_single_candidate(
                    job_id, candidate_id, recompute_reason="post_match"
                )

            if ranking_result is None:
                ranking_refresh_status = "skipped"
                ranking_warning = "Ranking incremental não encontrou contexto suficiente para o candidato."
            else:
                ranking_refresh_status = "updated"
                ranking_freshness_status = str(require_key(ranking_result, "freshness_status"))
                ranking_refreshed_at = require_key(ranking_result, "computed_at")
                public_final_score = float(require_key(ranking_result, "final_score"))
        except Exception:
            ranking_refresh_status = "failed"
            ranking_freshness_status = "stale"
            ranking_warning = (
                "Match salvo, mas o ranking incremental falhou e pode estar desatualizado."
            )
            logger.warning(
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
                        "source_analysis_created_at": details.analysis.created_at.isoformat(),
                        "score_model_version": score_model_version.version if score_model_version else None,
                        "ranking_version": score_model_version.version if score_model_version else None,
                        "freshness_status": "stale",
                        "recompute_reason": "match_to_job_sync",
                    },
                ),
                session=self._repository.session,
            )
            if ranking_service is not None:
                try:
                    async with self._repository.session.begin_nested():
                        await ranking_service.mark_candidate_stale(job_id, candidate_id)
                except Exception:
                    logger.warning(
                        "ranking.mark_stale_failed",
                        exc_info=True,
                        extra={
                            "analysis_id": str(analysis_id),
                            "candidate_id": str(candidate_id),
                            "job_id": str(job_id),
                        },
                    )

        return AnalysisMatchResponse(
            analysis_id=analysis_id,
            job_id=job_id,
            final_score=public_final_score,
            recommendation=recommendation,
            mandatory_skills_matched=mandatory_matched,
            mandatory_skills_total=total_mandatory,
            optional_skills_matched=optional_matched,
            optional_skills_total=total_optional,
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
