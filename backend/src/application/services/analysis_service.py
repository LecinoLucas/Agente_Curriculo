import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

# Penalidade de sobre-qualificação em senioridade só é aplicada quando
# a diferença de níveis é >= este limiar (configurável).
_SENIORITY_PENALTY_THRESHOLD = 2

logger = logging.getLogger(__name__)

from src.domain.entities.user import User
from src.application.services.matching_engine_service import MatchingEngineService
from src.application.services.candidate_job_link_service import CandidateJobLinkService
from src.application.services.skill_text_normalizer import (
    contains_whole_phrase,
    normalize_skill_text,
)
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
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


def _validate_education(
    candidate_level: str | None, required_level: str | None
) -> ValidationResult:
    """Validate candidate education against job requirement.

    Returns:
        PASS: candidate >= required
        FAIL: candidate < required
        UNKNOWN: candidate education level not provided
    """
    if required_level is None:
        return ValidationResult(status="pass")

    if candidate_level is None:
        return ValidationResult(
            status="unknown",
            reason=f"Educação não informada (exigido: {required_level})"
        )

    candidate_rank = _get_education_level_rank(candidate_level)
    required_rank = _get_education_level_rank(required_level)

    if candidate_rank < required_rank:
        return ValidationResult(
            status="fail",
            reason=f"Educação insuficiente ({candidate_level} < {required_level})"
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


def _adaptive_to_legacy_recommendation(value: str) -> str:
    normalized = (value or "").strip().lower()
    mapping = {
        "strong_match": "strong_match",
        "interview": "good_match",
        "maybe": "potential",
        "reject": "not_recommended",
        "insufficient_data": "review_manually",
    }
    return mapping.get(normalized, "not_recommended")


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
    if not candidate_normalized or not job_normalized:
        return False

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


class ResumeVersionNotFoundError(Exception):
    pass


class ResumeVersionNotReadyError(Exception):
    pass


class AIModelUnavailableError(Exception):
    pass


class PromptTemplateUnavailableError(Exception):
    pass


class AnalysisNotFoundError(Exception):
    pass


class AnalysisNotCompletedError(Exception):
    pass


class AnalysisResultNotFoundError(Exception):
    pass


class JobNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class AnalysisResultDetails:
    analysis: AnalysisModel
    result: AnalysisResultModel


class AnalysisService:
    def __init__(self, repository: SQLAlchemyAnalysisRepository) -> None:
        self._repository = repository

    async def request(self, resume_version_id: UUID, current_user: User) -> AnalysisModel:
        resume_version = await self._repository.find_resume_version_for_user(
            resume_version_id,
            current_user,
        )
        if resume_version is None:
            raise ResumeVersionNotFoundError
        if resume_version.extraction_status != "completed" or not (
            resume_version.extracted_text or ""
        ).strip():
            raise ResumeVersionNotReadyError

        ai_model = await self._repository.find_preferred_ai_model()
        if ai_model is None:
            raise AIModelUnavailableError

        prompt_template = await self._repository.find_preferred_prompt_template()
        if prompt_template is None:
            raise PromptTemplateUnavailableError

        analysis = AnalysisModel(
            resume_version_id=resume_version_id,
            ai_model_id=ai_model.id,
            prompt_template_id=prompt_template.id,
            status="pending",
            requested_by=current_user.id,
        )
        return await self._repository.create(analysis)

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
                candidate_id=row["candidate_id"],
                candidate_name=row["candidate_name"],
                candidate_email=row["candidate_email"],
                resume_file_name=row["resume_file_name"],
                resume_version_id=row["resume_version_id"],
                status=row["status"],
                failure_reason=row["failure_reason"],
                used_real_ai=row["used_real_ai"],
                overall_score=float(row["overall_score"]) if row.get("overall_score") is not None else None,
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
        published_jobs_total = await self._repository.count_published_jobs()
        matched_jobs_count = await self._repository.count_published_matches_for_analysis(
            analysis_id
        )
        pending_jobs_count = max(published_jobs_total - matched_jobs_count, 0)
        recent_matches = await self._repository.list_recent_job_matches_for_analysis(analysis_id)

        if analysis.status in {"failed", "cancelled"}:
            matching_status = "blocked"
        elif analysis.status != "completed":
            matching_status = "waiting_analysis"
        elif published_jobs_total == 0:
            matching_status = "idle"
        elif pending_jobs_count > 0:
            matching_status = "processing"
        else:
            matching_status = "completed"

        return AnalysisPipelineResponse(
            analysis_id=analysis.id,
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

    async def auto_match_published_jobs(self, analysis_id: UUID) -> int:
        # Load score model version ONCE for all jobs
        score_version = await self._repository.find_active_score_model_version()
        logger.info(
            f"[WeightAlignment] Loaded score model version: "
            f"{'active' if score_version and score_version.is_active else 'fallback'}"
        )

        jobs = await self._repository.list_published_jobs()
        matched = 0
        for job in jobs:
            await self.match_completed_analysis_to_job(
                analysis_id, job.id, score_model_version=score_version
            )
            matched += 1
        return matched

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

        job_skills = await self._repository.list_active_job_skill_rows(job_id)
        candidate_keywords: set[str] = {
            normalize_skill_text(kw)
            for kw in (result.keywords or [])
            if kw and normalize_skill_text(kw)
        }
        extracted: dict = result.extracted_data or {}
        raw_skills: list[dict] = extracted.get("skills", [])
        candidate_skill_names: set[str] = {
            normalize_skill_text(skill.get("name", ""))
            for skill in raw_skills
            if skill.get("name") and normalize_skill_text(skill.get("name", ""))
        }
        all_candidate_skills = candidate_keywords | candidate_skill_names

        mandatory_skills = [row for row in job_skills if row.JobRequiredSkillModel.is_mandatory]
        optional_skills = [row for row in job_skills if not row.JobRequiredSkillModel.is_mandatory]

        def skill_matched(job_skill_row) -> bool:
            """Check if candidate has the job skill using multi-strategy matching.

            Strategies:
            1. Exact match (case-insensitive)
            2. Alias match (from SkillModel.aliases)
            3. Levenshtein distance <= 2 (for typos)
            """
            job_skill_name = job_skill_row.skill_name
            job_skill_aliases = job_skill_row.skill_aliases or []

            for cand_skill in all_candidate_skills:
                if _skill_matches(cand_skill, job_skill_name, job_skill_aliases):
                    return True
            return False

        mandatory_matched = sum(1 for row in mandatory_skills if skill_matched(row))
        optional_matched = sum(1 for row in optional_skills if skill_matched(row))
        matched_skill_names = [
            row.skill_name for row in job_skills if skill_matched(row)
        ]
        missing_skill_names = [
            row.skill_name for row in mandatory_skills if not skill_matched(row)
        ]

        def _is_bonus(cand_skill: str) -> bool:
            """Check if candidate skill is not a job requirement (bonus skill)."""
            for job_row in job_skills:
                if _skill_matches(cand_skill, job_row.skill_name, job_row.skill_aliases or []):
                    return False
            return True

        bonus_skill_names = sorted(s for s in all_candidate_skills if s and _is_bonus(s))

        total_mandatory = len(mandatory_skills)
        total_optional = len(optional_skills)

        adaptive_match = None
        adaptive_legacy_recommendation = "not_recommended"
        adaptive_explanation = None
        adaptive_strengths: list[str] = []
        adaptive_gaps: list[str] = []
        adaptive_risk_points: list[str] = []
        adaptive_behavioral_indicators: list[str] = []
        adaptive_score_breakdown: dict[str, object] = {}
        engine_used = "legacy"

        try:
            adaptive_match = await MatchingEngineService(self._repository).match_details_to_job(
                details.analysis,
                result,
                job_id,
            )
            if adaptive_match.confidence_score < Decimal("50"):
                logger.info(
                    "adaptive_matching_engine_low_confidence analysis_id=%s job_id=%s confidence=%s",
                    str(analysis_id),
                    str(job_id),
                    str(adaptive_match.confidence_score),
                )
                adaptive_match = None
            else:
                adaptive_legacy_recommendation = _adaptive_to_legacy_recommendation(
                    adaptive_match.recommendation
                )
                adaptive_explanation = adaptive_match.explanation
                adaptive_strengths = list(adaptive_match.strengths)
                adaptive_gaps = list(adaptive_match.gaps)
                adaptive_risk_points = list(adaptive_match.risk_points)
                adaptive_behavioral_indicators = list(adaptive_match.behavioral_indicators)
                adaptive_score_breakdown = {
                    "score_final": float(adaptive_match.score_final),
                    "technical_competencies": float(adaptive_match.technical_competencies),
                    "practical_experience": float(adaptive_match.practical_experience),
                    "role_fit": float(adaptive_match.role_fit),
                    "seniority_alignment": float(adaptive_match.seniority_alignment),
                    "education": float(adaptive_match.education),
                    "leadership_evidence": float(adaptive_match.leadership_evidence),
                    "behavioral_indicators": list(adaptive_match.behavioral_indicators),
                    "risk_points": list(adaptive_match.risk_points),
                    "strengths": list(adaptive_match.strengths),
                    "gaps": list(adaptive_match.gaps),
                    "recommendation": adaptive_match.recommendation,
                    "engine_used": adaptive_match.engine_used,
                    "raw_breakdown": dict(adaptive_match.score_breakdown),
                }
                bonus_skill_names = adaptive_match.bonus_signals or bonus_skill_names
                engine_used = adaptive_match.engine_used
        except Exception as exc:
            logger.warning(
                "adaptive_matching_engine_failed analysis_id=%s job_id=%s error=%s",
                str(analysis_id),
                str(job_id),
                str(exc),
            )

        # Pure-Decimal scores; avoid float arithmetic entirely.
        mandatory_score = (
            Decimal(mandatory_matched) / Decimal(total_mandatory) * Decimal("100")
            if total_mandatory > 0
            else Decimal("0")
        )
        optional_score = (
            Decimal(optional_matched) / Decimal(total_optional) * Decimal("100")
            if total_optional > 0
            else Decimal("0")
        )

        # ── MANDATORY FILTER: Reject if candidate lacks required skills ────────
        # If job has mandatory skills and candidate doesn't meet 60% threshold,
        # automatically reject. This prevents unqualified candidates from ranking.
        mandatory_percentage = (
            Decimal(mandatory_matched) / Decimal(total_mandatory) * Decimal("100")
            if total_mandatory > 0
            else Decimal("100")  # If no mandatory skills, pass this filter
        )
        mandatory_threshold = Decimal("60")

        weights_source = "adaptive_engine" if adaptive_match is not None else "fallback_hardcoded"
        if adaptive_match is not None:
            overall = adaptive_match.score_final
            skills_score = adaptive_match.technical_competencies
            seniority_score = adaptive_match.seniority_alignment
        else:
            # Load score model version weights (with fallback to hardcoded)
            if score_model_version is None:
                # Load if not provided (e.g., from match_to_job)
                score_model_version = await self._repository.find_active_score_model_version()

            if score_model_version:
                weights_dict = score_model_version.weights or {}
                w_mand = Decimal(str(weights_dict.get("skill_match", "0.40")))
                w_opt = Decimal(str(weights_dict.get("experience_match", "0.20")))
                w_sen = Decimal(str(weights_dict.get("seniority_match", "0.20")))
                w_ai = Decimal(str(weights_dict.get("ai_confidence", "0.20")))
                weights_source = "score_model_version"
                logger.debug(
                    f"[WeightAlignment] Using score model version weights: "
                    f"skill_match={w_mand}, experience_match={w_opt}, seniority_match={w_sen}, ai_confidence={w_ai}"
                )
            else:
                # Fallback to hardcoded defaults
                w_mand = Decimal("0.40")
                w_opt = Decimal("0.20")
                w_sen = Decimal("0.20")
                w_ai = Decimal("0.20")
                logger.debug("[WeightAlignment] Using fallback hardcoded weights")

            # Auto-reweight when a category has no skills.
            if total_mandatory == 0 and total_optional > 0:
                w_opt += w_mand
                w_mand = Decimal("0")
            elif total_mandatory == 0 and total_optional == 0:
                half = (w_mand + w_opt) / 2
                w_sen += half
                w_ai += half
                w_mand = Decimal("0")
                w_opt = Decimal("0")
            elif total_optional == 0:
                w_mand += w_opt
                w_opt = Decimal("0")

            seniority_map = {
                "intern": 0,
                "junior": 1,
                "mid": 2,
                "senior": 3,
                "lead": 4,
                "principal": 5,
                "director": 6,
            }
            candidate_sen = seniority_map.get(result.seniority_level or "", 2)
            job_sen = seniority_map.get(job.seniority_level or "", 2)
            distance = abs(candidate_sen - job_sen)
            sen_scores = {0: Decimal("100"), 1: Decimal("75"), 2: Decimal("45"), 3: Decimal("20")}
            seniority_score = sen_scores.get(distance, Decimal("0"))
            if candidate_sen > job_sen and distance >= _SENIORITY_PENALTY_THRESHOLD:
                seniority_score = seniority_score * Decimal("0.90")

            raw_ai = result.overall_score
            if raw_ai is None:
                ai_score = Decimal("0")
            elif isinstance(raw_ai, Decimal):
                ai_score = min(raw_ai, Decimal("100"))
            else:
                ai_score = min(Decimal(str(raw_ai)), Decimal("100"))

            # ── OBJECTIVE EDUCATION & EXPERIENCE VALIDATION ──────────────────────
            # Validate against explicit job requirements (not heuristic scores)
            # Returns: PASS (ok), FAIL (reject), or UNKNOWN (flag for manual review)

            overall = min(
                mandatory_score * w_mand
                + optional_score * w_opt
                + seniority_score * w_sen
                + ai_score * w_ai,
                Decimal("100"),
            ).quantize(Decimal("0.01"))

        education_result = _validate_education(
            result.highest_education_level, job.minimum_education_level
        )
        experience_result = _validate_experience(
            Decimal(str(result.total_experience_years))
            if result.total_experience_years is not None
            else None,
            Decimal(str(job.minimum_years_experience))
            if job.minimum_years_experience is not None
            else None,
        )

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
                logger.info(
                    f"[Deal-Breaker] {breaker_reason} Candidate REJECTED."
                )

        # ── APPLY MANDATORY FILTER & OBJECTIVE VALIDATIONS ───────────────────
        # Decision logic:
        # 1. If FAIL: reject (score <= 39)
        # 2. If only UNKNOWN: don't reject, but mark for manual review + light penalty
        # 3. Otherwise: normal scoring

        if validation_status == "fail":
            # Objective validation FAILED (candidate below minimum threshold)
            overall = min(overall, Decimal("39"))  # Cap score at 39 (below "potential")
            recommendation = "not_match"
            reason = " | ".join(validation_reasons)
            logger.info(
                f"[Objective Validation] Candidate REJECTED. "
                f"Reasons: {reason}. Score capped at 39."
            )
        elif validation_status == "unknown":
            # Objective validation UNKNOWN (missing critical evidence)
            # Don't reject, but flag for manual review and apply penalty
            penalty = Decimal("0.90")  # Apply 10% penalty for missing evidence
            overall = (overall * penalty).quantize(Decimal("0.01"))
            recommendation = "review_manually"
            reason = f"Dados insuficientes: {', '.join(missing_evidence)}. {' | '.join(validation_reasons)}"
            logger.info(
                f"[Objective Validation] Missing evidence detected. "
                f"Flagged for manual review. Penalty: 10%. "
                f"Reasons: {' | '.join(validation_reasons)}"
            )
        elif total_mandatory > 0 and mandatory_percentage < mandatory_threshold:
            # Job has required skills and candidate doesn't meet 60% threshold
            validation_status = "fail"
            overall = min(overall, Decimal("39"))  # Cap score at 39 (below "potential")
            recommendation = "not_match"
            reason = f"Não atende habilidades obrigatórias ({mandatory_matched}/{total_mandatory})"
            validation_reasons.append(reason)
        else:
            if adaptive_match is not None:
                recommendation = adaptive_legacy_recommendation
            else:
                # Pass mandatory filter or no mandatory skills required
                enough_mandatory_for_strong = (
                    Decimal(mandatory_matched) / Decimal(total_mandatory) >= Decimal("0.90")
                    if total_mandatory else True
                )
                enough_mandatory_for_good = (
                    Decimal(mandatory_matched) / Decimal(total_mandatory) >= Decimal("0.75")
                    if total_mandatory else True
                )

                if overall >= 82 and enough_mandatory_for_strong:
                    recommendation = "strong_match"
                elif overall >= 65 and enough_mandatory_for_good:
                    recommendation = "good_match"
                elif overall >= 45:
                    recommendation = "potential"
                else:
                    recommendation = "not_recommended"
            reason = None

        if adaptive_match is None:
            skills_score = (
                mandatory_score * Decimal("0.67") + optional_score * Decimal("0.33")
            ).quantize(Decimal("0.01"))

        if reason:
            # Rejected due to mandatory filter
            summary = reason
        else:
            summary = adaptive_explanation or (
                f"{mandatory_matched}/{total_mandatory} skills obrigatórias e "
                f"{optional_matched}/{total_optional} skills opcionais atendidas."
            )
        existing_match = await self._repository.find_job_match(analysis_id, job_id)
        match = existing_match or ResumeJobMatchModel(
            analysis_id=analysis_id,
            job_id=job_id,
            created_at=datetime.now(UTC),
        )
        match.match_score = overall
        match.skills_match_score = skills_score
        match.experience_match_score = (
            adaptive_match.practical_experience if adaptive_match is not None else result.experience_score
        )
        match.seniority_match_score = seniority_score.quantize(Decimal("0.01"))
        match.matched_skills = matched_skill_names
        match.missing_skills = missing_skill_names
        match.bonus_skills = bonus_skill_names
        match.match_summary = summary
        match.recommendation = recommendation
        match.weights_source = weights_source
        match.score_model_version_id = score_model_version.id if score_model_version else None
        match.validation_status = validation_status
        match.missing_evidence = missing_evidence
        match.rejection_reasons = validation_reasons
        await self._repository.save_job_match(match)
        await PipelineService(
            SQLAlchemyPipelineRepository(self._repository.session)
        ).register_match_entry(
            analysis_id=analysis_id,
            job_id=job_id,
            match_score=overall,
        )

        # Ensure candidate-job link exists with source="ai_match"
        try:
            candidate_id = await self._repository.get_candidate_id_from_analysis(analysis_id)
            if candidate_id:
                link_service = CandidateJobLinkService(self._repository.session)
                await link_service.ensure_link(candidate_id, job_id, source="ai_match")
        except Exception as exc:
            logger.warning(
                "Failed to ensure candidate-job link after matching analysis_id=%s job_id=%s error=%s",
                str(analysis_id),
                str(job_id),
                str(exc),
            )

        return AnalysisMatchResponse(
            analysis_id=analysis_id,
            job_id=job_id,
            match_score=overall,
            recommendation=recommendation,
            mandatory_skills_matched=mandatory_matched,
            mandatory_skills_total=total_mandatory,
            optional_skills_matched=optional_matched,
            optional_skills_total=total_optional,
            seniority_score=seniority_score.quantize(Decimal("0.01")),
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
        )
