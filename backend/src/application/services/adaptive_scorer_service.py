"""
AdaptiveScorerService — Fase 5.

Calcula o match_score final de forma determinística usando JobProfile,
CandidateProfile e EvidenceMapping. Não chama IA e não substitui o fluxo legado.

O objetivo desta camada é isolar uma fórmula auditável para a próxima troca do
ranking, sem tocar no JobCompatibilityCalculator antigo.
"""

from __future__ import annotations

import unicodedata
from decimal import Decimal
from typing import Any

import structlog

from src.application.services.skill_normalizer_service import (
    primary_related_group,
    skill_related_groups,
)
from src.domain.value_objects.adaptive_score_result import AdaptiveScoreResult
from src.domain.value_objects.candidate_profile import CandidateProfile
from src.domain.value_objects.evidence_mapping import (
    EvidenceMapping,
    RequirementMatch,
    VALID_CONFIDENCE as EVIDENCE_CONFIDENCE_LEVELS,
    VALID_EVIDENCE_STRENGTHS,
    VALID_MATCH_STATUSES,
    VALID_MATCH_TYPES,
    VALID_REQUIREMENT_TYPES,
)
from src.domain.value_objects.job_profile import AREA_WEIGHTS, DEFAULT_WEIGHTS, JobProfile, JobRequirement

logger = structlog.get_logger(__name__)

_STATUS_BASE_SCORES: dict[str, Decimal] = {
    "meets": Decimal("100"),
    "exceeds": Decimal("100"),
    "partially_meets": Decimal("65"),
    "unclear": Decimal("40"),
    "not_evidenced": Decimal("0"),
}

_MATCH_TYPE_MULTIPLIERS: dict[str, Decimal] = {
    "direct": Decimal("1.00"),
    "equivalent": Decimal("0.90"),
    "inferred": Decimal("0.60"),
    "absent": Decimal("0.00"),
}

_EVIDENCE_STRENGTH_MULTIPLIERS: dict[str, Decimal] = {
    "very_high": Decimal("1.00"),
    "high": Decimal("0.90"),
    "medium": Decimal("0.75"),
    "low": Decimal("0.50"),
    "none": Decimal("0.00"),
}

_EVIDENCE_CONFIDENCE_FACTORS: dict[str, Decimal] = {
    "very_high": Decimal("1.00"),
    "high": Decimal("0.85"),
    "medium": Decimal("0.65"),
    "low": Decimal("0.40"),
}

_EDUCATION_SCORES: dict[str, Decimal] = {
    "none": Decimal("20"),
    "high_school": Decimal("35"),
    "technical": Decimal("50"),
    "bachelor": Decimal("70"),
    "postgraduate": Decimal("80"),
    "master": Decimal("90"),
    "phd": Decimal("95"),
}

_SENIORITY_ORDER: list[str] = [
    "intern",
    "junior",
    "mid",
    "senior",
    "lead",
    "principal",
    "director",
]

_SENIORITY_YEAR_HINTS: dict[str, Decimal] = {
    "intern": Decimal("0"),
    "junior": Decimal("1"),
    "mid": Decimal("3"),
    "senior": Decimal("5"),
    "lead": Decimal("7"),
    "principal": Decimal("10"),
    "director": Decimal("12"),
    "undefined": Decimal("2"),
}

_LEADERSHIP_KEYWORDS = {
    "lead",
    "lider",
    "lideranca",
    "liderança",
    "management",
    "manager",
    "gerencia",
    "gerente",
    "coordena",
    "coordenac",
    "mentoria",
    "mentor",
    "squad",
    "team",
}

_EDUCATION_KEYWORDS = {
    "educacao",
    "educação",
    "formacao",
    "formação",
    "graduacao",
    "graduação",
    "bachelor",
    "mba",
    "master",
    "phd",
    "doutorado",
    "mestrado",
    "curso",
    "certificacao",
    "certificação",
}

_AREA_FAMILIES = {
    "technology": "tech",
    "data": "tech",
    "administrative": "ops",
    "accounting": "finance",
    "financial": "finance",
    "commercial": "commercial",
    "operational": "ops",
    "leadership": "leadership",
    "other": "other",
}

_JOB_REQUIREMENT_KEYS = ("critical_requirements", "desirable_requirements")


