"""
AdaptiveScoringComparisonService — fase de validação.

Compara o score legado atual com o score adaptativo novo sem alterar a decisão
final do sistema. A intenção é calibrar a nova camada antes de qualquer troca
de ranking em produção.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID, uuid5, NAMESPACE_URL

import structlog

from src.application.services.adaptive_scorer_service import AdaptiveScorerService
from src.domain.entities.analysis import SeniorityLevel
from src.domain.services.job_compatibility_calculator import (
    CompatibilityInput,
    CompatibilityResult,
    JobCompatibilityCalculator,
)
from src.domain.value_objects.adaptive_scoring_comparison import AdaptiveScoringComparisonResult
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_profile import CandidateProfile, EvidencedSkill
from src.domain.value_objects.evidence_mapping import EvidenceMapping
from src.domain.value_objects.job_profile import JobProfile, JobRequirement
from src.domain.value_objects.skill_set import RequiredSkill, SkillEntry, SkillSet

logger = structlog.get_logger(__name__)

_SKILL_NAMESPACE = UUID("6e6a3e5b-0d13-4d9d-bd6f-4a76f2a2c4a1")

_SENIORITY_LEVEL_MAP: dict[str, SeniorityLevel] = {
    "intern": SeniorityLevel.INTERN,
    "junior": SeniorityLevel.JUNIOR,
    "mid": SeniorityLevel.MID,
    "senior": SeniorityLevel.SENIOR,
    "lead": SeniorityLevel.LEAD,
    "principal": SeniorityLevel.PRINCIPAL,
    "director": SeniorityLevel.DIRECTOR,
}

_PROFICIENCY_LEVEL_MAP: dict[str, str] = {
    "very_high": "expert",
    "high": "advanced",
    "medium": "intermediate",
    "low": "basic",
}

_REJECT_RECOMMENDATIONS = {"not_recommended", "not_match"}
_APPROVAL_RECOMMENDATIONS = {"strong_match", "good_match", "interview"}


def _clean_str(value: object, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_text(value: object) -> str:
    text = _clean_str(value).lower()
    return " ".join(text.split())


def _skill_id(name: str, prefix: str) -> UUID:
    return uuid5(_SKILL_NAMESPACE, f"{prefix}:{_normalize_text(name)}")


def _job_target_level(job_profile: JobProfile) -> SeniorityLevel | None:
    return _SENIORITY_LEVEL_MAP.get(job_profile.target_level)


def _candidate_seniority(candidate_profile: CandidateProfile) -> SeniorityLevel:
    return _SENIORITY_LEVEL_MAP.get(candidate_profile.detected_level, SeniorityLevel.MID)


def _candidate_education_level(candidate_profile: CandidateProfile) -> str:
    best_rank = -1
    best_level = "none"
    education_rank = {
        "none": 0,
        "high_school": 1,
        "technical": 2,
        "bachelor": 3,
        "postgraduate": 4,
        "master": 5,
        "phd": 6,
    }

    for entry in candidate_profile.education:
        level = _normalize_text(entry.level)
        rank = education_rank.get(level, -1)
        if rank > best_rank:
            best_rank = rank
            best_level = level if level in education_rank else "none"
    return best_level


def _job_min_experience_years(job_profile: JobProfile) -> float | None:
    mapping = {
        "intern": 0.0,
        "junior": 1.0,
        "mid": 3.0,
        "senior": 5.0,
        "lead": 7.0,
        "principal": 10.0,
        "director": 12.0,
    }
    return mapping.get(job_profile.target_level)


def _proficiency_level_from_candidate(
    *,
    years_evidenced: float | None,
    confidence: str,
    source: str,
) -> str:
    if confidence == "very_high" or (years_evidenced is not None and years_evidenced >= 6):
        return "expert"
    if confidence == "high" or (years_evidenced is not None and years_evidenced >= 4):
        return "advanced"
    if source in {"experience", "project"} and (years_evidenced is None or years_evidenced >= 2):
        return "intermediate"
    return "basic"


def _best_entry(existing: SkillEntry | None, candidate: SkillEntry) -> SkillEntry:
    if existing is None:
        return candidate
    if candidate.proficiency_rank > existing.proficiency_rank:
        return candidate
    if candidate.proficiency_rank == existing.proficiency_rank and candidate.is_primary and not existing.is_primary:
        return candidate
    return existing


def _candidate_skill_set(candidate_profile: CandidateProfile) -> SkillSet:
    indexed: dict[str, SkillEntry] = {}

    def _add(name: str, proficiency_level: str, source: str, is_primary: bool = False) -> None:
        normalized = _normalize_text(name)
        if not normalized:
            return
        entry = SkillEntry(
            skill_id=_skill_id(name, "candidate"),
            skill_name=name,
            normalized_name=normalized,
            proficiency_level=proficiency_level,
            years_experience=Decimal(str(candidate_profile.estimated_experience_years)),
            is_primary=is_primary,
            source=source,
        )
        indexed[normalized] = _best_entry(indexed.get(normalized), entry)

    for skill in candidate_profile.evidenced_skills:
        _add(
            skill.name,
            _proficiency_level_from_candidate(
                years_evidenced=skill.years_evidenced,
                confidence=skill.confidence,
                source=skill.source,
            ),
            skill.source,
            is_primary=True,
        )

    for tool in candidate_profile.tools_and_systems:
        _add(tool, "intermediate", "inferred")

    for capability in candidate_profile.capabilities:
        _add(capability.name, "intermediate", capability.source)

    for experience in candidate_profile.experiences:
        for tool in experience.technologies_used:
            _add(tool, "intermediate", "experience")
        if experience.is_leadership:
            _add("leadership", "intermediate", "experience")

    for evidence in candidate_profile.leadership_evidence:
        _add(evidence, "intermediate", "summary")

    for evidence in candidate_profile.business_impact_evidence:
        _add(evidence, "basic", "summary")

    return SkillSet.from_list(list(indexed.values()))


def _required_skills(job_profile: JobProfile) -> list[RequiredSkill]:
    indexed: dict[str, RequiredSkill] = {}

    def _add(name: str, is_mandatory: bool, weight: float = 1.0) -> None:
        normalized = _normalize_text(name)
        if not normalized:
            return
        skill = RequiredSkill(
            skill_id=_skill_id(name, "job"),
            skill_name=name,
            normalized_name=normalized,
            is_mandatory=is_mandatory,
            minimum_level=None,
            minimum_years=None,
            weight=Decimal(str(weight)),
        )
        existing = indexed.get(normalized)
        if existing is None:
            indexed[normalized] = skill
            return
        if skill.is_mandatory and not existing.is_mandatory:
            indexed[normalized] = skill
            return
        if skill.weight > existing.weight:
            indexed[normalized] = skill

    for requirement in job_profile.critical_requirements:
        _add(requirement.name, True, requirement.importance_weight)

    for requirement in job_profile.desirable_requirements:
        _add(requirement.name, False, requirement.importance_weight)

    for tool in job_profile.required_tools:
        _add(tool, True, 1.0)

    for capability in job_profile.required_capabilities:
        _add(capability, True, 1.0)

    for responsibility in job_profile.responsibilities:
        _add(responsibility, False, 0.8)

    return list(indexed.values())


def _legacy_compatibility_input(job_profile: JobProfile, candidate_profile: CandidateProfile) -> CompatibilityInput:
    return CompatibilityInput(
        candidate_skills=_candidate_skill_set(candidate_profile),
        required_skills=_required_skills(job_profile),
        candidate_seniority=_candidate_seniority(candidate_profile),
        candidate_experience_years=float(candidate_profile.estimated_experience_years),
        candidate_education_level=_candidate_education_level(candidate_profile),
        job_seniority=_job_target_level(job_profile),
        job_min_experience_years=_job_min_experience_years(job_profile),
        job_min_education_level=None,
    )


def _fallback_adaptive_result(job_profile: JobProfile, candidate_profile: CandidateProfile) -> AdaptiveScoreResult:
    return AdaptiveScoreResult(
        match_score=0.0,
        confidence_score=0.0,
        recommendation="reject",
        score_breakdown={},
        strengths=[],
        gaps=[],
        risk_points=["adaptive_scoring_fallback"],
        critical_coverage=0.0,
        desirable_coverage=0.0,
        area=job_profile.area,
        target_level=job_profile.target_level,
        detected_level=candidate_profile.detected_level,
    )


def _is_reject(recommendation: str) -> bool:
    normalized = _normalize_text(recommendation)
    return normalized in _REJECT_RECOMMENDATIONS


def _is_approval(recommendation: str) -> bool:
    normalized = _normalize_text(recommendation)
    return normalized in _APPROVAL_RECOMMENDATIONS


class AdaptiveScoringComparisonService:
    def __init__(
        self,
        adaptive_scorer: AdaptiveScorerService | None = None,
        legacy_calculator: JobCompatibilityCalculator | None = None,
    ) -> None:
        self._adaptive_scorer = adaptive_scorer or AdaptiveScorerService()
        self._legacy_calculator = legacy_calculator or JobCompatibilityCalculator()

    def compare(
        self,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        evidence_mapping: EvidenceMapping,
        legacy_result: CompatibilityResult | None = None,
    ) -> AdaptiveScoringComparisonResult:
        if legacy_result is None:
            legacy_result = self._legacy_calculator.calculate(
                _legacy_compatibility_input(job_profile, candidate_profile)
            )

        try:
            adaptive_result = self._adaptive_scorer.score(job_profile, candidate_profile, evidence_mapping)
        except Exception as exc:
            logger.warning(
                "adaptive_scoring_comparison_adaptive_failed",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
                error=str(exc),
            )
            adaptive_result = _fallback_adaptive_result(job_profile, candidate_profile)
            logger.info(
                "adaptive_scoring_comparison_fallback_used",
                job_profile_hash=job_profile.description_hash,
                candidate_profile_hash=candidate_profile.resume_hash,
            )

        legacy_score = float(legacy_result.match_score.value)
        adaptive_score = float(adaptive_result.match_score)
        delta = abs(adaptive_score - legacy_score)

        legacy_recommendation = legacy_result.recommendation
        adaptive_recommendation = adaptive_result.recommendation

        major_differences = self._build_major_differences(
            job_profile=job_profile,
            candidate_profile=candidate_profile,
            evidence_mapping=evidence_mapping,
            legacy_result=legacy_result,
            adaptive_result=adaptive_result,
            delta=delta,
        )
        explanation = self._build_explanation(
            legacy_result=legacy_result,
            adaptive_result=adaptive_result,
            delta=delta,
            major_differences=major_differences,
        )
        confidence_score = self._comparison_confidence(legacy_result, adaptive_result, delta, major_differences)
        should_review_manually = self._should_review_manually(
            legacy_recommendation=legacy_recommendation,
            adaptive_result=adaptive_result,
            delta=delta,
            confidence_score=confidence_score,
            job_profile=job_profile,
            candidate_profile=candidate_profile,
        )

        logger.info(
            "adaptive_scoring_comparison_generated",
            job_profile_hash=job_profile.description_hash,
            candidate_profile_hash=candidate_profile.resume_hash,
            legacy_match_score=legacy_score,
            adaptive_match_score=adaptive_score,
            delta=delta,
            legacy_recommendation=legacy_recommendation,
            adaptive_recommendation=adaptive_recommendation,
            confidence_score=confidence_score,
            should_review_manually=should_review_manually,
        )

        return AdaptiveScoringComparisonResult(
            legacy_match_score=legacy_score,
            adaptive_match_score=adaptive_score,
            delta=delta,
            legacy_recommendation=legacy_recommendation,
            adaptive_recommendation=adaptive_recommendation,
            explanation=explanation,
            major_differences=major_differences,
            confidence_score=confidence_score,
            should_review_manually=should_review_manually,
        )

    def _build_major_differences(
        self,
        *,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        evidence_mapping: EvidenceMapping,
        legacy_result: CompatibilityResult,
        adaptive_result: AdaptiveScoreResult,
        delta: float,
    ) -> list[str]:
        differences: list[str] = []

        if delta >= 25:
            differences.append(f"Delta de {delta:.1f} pontos entre legado e adaptativo")

        if _normalize_text(legacy_result.recommendation) != _normalize_text(adaptive_result.recommendation):
            differences.append(
                f"Recomendacoes divergentes: legado {legacy_result.recommendation} vs adaptativo {adaptive_result.recommendation}"
            )

        if _is_reject(legacy_result.recommendation) and adaptive_result.recommendation in {"interview", "strong_match"}:
            differences.append("Conflito de decisão: legado rejeita e adaptativo sugere avanço")

        if adaptive_result.confidence_score < 60:
            differences.append("Confiança adaptativa baixa")

        if job_profile.job_completeness_score < 0.50:
            differences.append("Vaga incompleta reduz confianca da comparação")

        if candidate_profile.profile_completeness < 0.30:
            differences.append("Curriculo incompleto reduz confianca da comparação")

        equivalent_items = [
            item.get("name", "")
            for item in adaptive_result.score_breakdown.get("items", [])
            if item.get("match_type") in {"equivalent", "inferred"}
            and float(item.get("score", 0.0)) >= 80
        ]
        if equivalent_items and legacy_result.match_score.value < adaptive_result.match_score:
            differences.append(
                f"Camada adaptativa reconheceu equivalencias em {', '.join(str(item) for item in equivalent_items[:3])}"
            )

        leadership_risks = [
            point for point in adaptive_result.risk_points if "lideranca" in point.lower() or "liderança" in point.lower()
        ]
        if leadership_risks:
            differences.append("Lideranca formal segue um ponto de atenção")

        return _dedupe_strings(differences)

    def _build_explanation(
        self,
        *,
        legacy_result: CompatibilityResult,
        adaptive_result: AdaptiveScoreResult,
        delta: float,
        major_differences: list[str],
    ) -> str:
        if not major_differences:
            return (
                f"Comparacao alinhada: legado {legacy_result.match_score.value:.2f} e "
                f"adaptativo {adaptive_result.match_score:.2f} com delta de {delta:.1f} pontos."
            )

        return (
            f"Comparacao com delta de {delta:.1f} pontos entre legado {legacy_result.match_score.value:.2f} "
            f"e adaptativo {adaptive_result.match_score:.2f}. Principais diferencas: "
            f"{'; '.join(major_differences)}."
        )

    def _comparison_confidence(
        self,
        legacy_result: CompatibilityResult,
        adaptive_result: AdaptiveScoreResult,
        delta: float,
        major_differences: list[str],
    ) -> float:
        base = (adaptive_result.confidence_score * 0.6) + ((100.0 - min(delta, 100.0)) * 0.4)
        if _normalize_text(legacy_result.recommendation) == _normalize_text(adaptive_result.recommendation):
            base += 5.0
        if delta >= 25:
            base -= 10.0
        if adaptive_result.confidence_score < 60:
            base -= 15.0
        if any("conflito" in diff.lower() for diff in major_differences):
            base -= 10.0
        return max(0.0, min(100.0, round(base, 2)))

    def _should_review_manually(
        self,
        *,
        legacy_recommendation: str,
        adaptive_result: AdaptiveScoreResult,
        delta: float,
        confidence_score: float,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
    ) -> bool:
        if delta >= 25:
            return True
        if adaptive_result.confidence_score < 60 or confidence_score < 60:
            return True
        if _is_reject(legacy_recommendation) and adaptive_result.recommendation in {"interview", "strong_match"}:
            return True
        if candidate_profile.profile_completeness < 0.30:
            return True
        if job_profile.job_completeness_score < 0.50:
            return True
        return False


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _clean_str(value)
        if not text:
            continue
        lowered = text.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(text)
    return deduped
