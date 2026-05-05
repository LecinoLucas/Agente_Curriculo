from decimal import Decimal

from src.application.services.candidate_ranking_service import (
    _compute_breakdown,
    _is_outdated_match_row,
    _normalize_reason_codes,
    _normalize_score_breakdown,
)
from src.infrastructure.database.models.job_model import JobModel


class _SkillRow:
    def __init__(self, skill_name: str, *, is_mandatory: bool) -> None:
        self.skill_name = skill_name
        self.JobRequiredSkillModel = type("Link", (), {"is_mandatory": is_mandatory})()


def test_normalize_score_breakdown_fills_missing_validation_penalty_score() -> None:
    breakdown = _normalize_score_breakdown(
        {
            "skill_match_score": "82.5",
            "experience_match_score": 71,
            "seniority_match_score": 64.25,
            "education_score": 50,
            "confidence_score": 74,
            "ai_confidence_score": 90,
            "penalty_score": 7,
            "final_score": 71.5,
        }
    )

    assert breakdown["confidence_score"] == Decimal("74.00")
    assert breakdown["validation_penalty_score"] == Decimal("0.00")
    assert breakdown["final_score"] == Decimal("71.50")


def test_normalize_reason_codes_preserves_match_metadata() -> None:
    reason_codes = _normalize_reason_codes(
        [
            {
                "type": "deal_breaker",
                "field": "location",
                "impact": -100,
                "description": "Vaga requer São Paulo",
                "expected": "São Paulo",
                "actual": "Rio de Janeiro",
                "reason": "Falha na regra da vaga",
            }
        ]
    )

    assert reason_codes[0]["type"] == "deal_breaker"
    assert reason_codes[0]["impact"] == -100.0
    assert reason_codes[0]["expected"] == "São Paulo"
    assert reason_codes[0]["actual"] == "Rio de Janeiro"
    assert reason_codes[0]["reason"] == "Falha na regra da vaga"


def test_compute_breakdown_uses_persisted_match_score_without_ai_influence() -> None:
    job = JobModel(
        title="Data Analyst",
        description="Test",
        status="published",
    )
    job.minimum_years_experience = Decimal("5")
    job.minimum_education_level = "bachelor"
    job.seniority_level = "mid"
    job.deal_breakers = []

    breakdown = _compute_breakdown(
        row={
            "overall_score": Decimal("68.40"),
            "matched_skills": ["Python", "SQL"],
            "missing_skills": ["Excel"],
            "candidate_skills": ["Python", "SQL"],
            "total_experience_years": Decimal("5"),
            "seniority_level": "mid",
            "education_level": "bachelor",
            "validation_status": "pass",
        },
        job=job,
        job_skill_rows=[
            _SkillRow("Python", is_mandatory=True),
            _SkillRow("SQL", is_mandatory=True),
            _SkillRow("Excel", is_mandatory=True),
        ],
        outdated=False,
    )

    assert breakdown["final_score"] == Decimal("68.40")
    assert breakdown["confidence_score"] == Decimal("100.00")
    assert breakdown["ai_confidence_score"] == Decimal("100.00")
    assert breakdown["skill_match_score"] == Decimal("50.00")


def test_outdated_match_row_detects_legacy_score_without_structured_requirements() -> None:
    job = JobModel(
        title="Generic Job",
        description="Test",
        status="published",
    )
    job.seniority_level = None
    job.minimum_years_experience = None
    job.minimum_education_level = None
    job.deal_breakers = []

    assert _is_outdated_match_row(
        row={"overall_score": Decimal("57.30")},
        job=job,
        job_skill_rows=[],
    ) is True