def _clean_str(value: Any, default: str = "") -> str:
    if value is None:
        return default
    text = str(value).strip()
    return text if text else default


def _normalize_text(value: Any) -> str:
    text = _clean_str(value).lower()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def _normalize_enum(value: Any, valid: set[str], default: str) -> str:
    candidate = _clean_str(value, default)
    return candidate if candidate in valid else default


def _normalize_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return max(minimum, min(maximum, number))


def _clamp_score(value: Decimal | float | int) -> float:
    if isinstance(value, Decimal):
        number = float(value)
    else:
        number = float(value)
    return max(0.0, min(100.0, number))


def _dedupe(values: list[str]) -> list[str]:
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


def _rank_seniority(level: str) -> int:
    try:
        return _SENIORITY_ORDER.index(level)
    except ValueError:
        return _SENIORITY_ORDER.index("mid")


def _highest_education_level(candidate_profile: CandidateProfile) -> str:
    best_level = "none"
    best_rank = -1
    for entry in candidate_profile.education:
        level = _normalize_text(entry.level)
        rank = {
            "none": 0,
            "high_school": 1,
            "technical": 2,
            "bachelor": 3,
            "postgraduate": 4,
            "master": 5,
            "phd": 6,
        }.get(level, -1)
        if rank > best_rank:
            best_rank = rank
            best_level = level if level in _EDUCATION_SCORES else "none"
    return best_level


def _signal_group(value: Any) -> str:
    text = _normalize_text(value)
    if not text:
        return ""
    return primary_related_group(text)


def _signal_groups(values: list[Any]) -> set[str]:
    groups: set[str] = set()
    for value in values:
        groups.update(skill_related_groups(_clean_str(value)))
    return {group for group in groups if group}


def _contains_keyword(text: str, keywords: set[str]) -> bool:
    normalized = _normalize_text(text)
    return any(keyword in normalized for keyword in keywords)


def _job_requirements(job_profile: JobProfile) -> list[JobRequirement]:
    return list(job_profile.critical_requirements) + list(job_profile.desirable_requirements)


def _matching_requirement(mapping: EvidenceMapping, requirement_name: str) -> RequirementMatch | None:
    target = _normalize_text(requirement_name)
    for match in mapping.requirement_matches:
        if _normalize_text(match.requirement) == target:
            return match
    return None


def _requirement_score(match: RequirementMatch) -> float:
    base = _STATUS_BASE_SCORES.get(match.match_status, Decimal("0"))
    match_type = _MATCH_TYPE_MULTIPLIERS.get(match.match_type, Decimal("0"))
    strength = _EVIDENCE_STRENGTH_MULTIPLIERS.get(match.evidence_strength, Decimal("0"))
    score = base * match_type * strength
    return _clamp_score(score)


def _profile_confidence_factor(value: str) -> Decimal:
    return _EVIDENCE_CONFIDENCE_FACTORS.get(value, Decimal("0.40"))


def _normalize_weights(job_profile: JobProfile) -> dict[str, Decimal]:
    source = job_profile.adaptive_weights or AREA_WEIGHTS.get(job_profile.area, DEFAULT_WEIGHTS)
    filtered = {
        key: Decimal(str(value))
        for key, value in source.items()
        if key in {
            "technical_competencies",
            "practical_experience",
            "role_fit",
            "seniority_alignment",
            "education",
            "leadership_evidence",
        }
    }
    if not filtered:
        filtered = {key: Decimal(str(value)) for key, value in DEFAULT_WEIGHTS.items()}

    total = sum(filtered.values())
    if total <= 0:
        filtered = {key: Decimal(str(value)) for key, value in DEFAULT_WEIGHTS.items()}
        total = sum(filtered.values())

    return {key: (value / total) for key, value in filtered.items()}


def _area_family(area: str) -> str:
    return _AREA_FAMILIES.get(area, "other")


def _area_alignment_score(job_profile: JobProfile, candidate_profile: CandidateProfile) -> float:
    if candidate_profile.professional_area == job_profile.area:
        return 100.0
    if _area_family(candidate_profile.professional_area) == _area_family(job_profile.area):
        return 78.0
    if candidate_profile.professional_area == "other":
        return 60.0
    return 45.0


