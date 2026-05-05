from decimal import Decimal
from types import SimpleNamespace

from src.application.services.canonical_match_explanation_service import (
    build_match_explanation,
)


def _make_row(skill_name: str, *, is_mandatory: bool) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=[],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


def _make_job(
    *,
    seniority: str | None = "mid",
    minimum_years_experience: Decimal | None = None,
    minimum_education_level: str | None = None,
    deal_breakers: list[dict] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        seniority_level=seniority,
        minimum_years_experience=minimum_years_experience,
        minimum_education_level=minimum_education_level,
        deal_breakers=deal_breakers or [],
    )


def _make_result(
    *,
    seniority: str | None = "mid",
    overall_score: Decimal = Decimal("70"),
    total_experience_years: Decimal | None = None,
    highest_education_level: str | None = None,
    location: str | None = None,
    work_model: str | None = None,
) -> SimpleNamespace:
    extracted_candidate = {}
    if location is not None:
        extracted_candidate["location"] = location
    if work_model is not None:
        extracted_candidate["work_model"] = work_model

    return SimpleNamespace(
        seniority_level=seniority,
        overall_score=overall_score,
        total_experience_years=total_experience_years,
        highest_education_level=highest_education_level,
        extracted_data={"candidate": extracted_candidate},
    )


def test_build_match_explanation_for_strong_candidate() -> None:
    explanation = build_match_explanation(
        job=_make_job(seniority="senior", minimum_years_experience=Decimal("5")),
        analysis_result=_make_result(
            seniority="senior",
            overall_score=Decimal("88"),
            total_experience_years=Decimal("8"),
            highest_education_level="bachelor",
        ),
        job_skill_rows=[
            _make_row("Python", is_mandatory=True),
            _make_row("SQL", is_mandatory=True),
            _make_row("Docker", is_mandatory=True),
            _make_row("AWS", is_mandatory=False),
        ],
        final_score=Decimal("87.50"),
        recommendation="strong_match",
        matched_skills=["Python", "SQL", "Docker", "AWS"],
        missing_skills=[],
    )

    assert explanation.recommendation == "strong_match"
    assert explanation.breakdown["mandatory"] is not None
    assert explanation.breakdown["mandatory"].score == Decimal("100.00")
    assert any("skills obrigatórias" in item.lower() for item in explanation.highlights)
    assert any("experiência atende" in item.lower() for item in explanation.highlights)


def test_build_match_explanation_for_medium_candidate() -> None:
    explanation = build_match_explanation(
        job=_make_job(seniority="mid", minimum_years_experience=Decimal("5")),
        analysis_result=_make_result(
            seniority="mid",
            overall_score=Decimal("70"),
            total_experience_years=Decimal("5"),
            highest_education_level="bachelor",
        ),
        job_skill_rows=[
            _make_row("Python", is_mandatory=True),
            _make_row("SQL", is_mandatory=True),
            _make_row("Docker", is_mandatory=True),
            _make_row("AWS", is_mandatory=True),
        ],
        final_score=Decimal("71.00"),
        recommendation="good_match",
        matched_skills=["Python", "SQL", "Docker"],
        missing_skills=["AWS"],
    )

    assert explanation.recommendation == "good_match"
    assert explanation.breakdown["experience"] is not None
    assert explanation.breakdown["experience"].score >= Decimal("80.00")
    assert any("skills obrigatórias faltantes" in item.lower() for item in explanation.risks)


def test_build_match_explanation_for_weak_candidate() -> None:
    explanation = build_match_explanation(
        job=_make_job(
            seniority="senior",
            minimum_years_experience=Decimal("5"),
            minimum_education_level="bachelor",
        ),
        analysis_result=_make_result(
            seniority="junior",
            overall_score=Decimal("60"),
            total_experience_years=Decimal("2"),
            highest_education_level="high_school",
        ),
        job_skill_rows=[
            _make_row("Python", is_mandatory=True),
            _make_row("SQL", is_mandatory=True),
            _make_row("Docker", is_mandatory=True),
            _make_row("AWS", is_mandatory=True),
        ],
        final_score=Decimal("39"),
        recommendation="not_match",
        matched_skills=["Python"],
        missing_skills=["SQL", "Docker", "AWS"],
    )

    assert explanation.recommendation == "not_match"
    assert explanation.validation_status == "fail"
    assert explanation.risks
    assert "bloqueio principal" in explanation.explanation.lower()


def test_build_match_explanation_lists_missing_mandatory_skills_as_risk() -> None:
    explanation = build_match_explanation(
        job=_make_job(seniority="mid", minimum_years_experience=Decimal("5")),
        analysis_result=_make_result(
            seniority="mid",
            overall_score=Decimal("75"),
            total_experience_years=Decimal("5"),
            highest_education_level="bachelor",
        ),
        job_skill_rows=[
            _make_row("Python", is_mandatory=True),
            _make_row("SQL", is_mandatory=True),
            _make_row("Docker", is_mandatory=True),
            _make_row("AWS", is_mandatory=False),
        ],
        final_score=Decimal("58"),
        recommendation="potential",
        matched_skills=["Python", "AWS"],
        missing_skills=["SQL", "Docker"],
    )

    assert any("sql" in item.lower() for item in explanation.risks)
    assert any("docker" in item.lower() for item in explanation.risks)


def test_build_match_explanation_for_job_without_requirements() -> None:
    explanation = build_match_explanation(
        job=_make_job(seniority=None),
        analysis_result=_make_result(
            seniority="senior",
            overall_score=Decimal("100"),
            total_experience_years=Decimal("10"),
            highest_education_level="master",
        ),
        job_skill_rows=[],
        final_score=Decimal("44"),
        recommendation="not_recommended",
        matched_skills=[],
        missing_skills=[],
    )

    assert explanation.final_score == Decimal("44.00")
    assert explanation.recommendation == "not_recommended"
    assert "vaga não possui requisitos estruturados" in explanation.explanation.lower()
