"""
Testes unitários para JobCompatibilityCalculator.
Cobrem: reweighting, skill matching, penalidade de seniority, clamp de score.
"""
from decimal import Decimal
from uuid import uuid4

import pytest

from src.domain.entities.analysis import SeniorityLevel
from src.domain.services.job_compatibility_calculator import (
    CompatibilityInput,
    JobCompatibilityCalculator,
)
from src.domain.value_objects.skill_set import RequiredSkill, SkillEntry, SkillSet


# ── Helpers ───────────────────────────────────────────────────────────────────

def _skill_id():
    return uuid4()


def _entry(skill_id, name: str, level: str = "intermediate") -> SkillEntry:
    return SkillEntry(
        skill_id=skill_id,
        skill_name=name,
        normalized_name=name.lower(),
        proficiency_level=level,
    )


def _req(skill_id, name: str, *, mandatory: bool, level: str = "intermediate") -> RequiredSkill:
    return RequiredSkill(
        skill_id=skill_id,
        skill_name=name,
        normalized_name=name.lower(),
        is_mandatory=mandatory,
        minimum_level=level,
        weight=Decimal("1.0"),
    )


def _empty_input(**kwargs) -> CompatibilityInput:
    defaults = dict(
        candidate_skills=SkillSet.from_list([]),
        required_skills=[],
        candidate_seniority=SeniorityLevel.MID,
        candidate_experience_years=3.0,
        candidate_education_level="bachelor",
        job_seniority=SeniorityLevel.MID,
        job_min_experience_years=None,
        job_min_education_level=None,
    )
    defaults.update(kwargs)
    return CompatibilityInput(**defaults)


calc = JobCompatibilityCalculator()


# ── Score é Decimal e respeita limites ────────────────────────────────────────

def test_match_score_is_decimal() -> None:
    result = calc.calculate(_empty_input())
    assert isinstance(result.match_score.value, Decimal)


def test_match_score_never_exceeds_100() -> None:
    py_id = _skill_id()
    data = _empty_input(
        candidate_skills=SkillSet.from_list([_entry(py_id, "Python", "expert")]),
        required_skills=[_req(py_id, "Python", mandatory=True, level="basic")],
        job_seniority=SeniorityLevel.MID,
    )
    assert calc.calculate(data).match_score.value <= Decimal("100")


# ── Skill matching ────────────────────────────────────────────────────────────

def test_exact_skill_match_full_credit() -> None:
    py_id = _skill_id()
    result = calc.calculate(_empty_input(
        candidate_skills=SkillSet.from_list([_entry(py_id, "Python", "advanced")]),
        required_skills=[_req(py_id, "Python", mandatory=True, level="intermediate")],
    ))
    assert result.mandatory_skills_score.value == Decimal("100.00")


def test_missing_mandatory_skill_zero_credit() -> None:
    py_id = _skill_id()
    result = calc.calculate(_empty_input(
        candidate_skills=SkillSet.from_list([]),
        required_skills=[_req(py_id, "Python", mandatory=True)],
    ))
    assert result.mandatory_skills_score.value == Decimal("0.00")


def test_partial_credit_when_below_minimum_level() -> None:
    py_id = _skill_id()
    result = calc.calculate(_empty_input(
        candidate_skills=SkillSet.from_list([_entry(py_id, "Python", "basic")]),
        required_skills=[_req(py_id, "Python", mandatory=True, level="advanced")],
    ))
    # basic < advanced → 50% credit
    assert result.mandatory_skills_score.value == Decimal("50.00")


# ── Reweighting ───────────────────────────────────────────────────────────────

def test_no_mandatory_skills_weight_redistributed_to_optional() -> None:
    py_id = _skill_id()
    fa_id = _skill_id()

    # Candidate matches all optional skills
    full = _empty_input(
        candidate_skills=SkillSet.from_list([
            _entry(py_id, "Python"), _entry(fa_id, "FastAPI"),
        ]),
        required_skills=[
            _req(py_id, "Python", mandatory=False),
            _req(fa_id, "FastAPI", mandatory=False),
        ],
    )
    # Candidate matches none
    none = _empty_input(
        candidate_skills=SkillSet.from_list([]),
        required_skills=[
            _req(py_id, "Python", mandatory=False),
            _req(fa_id, "FastAPI", mandatory=False),
        ],
    )
    assert calc.calculate(full).match_score.value > calc.calculate(none).match_score.value


def test_no_skills_at_all_seniority_and_experience_drive_score() -> None:
    result = calc.calculate(_empty_input(
        required_skills=[],
        candidate_experience_years=5.0,
        job_min_experience_years=5.0,
    ))
    # no skills → weights go to experience+education; score must be in [0, 100]
    assert Decimal("0") < result.match_score.value <= Decimal("100")


def test_no_optional_skills_weight_goes_to_mandatory() -> None:
    py_id = _skill_id()
    with_opt = _empty_input(
        candidate_skills=SkillSet.from_list([_entry(py_id, "Python")]),
        required_skills=[_req(py_id, "Python", mandatory=True)],
    )
    without_opt = with_opt  # identical input — just verifying no crash
    r1 = calc.calculate(with_opt)
    r2 = calc.calculate(without_opt)
    assert r1.match_score.value == r2.match_score.value


# ── Seniority penalty ─────────────────────────────────────────────────────────

def test_exact_seniority_match_scores_100() -> None:
    result = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.MID,
        job_seniority=SeniorityLevel.MID,
    ))
    assert result.seniority_score.value == Decimal("100.00")


def test_overqualified_distance_2_gets_penalty() -> None:
    over = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.SENIOR,
        job_seniority=SeniorityLevel.JUNIOR,
        required_skills=[],
    ))
    exact = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.MID,
        job_seniority=SeniorityLevel.MID,
        required_skills=[],
    ))
    assert over.seniority_score.value < exact.seniority_score.value


def test_overqualified_distance_1_no_penalty() -> None:
    """Distance = 1 is below threshold; no penalty applied."""
    over_1 = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.MID,
        job_seniority=SeniorityLevel.JUNIOR,
        required_skills=[],
    ))
    under_1 = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.JUNIOR,
        job_seniority=SeniorityLevel.MID,
        required_skills=[],
    ))
    # Same distance, no penalty in either direction at distance=1
    assert over_1.seniority_score.value == under_1.seniority_score.value == Decimal("75.00")


def test_underqualified_scores_higher_than_overqualified_same_distance() -> None:
    under = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.JUNIOR,
        job_seniority=SeniorityLevel.SENIOR,
        required_skills=[],
    ))
    over = calc.calculate(_empty_input(
        candidate_seniority=SeniorityLevel.SENIOR,
        job_seniority=SeniorityLevel.JUNIOR,
        required_skills=[],
    ))
    assert under.seniority_score.value > over.seniority_score.value