def _score_experience_signal(candidate_profile: CandidateProfile, job_profile: JobProfile) -> float:
    target_years = float(_SENIORITY_YEAR_HINTS.get(job_profile.target_level, Decimal("2")))
    candidate_years = max(0.0, float(candidate_profile.estimated_experience_years))
    if target_years <= 0:
        return 70.0 if candidate_years > 0 else 35.0

    ratio = candidate_years / target_years if target_years else 0.0
    if ratio >= 1.5:
        return 95.0
    if ratio >= 1.0:
        return 90.0
    if ratio >= 0.8:
        return 78.0
    if ratio >= 0.6:
        return 62.0
    if ratio >= 0.4:
        return 45.0
    return 25.0


def _score_tool_signal(tool: str, candidate_profile: CandidateProfile) -> tuple[float, str, str, str]:
    tool_group = _signal_group(tool)
    candidate_groups = _signal_groups(candidate_profile.tools_and_systems)
    skill_groups = _signal_groups([skill.name for skill in candidate_profile.evidenced_skills])
    all_groups = candidate_groups | skill_groups

    if tool_group and tool_group in all_groups:
        return 100.0, "meets", "direct", "high"

    normalized_tool = _normalize_text(tool)
    if normalized_tool in {group for group in all_groups if group}:
        return 95.0, "meets", "equivalent", "high"

    if any(tool_group and tool_group in _signal_group(value) for value in candidate_profile.tools_and_systems):
        return 90.0, "partially_meets", "equivalent", "medium"

    return 0.0, "not_evidenced", "absent", "none"


def _score_capability_signal(capability: str, candidate_profile: CandidateProfile) -> tuple[float, str, str, str]:
    capability_group = _signal_group(capability)
    candidate_groups = _signal_groups([cap.name for cap in candidate_profile.capabilities])
    leadership_groups = _signal_groups(candidate_profile.leadership_evidence)

    if capability_group and capability_group in candidate_groups:
        return 100.0, "meets", "direct", "high"

    if capability_group and capability_group in leadership_groups:
        return 88.0, "partially_meets", "equivalent", "medium"

    if capability_group == "customer_relations" and candidate_profile.business_impact_evidence:
        return 72.0, "partially_meets", "inferred", "low"

    return 40.0, "unclear", "inferred", "low"


def _score_responsibility_signal(job_profile: JobProfile, candidate_profile: CandidateProfile) -> float:
    responsibility_count = len(job_profile.responsibilities)
    if responsibility_count == 0:
        return 55.0

    base = _score_experience_signal(candidate_profile, job_profile)
    practical_bonus = min(20.0, len(candidate_profile.experiences) * 4.0)
    impact_bonus = min(15.0, len(candidate_profile.business_impact_evidence) * 5.0)
    responsibility_weight = min(15.0, responsibility_count * 3.0)
    return _clamp_score(
        Decimal(str(base)) * Decimal("0.55")
        + Decimal(str(45.0 + practical_bonus + impact_bonus + responsibility_weight)) * Decimal("0.45")
    )


def _score_education_signal(candidate_profile: CandidateProfile, job_profile: JobProfile) -> float:
    level = _highest_education_level(candidate_profile)
    base = float(_EDUCATION_SCORES.get(level, Decimal("20")))
    if level in {"bachelor", "postgraduate", "master", "phd"}:
        if job_profile.area in {"accounting", "financial"}:
            return min(100.0, base + 5.0)
        if job_profile.target_level in {"senior", "lead"}:
            return min(100.0, base + 3.0)
    return base


