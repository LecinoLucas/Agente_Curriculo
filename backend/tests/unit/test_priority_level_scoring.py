from decimal import Decimal
from types import SimpleNamespace

from src.application.services.candidate_ranking_service import _compute_breakdown


def _skill_row(name: str, *, priority_level: str) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=name,
        JobRequiredSkillModel=SimpleNamespace(priority_level=priority_level),
    )


def _job(*, skill_requirements: dict[str, list[str]] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        minimum_years_experience=Decimal("4"),
        minimum_education_level="bachelor",
        seniority_level="mid",
        deal_breakers=[],
        skill_requirements=skill_requirements or {
            "priority": [],
            "complementary": [],
            "eliminatory": [],
        },
    )


def _row_payload(
    *,
    matched_skills: list[str],
    missing_priority_skills: list[str] | None = None,
    missing_complementary_skills: list[str] | None = None,
    missing_eliminatory_skills: list[str] | None = None,
    priority_score: float,
    complementary_score: float,
) -> dict:
    return {
        "matched_skills": matched_skills,
        "missing_skills": list(missing_priority_skills or []),
        "candidate_skills": matched_skills,
        "total_experience_years": 5,
        "education_level": "bachelor",
        "seniority_level": "mid",
        "skill_evidence_breakdown": {
            "priority_score_weighted": priority_score,
            "complementary_score_weighted": complementary_score,
            "complementary_score_raw_weighted": complementary_score,
            "priority_strong_coverage": priority_score,
            "matched_priority_skills": [skill for skill in matched_skills if skill in {"Python", "Node.js"}],
            "missing_priority_skills": list(missing_priority_skills or []),
            "matched_complementary_skills": [skill for skill in matched_skills if skill not in {"Python", "Node.js", "React"}],
            "missing_complementary_skills": list(missing_complementary_skills or []),
            "matched_eliminatory_skills": [skill for skill in matched_skills if skill == "React"],
            "missing_eliminatory_skills": list(missing_eliminatory_skills or []),
            "validation_reasons": [],
        },
    }


def test_priority_component_outweighs_complementary_component() -> None:
    breakdown = _compute_breakdown(
        row=_row_payload(
            matched_skills=["Python", "Docker"],
            priority_score=100,
            complementary_score=100,
        ),
        job=_job(),
        job_skill_rows=[
            _skill_row("Python", priority_level="priority"),
            _skill_row("Docker", priority_level="complementary"),
        ],
    )

    assert breakdown["priority_component_impact"] > breakdown["complementary_component_impact"]


def test_missing_complementary_skills_does_not_crush_score_when_priority_is_strong() -> None:
    breakdown = _compute_breakdown(
        row=_row_payload(
            matched_skills=["Python", "Node.js"],
            missing_complementary_skills=[
                "React",
                "TypeScript",
                "PostgreSQL",
                "Redis",
                "GraphQL",
                "Docker",
            ],
            priority_score=100,
            complementary_score=0,
        ),
        job=_job(),
        job_skill_rows=[
            _skill_row("Python", priority_level="priority"),
            _skill_row("Node.js", priority_level="priority"),
            _skill_row("React", priority_level="complementary"),
            _skill_row("TypeScript", priority_level="complementary"),
            _skill_row("PostgreSQL", priority_level="complementary"),
            _skill_row("Redis", priority_level="complementary"),
            _skill_row("GraphQL", priority_level="complementary"),
            _skill_row("Docker", priority_level="complementary"),
        ],
    )

    assert breakdown["final_score"] >= Decimal("65.00")
    assert breakdown["eligibility_status"] == "PASS"


def test_missing_eliminatory_skill_applies_fail_cap() -> None:
    breakdown = _compute_breakdown(
        row=_row_payload(
            matched_skills=["Python"],
            missing_eliminatory_skills=["React"],
            priority_score=100,
            complementary_score=0,
        ),
        job=_job(skill_requirements={"priority": ["Python"], "complementary": [], "eliminatory": ["React"]}),
        job_skill_rows=[
            _skill_row("Python", priority_level="priority"),
            _skill_row("React", priority_level="eliminatory"),
        ],
    )

    assert breakdown["eligibility_status"] == "FAIL"
    assert breakdown["cap_reason"] == "missing_eliminatory_skills"
    assert breakdown["final_score"] <= Decimal("24.00")


def test_missing_priority_skill_reduces_score_without_auto_fail() -> None:
    breakdown = _compute_breakdown(
        row=_row_payload(
            matched_skills=["Docker"],
            missing_priority_skills=["Python"],
            priority_score=0,
            complementary_score=100,
        ),
        job=_job(skill_requirements={"priority": ["Python"], "complementary": ["Docker"], "eliminatory": []}),
        job_skill_rows=[
            _skill_row("Python", priority_level="priority"),
            _skill_row("Docker", priority_level="complementary"),
        ],
    )

    assert breakdown["final_score"] < Decimal("70.00")
    assert breakdown["eligibility_status"] == "PASS"
    assert breakdown["cap_reason"] is None
