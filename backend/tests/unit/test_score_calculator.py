"""
Testes unitários para ScoreCalculator e Score.
Cobrem: Decimal puro, score clamp, skill matching, pesos, liderança, educação.
"""
from decimal import Decimal

import pytest

from src.domain.services.score_calculator import ExtractedResumeData, ScoreCalculator
from src.domain.value_objects.score import Score


# ── Score value object ────────────────────────────────────────────────────────

def test_score_of_clamp_above_100() -> None:
    assert Score.of(150).value == Decimal("100.00")


def test_score_of_clamp_below_zero() -> None:
    assert Score.of(-10).value == Decimal("0.00")


def test_score_of_accepts_decimal_directly() -> None:
    s = Score.of(Decimal("72.5"))
    assert s.value == Decimal("72.50")


def test_score_of_no_float_arithmetic_imprecision() -> None:
    # 0.1 + 0.2 in float = 0.30000000000000004; via Decimal(str) it must round correctly.
    s = Score.of(Decimal("0.1") + Decimal("0.2"))
    assert s.value == Decimal("0.30")


def test_score_weighted_returns_decimal() -> None:
    s = Score.of(Decimal("50"))
    result = s.weighted(Decimal("0.40"))
    assert isinstance(result, Decimal)
    assert result == Decimal("20.00")


def test_score_label_uses_decimal_comparison() -> None:
    assert Score.of(Decimal("90")).label == "Excepcional"
    assert Score.of(Decimal("75")).label == "Forte"
    assert Score.of(Decimal("60")).label == "Bom"
    assert Score.of(Decimal("45")).label == "Regular"
    assert Score.of(Decimal("30")).label == "Fraco"
    assert Score.of(Decimal("29")).label == "Insuficiente"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _minimal_data(**kwargs) -> ExtractedResumeData:
    defaults = dict(
        total_experience_months=36,
        experiences=[],
        employment_gaps=[],
        skills=[],
        skill_categories=[],
        highest_education_level="bachelor",
        education_field_relevance="medium",
        certifications=[],
        communication_quality={},
        leadership_indicators={},
    )
    defaults.update(kwargs)
    return ExtractedResumeData(**defaults)


# ── ScoreCalculator ───────────────────────────────────────────────────────────

def test_overall_score_is_decimal() -> None:
    calc = ScoreCalculator()
    result = calc.calculate(_minimal_data())
    assert isinstance(result.overall.value, Decimal)


def test_overall_never_exceeds_100() -> None:
    calc = ScoreCalculator()
    data = _minimal_data(
        total_experience_months=240,
        skills=[{"name": "Python", "proficiency_level": "expert", "years_experience": 15}],
        skill_categories=["backend"] * 8,
        certifications=[{}] * 10,
        communication_quality={"structure": 100, "clarity": 100, "professionalism": 100, "completeness": 100},
        leadership_indicators={
            "has_management": True, "has_project_lead": True,
            "has_mentoring": True, "has_cross_team": True,
        },
    )
    result = calc.calculate(data)
    assert result.overall.value <= Decimal("100")


def test_no_skills_returns_minimal_technical_score() -> None:
    calc = ScoreCalculator()
    result = calc.calculate(_minimal_data(skills=[]))
    assert result.technical.value == Decimal("5.00")


def test_education_bachelor_high_relevance_two_certs() -> None:
    calc = ScoreCalculator()
    data = _minimal_data(
        certifications=[{}, {}],
        education_field_relevance="high",
        highest_education_level="bachelor",
    )
    result = calc.calculate(data)
    # 62 (bachelor) + 10 (high) + 5 (2*2.5) = 77
    assert result.education.value == Decimal("77.00")


def test_leadership_all_indicators_scores_100() -> None:
    calc = ScoreCalculator()
    data = _minimal_data(leadership_indicators={
        "has_management": True,
        "has_project_lead": True,
        "has_mentoring": True,
        "has_cross_team": True,
    })
    result = calc.calculate(data)
    assert result.leadership.value == Decimal("100.00")


def test_leadership_no_indicators_scores_zero() -> None:
    calc = ScoreCalculator()
    result = calc.calculate(_minimal_data(leadership_indicators={}))
    assert result.leadership.value == Decimal("0.00")


def test_employment_gap_penalty_applied() -> None:
    calc = ScoreCalculator()
    base_data = _minimal_data(total_experience_months=60, employment_gaps=[])
    gap_data = _minimal_data(total_experience_months=60, employment_gaps=[{"duration_months": 8}])
    base_score = calc.calculate(base_data).experience.value
    gap_score = calc.calculate(gap_data).experience.value
    assert gap_score < base_score


def test_gap_below_threshold_not_penalized() -> None:
    calc = ScoreCalculator()
    no_penalty = _minimal_data(total_experience_months=60, employment_gaps=[{"duration_months": 6}])
    result = calc.calculate(no_penalty)
    # gap of 6 months is NOT > 6, so no penalty
    base = _minimal_data(total_experience_months=60, employment_gaps=[])
    assert calc.calculate(no_penalty).experience.value == calc.calculate(base).experience.value


def test_overall_score_quantized_to_two_places() -> None:
    calc = ScoreCalculator()
    result = calc.calculate(_minimal_data(
        communication_quality={"structure": 33, "clarity": 33, "professionalism": 33, "completeness": 33}
    ))
    # value must have exactly 2 decimal places
    assert result.overall.value == result.overall.value.quantize(Decimal("0.01"))