def _score_seniority_alignment(job_profile: JobProfile, candidate_profile: CandidateProfile, job_requires_leadership: bool) -> tuple[float, str | None]:
    job_level = job_profile.target_level if job_profile.target_level in _SENIORITY_ORDER else "mid"
    candidate_level = _normalize_text(candidate_profile.detected_level)
    candidate_level = candidate_level if candidate_level in _SENIORITY_ORDER else "mid"

    job_rank = _rank_seniority(job_level)
    candidate_rank = _rank_seniority(candidate_level)
    distance = abs(candidate_rank - job_rank)

    if distance == 0:
        score = 100.0
    elif distance == 1:
        score = 88.0 if candidate_rank >= job_rank else 78.0
    elif distance == 2:
        score = 82.0 if candidate_rank > job_rank else 60.0
    else:
        score = max(35.0, 100.0 - distance * 12.0)

    risk_point: str | None = None
    if candidate_rank >= job_rank + 2:
        risk_point = "sobrequalificacao_para_a_vaga"
        score = min(score, 90.0)

    if job_requires_leadership and candidate_rank < job_rank:
        score = max(0.0, score - 18.0)
        if risk_point is None:
            risk_point = "lideranca_nao_evidenciada_para_a_vaga"

    if job_requires_leadership and not candidate_profile.leadership_evidence and candidate_rank >= job_rank:
        score = max(0.0, score - 15.0)
        risk_point = risk_point or "lideranca_formal_nao_evidenciada"

    return _clamp_score(score), risk_point


def _score_leadership_signal(candidate_profile: CandidateProfile, job_profile: JobProfile) -> float:
    lead_count = len(candidate_profile.leadership_evidence)
    leadership_experiences = sum(1 for experience in candidate_profile.experiences if experience.is_leadership)
    mentoring_caps = sum(
        1
        for capability in candidate_profile.capabilities
        if _contains_keyword(capability.name, {"mentor", "mentoria", "lider", "lead", "gestao", "gestão"})
    )

    base = 25.0 + lead_count * 15.0 + leadership_experiences * 20.0 + mentoring_caps * 8.0
    if job_profile.target_level in {"lead", "senior"}:
        base += 8.0
    if job_profile.area == "leadership":
        base += 12.0
    return min(100.0, base)


def _recommend(match_score: float, critical_coverage: float, profile_completeness: float) -> str:
    if profile_completeness < 0.30:
        return "insufficient_data"
    if match_score >= 82.0 and critical_coverage >= 0.85:
        return "strong_match"
    if match_score >= 65.0 and critical_coverage >= 0.65:
        return "interview"
    if match_score >= 45.0:
        return "maybe"
    return "reject"


def _score_requirement_bucket(
    job_profile: JobProfile,
    candidate_profile: CandidateProfile,
    mapping: EvidenceMapping,
    requirement: JobRequirement,
) -> dict[str, Any]:
    match = _matching_requirement(mapping, requirement.name)
    if match is None:
        match = RequirementMatch(
            requirement=requirement.name,
            requirement_type="critical" if requirement.is_mandatory else "desirable",
            match_status="not_evidenced",
            match_type="absent",
            evidence_quotes=[],
            evidence_strength="none",
            confidence="low",
            score_hint=0.0,
            explanation="Nenhuma evidência estruturada associada a este requisito.",
        )

    score = _requirement_score(match)
    dimension = _classify_requirement_dimension(job_profile, requirement)

    return {
        "name": requirement.name,
        "requirement_type": "critical" if requirement.is_mandatory else "desirable",
        "dimension": dimension,
        "score": score,
        "weight": float(requirement.importance_weight),
        "status": match.match_status,
        "match_type": match.match_type,
        "evidence_strength": match.evidence_strength,
        "confidence": match.confidence,
        "evidence_quotes": list(match.evidence_quotes),
        "score_hint": match.score_hint,
        "explanation": match.explanation,
    }


def _classify_requirement_dimension(job_profile: JobProfile, requirement: JobRequirement) -> str:
    text = f"{requirement.name} {requirement.description}"
    normalized = _normalize_text(text)

    if _contains_keyword(normalized, _LEADERSHIP_KEYWORDS) or job_profile.area == "leadership":
        return "leadership_evidence"
    if _contains_keyword(normalized, _EDUCATION_KEYWORDS):
        return "education"
    if job_profile.area in {"technology", "data"}:
        return "technical_competencies"
    if job_profile.area in {"administrative", "accounting", "financial", "commercial", "operational"}:
        return "practical_experience"
    return "role_fit"


def _job_requires_leadership(job_profile: JobProfile) -> bool:
    if job_profile.target_level in {"lead"}:
        return True
    if job_profile.area == "leadership":
        return True
    if any(_contains_keyword(signal, _LEADERSHIP_KEYWORDS) for signal in job_profile.seniority_signals):
        return True
    if any(
        _contains_keyword(requirement.name, _LEADERSHIP_KEYWORDS) or _contains_keyword(requirement.description, _LEADERSHIP_KEYWORDS)
        for requirement in _job_requirements(job_profile)
    ):
        return True
    return False


