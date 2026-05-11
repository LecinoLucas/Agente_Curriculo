from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class SkillEvidenceBreakdownInput:
    job_minimum_education_level: str | None
    result_highest_education_level: str | None
    skill_scores: dict[str, Any]
    partial_matches: list[dict[str, Any]]
    weak_evidence_priority_skills: list[str]
    validation_status: str
    validation_reasons: list[str]
    failed_rule: str | None
    failed_dimension: str | None
    eligibility_status: str
    candidate_years: Decimal | None
    required_years: Decimal | None
    priority_matched: int
    total_priority: int
    complementary_matched: int
    total_complementary: int
    eliminatory_matched: int
    total_eliminatory: int
    priority_component_impact: Decimal
    complementary_component_impact: Decimal
    experience_component_impact: Decimal
    seniority_component_impact: Decimal
    has_domain_evidence: bool
    score_version: str


def build_skill_evidence_breakdown(
    data: SkillEvidenceBreakdownInput,
) -> dict[str, Any]:
    skill_scores = data.skill_scores
    return {
        "partial_matches": data.partial_matches,
        "priority_score_weighted": float(skill_scores["priority_score_weighted"]),
        "complementary_score_weighted": float(skill_scores["complementary_score_weighted"]),
        "complementary_score_raw_weighted": float(skill_scores["complementary_score_raw_weighted"]),
        "priority_strong_coverage": float(skill_scores["priority_strong_coverage"]),
        "eliminatory_score_weighted": float(skill_scores["eliminatory_score_weighted"]),
        "score_version": data.score_version,
        "validation_status": data.validation_status,
        "validation_reasons": list(data.validation_reasons),
        "failed_rule": data.failed_rule,
        "failed_dimension": data.failed_dimension,
        "matched_priority_skills": list(skill_scores["matched_priority_skill_names"]),
        "missing_priority_skills": list(skill_scores["missing_skill_names"]),
        "matched_complementary_skills": list(skill_scores["matched_complementary_skill_names"]),
        "missing_complementary_skills": list(skill_scores["missing_complementary_skill_names"]),
        "matched_eliminatory_skills": list(skill_scores["matched_eliminatory_skill_names"]),
        "missing_eliminatory_skills": list(skill_scores["missing_eliminatory_skill_names"]),
        "weak_evidence_priority_skills": list(data.weak_evidence_priority_skills),
        "skill_evidence_details": list(skill_scores["skill_evidence_details"]),
        "education_detected": data.result_highest_education_level,
        "minimum_education_required": data.job_minimum_education_level,
        "experience_detected": float(data.candidate_years) if data.candidate_years is not None else None,
        "minimum_experience_required": float(data.required_years) if data.required_years is not None else None,
        "eligibility_status": data.eligibility_status,
        "priority_skills_matched": data.priority_matched,
        "priority_skills_total": data.total_priority,
        "complementary_skills_matched": data.complementary_matched,
        "complementary_skills_total": data.total_complementary,
        "eliminatory_skills_matched": data.eliminatory_matched,
        "eliminatory_skills_total": data.total_eliminatory,
        "complementary_bonus_cap_slots": skill_scores["complementary_bonus_cap_slots"],
        "priority_component_impact": float(data.priority_component_impact),
        "complementary_component_impact": float(data.complementary_component_impact),
        "experience_component_impact": float(data.experience_component_impact),
        "seniority_component_impact": float(data.seniority_component_impact),
        "has_domain_evidence": data.has_domain_evidence,
    }