class AdaptiveScorerService:
    """
    Calcula o score final de compatibilidade de forma determinística e auditável.

    O serviço depende apenas de perfis estruturados e do EvidenceMapping, sem IA.
    """

    def score(
        self,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
        evidence_mapping: EvidenceMapping,
    ) -> AdaptiveScoreResult:
        weights = _normalize_weights(job_profile)
        job_requires_leadership = _job_requires_leadership(job_profile)

        requirement_items: list[dict[str, Any]] = []
        dimension_buckets: dict[str, list[dict[str, Any]]] = {
            "technical_competencies": [],
            "practical_experience": [],
            "role_fit": [],
            "seniority_alignment": [],
            "education": [],
            "leadership_evidence": [],
        }

        critical_items: list[dict[str, Any]] = []
        desirable_items: list[dict[str, Any]] = []

        for requirement in _job_requirements(job_profile):
            item = _score_requirement_bucket(job_profile, candidate_profile, evidence_mapping, requirement)
            requirement_items.append(item)
            dimension_buckets[item["dimension"]].append(item)
            if item["requirement_type"] == "critical":
                critical_items.append(item)
            else:
                desirable_items.append(item)

        technical_tools = [tool for tool in job_profile.required_tools]
        technical_profile_score = _score_technical_profile(job_profile, candidate_profile)
        for tool in technical_tools:
            score, status, match_type, strength = _score_tool_signal(tool, candidate_profile)
            item = {
                "name": tool,
                "requirement_type": "tool",
                "dimension": "technical_competencies",
                "score": score,
                "weight": 1.0,
                "status": status,
                "match_type": match_type,
                "evidence_strength": strength,
                "confidence": "high" if score >= 90 else "medium" if score >= 65 else "low",
                "evidence_quotes": [tool] if score >= 90 else [],
                "score_hint": score,
                "explanation": f"Avaliação determinística da ferramenta '{tool}'.",
            }
            requirement_items.append(item)
            dimension_buckets["technical_competencies"].append(item)

        capability_profile_score = _score_role_fit_profile(job_profile, candidate_profile)
        for capability in job_profile.required_capabilities:
            score, status, match_type, strength = _score_capability_signal(capability, candidate_profile)
            dimension = "leadership_evidence" if _contains_keyword(capability, _LEADERSHIP_KEYWORDS) else "role_fit"
            item = {
                "name": capability,
                "requirement_type": "capability",
                "dimension": dimension,
                "score": score,
                "weight": 1.0,
                "status": status,
                "match_type": match_type,
                "evidence_strength": strength,
                "confidence": "high" if score >= 90 else "medium" if score >= 65 else "low",
                "evidence_quotes": [capability] if score >= 90 else [],
                "score_hint": score,
                "explanation": f"Avaliação determinística da capacidade '{capability}'.",
            }
            requirement_items.append(item)
            dimension_buckets[dimension].append(item)

        responsibility_profile_score = _score_responsibility_signal(job_profile, candidate_profile)
        responsibility_item = {
            "name": "responsibilities_coverage",
            "requirement_type": "responsibility",
            "dimension": "practical_experience",
            "score": responsibility_profile_score,
            "weight": max(1.0, float(len(job_profile.responsibilities) or 1)),
            "status": "meets" if responsibility_profile_score >= 65 else "partially_meets" if responsibility_profile_score >= 40 else "unclear",
            "match_type": "inferred",
            "evidence_strength": "medium" if responsibility_profile_score >= 65 else "low",
            "confidence": "medium" if responsibility_profile_score >= 65 else "low",
            "evidence_quotes": list(candidate_profile.business_impact_evidence[:2]),
            "score_hint": responsibility_profile_score,
            "explanation": "Cobertura inferida a partir de experiência prática, impacto e volume de histórico profissional.",
        }
        requirement_items.append(responsibility_item)
        dimension_buckets["practical_experience"].append(responsibility_item)

        seniority_profile_score, seniority_risk = _score_seniority_alignment(
            job_profile,
            candidate_profile,
            job_requires_leadership,
        )
        seniority_item = {
            "name": "seniority_alignment",
            "requirement_type": "capability",
            "dimension": "seniority_alignment",
            "score": seniority_profile_score,
            "weight": 1.0,
            "status": "meets" if seniority_profile_score >= 80 else "partially_meets" if seniority_profile_score >= 60 else "unclear",
            "match_type": "inferred",
            "evidence_strength": "high" if seniority_profile_score >= 80 else "medium" if seniority_profile_score >= 60 else "low",
            "confidence": "high" if seniority_profile_score >= 80 else "medium" if seniority_profile_score >= 60 else "low",
            "evidence_quotes": [],
            "score_hint": seniority_profile_score,
            "explanation": "Alinhamento entre senioridade alvo e senioridade detectada no candidato.",
        }
        requirement_items.append(seniority_item)
        dimension_buckets["seniority_alignment"].append(seniority_item)

        education_profile_score = _score_education_signal(candidate_profile, job_profile)
        education_item = {
            "name": "education_profile",
            "requirement_type": "desirable",
            "dimension": "education",
            "score": education_profile_score,
            "weight": 1.0,
            "status": "meets" if education_profile_score >= 70 else "partially_meets" if education_profile_score >= 50 else "unclear",
            "match_type": "inferred",
            "evidence_strength": "medium" if education_profile_score >= 70 else "low",
            "confidence": "medium" if education_profile_score >= 70 else "low",
            "evidence_quotes": [],
            "score_hint": education_profile_score,
            "explanation": "Nível educacional inferido a partir da formação formal do candidato.",
        }
        requirement_items.append(education_item)
        dimension_buckets["education"].append(education_item)

        leadership_profile_score = _score_leadership_signal(candidate_profile, job_profile)
        leadership_item = {
            "name": "leadership_evidence",
            "requirement_type": "capability",
            "dimension": "leadership_evidence",
            "score": leadership_profile_score,
            "weight": 1.0,
            "status": "meets" if leadership_profile_score >= 75 else "partially_meets" if leadership_profile_score >= 45 else "unclear",
            "match_type": "inferred",
            "evidence_strength": "high" if leadership_profile_score >= 75 else "medium" if leadership_profile_score >= 45 else "low",
            "confidence": "medium" if leadership_profile_score >= 45 else "low",
            "evidence_quotes": list(candidate_profile.leadership_evidence[:2]),
            "score_hint": leadership_profile_score,
            "explanation": "Sinais de liderança inferidos de liderança formal, mentoria e evidências de cargo.",
        }
        requirement_items.append(leadership_item)
        dimension_buckets["leadership_evidence"].append(leadership_item)

        dimension_scores = {
            "technical_competencies": _blend_dimension(
                dimension_buckets["technical_competencies"],
                technical_profile_score,
            ),
            "practical_experience": _blend_dimension(
                dimension_buckets["practical_experience"],
                _score_practical_profile(job_profile, candidate_profile),
            ),
            "role_fit": _blend_dimension(
                dimension_buckets["role_fit"],
                capability_profile_score,
            ),
            "seniority_alignment": _blend_dimension(
                dimension_buckets["seniority_alignment"],
                seniority_profile_score,
            ),
            "education": _blend_dimension(
                dimension_buckets["education"],
                education_profile_score,
            ),
            "leadership_evidence": _blend_dimension(
                dimension_buckets["leadership_evidence"],
                leadership_profile_score,
            ),
        }

        final_match_score = sum(
            float(weights.get(dim, Decimal("0"))) * dimension_scores[dim]
            for dim in dimension_scores
            if dim in weights
        )

        critical_coverage = _coverage_score(critical_items)
        desirable_coverage = _coverage_score(desirable_items)

        recommendation = _recommend(
            final_match_score,
            critical_coverage,
            candidate_profile.profile_completeness,
        )

        if candidate_profile.profile_completeness < 0.30:
            recommendation = "insufficient_data"

        confidence_score = _confidence_score(
            candidate_profile=candidate_profile,
            job_profile=job_profile,
            evidence_mapping=evidence_mapping,
            requirement_items=requirement_items,
        )

        strengths, gaps, risk_points = _compose_insights(
            requirement_items=requirement_items,
            critical_items=critical_items,
            desirable_items=desirable_items,
            candidate_profile=candidate_profile,
            job_profile=job_profile,
            overqualification_risk=seniority_risk,
            seniority_risk=seniority_risk,
            job_requires_leadership=job_requires_leadership,
        )

        score_breakdown = {
            "weights": {key: float(value) for key, value in weights.items()},
            "dimensions": {
                key: {
                    "score": round(value, 2),
                    "weight": float(weights.get(key, Decimal("0"))),
                    "weighted_contribution": round(value * float(weights.get(key, Decimal("0"))), 2),
                }
                for key, value in dimension_scores.items()
            },
            "items": requirement_items,
            "coverage": {
                "critical": round(critical_coverage, 4),
                "desirable": round(desirable_coverage, 4),
            },
            "confidence_factors": {
                "candidate_profile_completeness": round(float(candidate_profile.profile_completeness), 4),
                "job_profile_completeness": round(float(job_profile.job_completeness_score), 4),
                "evidence_mapping_confidence": evidence_mapping.confidence,
                "evidence_density": round(_evidence_density(requirement_items), 4),
            },
            "profile_signals": {
                "technical_competencies": round(technical_profile_score, 2),
                "practical_experience": round(_score_practical_profile(job_profile, candidate_profile), 2),
                "role_fit": round(capability_profile_score, 2),
                "seniority_alignment": round(seniority_profile_score, 2),
                "education": round(education_profile_score, 2),
                "leadership_evidence": round(leadership_profile_score, 2),
            },
            "recommendation_rules": {
                "strong_match": {"match_score": 82, "critical_coverage": 0.85},
                "interview": {"match_score": 65, "critical_coverage": 0.65},
                "maybe": {"match_score": 45},
            },
        }

        logger.info(
            "adaptive_score_generated",
            area=job_profile.area,
            target_level=job_profile.target_level,
            detected_level=candidate_profile.detected_level,
            match_score=round(final_match_score, 2),
            confidence_score=round(confidence_score, 2),
            recommendation=recommendation,
            critical_coverage=round(critical_coverage, 4),
            desirable_coverage=round(desirable_coverage, 4),
        )

        return AdaptiveScoreResult(
            match_score=final_match_score,
            confidence_score=confidence_score,
            recommendation=recommendation,
            score_breakdown=score_breakdown,
            strengths=strengths,
            gaps=gaps,
            risk_points=risk_points,
            critical_coverage=critical_coverage,
            desirable_coverage=desirable_coverage,
            area=job_profile.area,
            target_level=job_profile.target_level,
            detected_level=candidate_profile.detected_level,
        )


def _blend_dimension(items: list[dict[str, Any]], profile_signal: float) -> float:
    if not items:
        return round(profile_signal, 2)

    total_weight = sum(float(item.get("weight", 1.0)) for item in items)
    weighted_items = (
        sum(float(item["score"]) * float(item.get("weight", 1.0)) for item in items) / total_weight
        if total_weight > 0
        else profile_signal
    )
    blended = (weighted_items * 0.70) + (profile_signal * 0.30)
    return round(_clamp_score(blended), 2)


def _coverage_score(items: list[dict[str, Any]]) -> float:
    if not items:
        return 1.0

    total_weight = sum(float(item.get("weight", 1.0)) for item in items)
    if total_weight <= 0:
        return 0.0

    normalized = sum((float(item["score"]) / 100.0) * float(item.get("weight", 1.0)) for item in items) / total_weight
    return max(0.0, min(1.0, normalized))


def _confidence_score(
    *,
    candidate_profile: CandidateProfile,
    job_profile: JobProfile,
    evidence_mapping: EvidenceMapping,
    requirement_items: list[dict[str, Any]],
) -> float:
    evidence_density = _evidence_density(requirement_items)
    mapping_confidence = _profile_confidence_factor(evidence_mapping.confidence)
    score = (
        Decimal(str(candidate_profile.profile_completeness)) * Decimal("0.35")
        + Decimal(str(job_profile.job_completeness_score)) * Decimal("0.25")
        + mapping_confidence * Decimal("0.20")
        + Decimal(str(evidence_density)) * Decimal("0.20")
    ) * Decimal("100")
    return round(_clamp_score(score), 2)


def _evidence_density(items: list[dict[str, Any]]) -> float:
    if not items:
        return 0.25
    covered = sum(1 for item in items if float(item.get("score", 0.0)) > 0.0)
    return covered / len(items)


def _score_technical_profile(job_profile: JobProfile, candidate_profile: CandidateProfile) -> float:
    job_signals = {_signal_group(tool) for tool in job_profile.required_tools if _signal_group(tool)}
    candidate_signals = _signal_groups(candidate_profile.tools_and_systems)
    candidate_signals |= _signal_groups([skill.name for skill in candidate_profile.evidenced_skills])

    if not job_signals:
        if candidate_signals:
            return 65.0
        return 40.0

    overlap = job_signals & candidate_signals
    ratio = len(overlap) / len(job_signals)
    if ratio >= 1.0:
        return 100.0
    if ratio >= 0.75:
        return 90.0
    if ratio >= 0.5:
        return 75.0
    if ratio >= 0.25:
        return 55.0
    return 30.0


def _score_role_fit_profile(job_profile: JobProfile, candidate_profile: CandidateProfile) -> float:
    job_signals = {_signal_group(capability) for capability in job_profile.required_capabilities if _signal_group(capability)}
    candidate_signals = _signal_groups([capability.name for capability in candidate_profile.capabilities])

    overlap = job_signals & candidate_signals
    capability_ratio = len(overlap) / len(job_signals) if job_signals else 0.5
    area_alignment = _area_alignment_score(job_profile, candidate_profile)

    if not job_signals:
        return round((area_alignment * 0.70) + (min(100.0, len(candidate_profile.capabilities) * 18.0 + 40.0) * 0.30), 2)

    capability_signal = 100.0 if capability_ratio >= 1.0 else 85.0 if capability_ratio >= 0.75 else 70.0 if capability_ratio >= 0.5 else 50.0 if capability_ratio >= 0.25 else 30.0
    return round((area_alignment * 0.45) + (capability_signal * 0.55), 2)


def _score_practical_profile(job_profile: JobProfile, candidate_profile: CandidateProfile) -> float:
    experience_signal = _score_experience_signal(candidate_profile, job_profile)
    responsibility_signal = _score_responsibility_signal(job_profile, candidate_profile)
    return round((experience_signal * 0.60) + (responsibility_signal * 0.40), 2)


def _compose_insights(
    *,
    requirement_items: list[dict[str, Any]],
    critical_items: list[dict[str, Any]],
    desirable_items: list[dict[str, Any]],
    candidate_profile: CandidateProfile,
    job_profile: JobProfile,
    overqualification_risk: str | None,
    seniority_risk: str | None,
    job_requires_leadership: bool,
) -> tuple[list[str], list[str], list[str]]:
    strengths: list[str] = []
    gaps: list[str] = []
    risk_points: list[str] = []

    for item in requirement_items:
        score = float(item.get("score", 0.0))
        name = str(item.get("name", "")).strip()
        if score >= 80:
            strengths.append(name)
        elif item.get("requirement_type") in {"critical", "desirable", "tool", "capability"} and score < 50:
            gaps.append(name)

    for item in critical_items:
        if float(item.get("score", 0.0)) < 65.0:
            gaps.append(str(item.get("name", "")).strip())

    for item in desirable_items:
        if float(item.get("score", 0.0)) >= 75.0:
            strengths.append(str(item.get("name", "")).strip())

    strengths.extend(candidate_profile.business_impact_evidence[:2])
    strengths.extend(candidate_profile.leadership_evidence[:1])

    if overqualification_risk:
        risk_points.append("sobrequalificacao_detectada")
    if seniority_risk:
        risk_points.append(seniority_risk)
    if job_requires_leadership and not candidate_profile.leadership_evidence:
        risk_points.append("lideranca_formal_nao_evidenciada")
    if candidate_profile.profile_completeness < 0.30:
        risk_points.append("curriculo_incompleto")
    if job_profile.job_completeness_score < 0.50:
        risk_points.append("vaga_incompleta")

    return _dedupe(strengths), _dedupe(gaps), _dedupe(risk_points)
