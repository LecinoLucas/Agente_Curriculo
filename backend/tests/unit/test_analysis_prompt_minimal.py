"""Regression guard for the "60% education / 60% confidence stuck" bug.

The bug:
    ``_build_minimal_user_prompt`` did not ask the AI for ``experiences[]``
    or ``education[]``. The AI returned only ``{professional_area,
    seniority_level, skills}``. The response parser then defaulted
    ``total_experience_months`` to 0 and ``highest_education_level`` to
    ``"none"``. The ranking service interpreted that as
    ``candidate_has_experience=False`` and ``candidate_has_education=False``,
    which made ``compute_match_confidence`` land on 60 for every candidate
    (and education on 50 when ``job.minimum_education_level`` was null).

These tests pin the contract between the prompt and the parser so the
regression cannot return silently.
"""
from __future__ import annotations

import json

import pytest

from src.application.services.match_confidence_service import compute_match_confidence
from src.infrastructure.ai.response_parser import (
    AIResponseValidationError,
    parse_analysis_response,
)
from src.interface.workers.analysis_tasks import _build_minimal_user_prompt

# ── Prompt contract ─────────────────────────────────────────────────────────


def test_minimal_prompt_requests_experiences_field() -> None:
    prompt = _build_minimal_user_prompt(resume_text="cv", job_context="job")
    assert '"experiences"' in prompt, (
        "minimal prompt must ask for experiences[] so the parser can compute "
        "total_experience_months — otherwise every candidate ends up with "
        "candidate_has_experience=False and confidence stuck at 60"
    )


def test_minimal_prompt_requests_education_field() -> None:
    prompt = _build_minimal_user_prompt(resume_text="cv", job_context="job")
    assert '"education"' in prompt, (
        "minimal prompt must ask for education[] so the parser can derive "
        "highest_education_level — otherwise every candidate ends up with "
        "education_level='none' and confidence_score stuck at 60"
    )


def test_minimal_prompt_requests_duration_months() -> None:
    prompt = _build_minimal_user_prompt(resume_text="cv", job_context="job")
    assert "duration_months" in prompt
    assert "total_experience_months" in prompt


def test_minimal_prompt_declares_antidiscrimination_guardrails() -> None:
    prompt = _build_minimal_user_prompt(resume_text="cv", job_context="job")

    assert "Ignore dados sensíveis/protegidos" in prompt
    assert "nunca use idade" in prompt
    assert "endereço/bairro/distância" in prompt
    assert "não reprove automaticamente por dado ausente" in prompt


def test_minimal_prompt_allows_education_levels_beyond_none() -> None:
    prompt = _build_minimal_user_prompt(resume_text="cv", job_context="job")
    for level in ("high_school", "technical", "bachelor", "master", "phd"):
        assert level in prompt, f"prompt must list {level!r} as an education option"


# ── Parser respects the new fields ──────────────────────────────────────────


def test_parser_extracts_experience_years_from_minimal_response() -> None:
    raw = json.dumps(
        {
            "professional_area": "technology",
            "seniority_level": "senior",
            "skills": ["Python", "SQL"],
            "experiences": [
                {"role": "Backend Engineer", "duration_months": 36},
                {"role": "Tech Lead", "duration_months": 24},
            ],
            "education": [{"level": "bachelor", "field": "Computação"}],
            "total_experience_months": 60,
        }
    )
    result = parse_analysis_response(raw)
    # Months should be summed and converted to years (60 → 5.0).
    assert result["total_experience_years"] == 5.0
    assert result["highest_education_level"] == "bachelor"


def test_parser_rejects_when_experiences_or_education_are_missing() -> None:
    """When AI omits experiences/education the parser must not invent values.
    This is the failure mode that produced 60% — guard it so we never
    silently substitute a default that looks like a real signal."""
    raw = json.dumps(
        {
            "professional_area": "technology",
            "seniority_level": "senior",
            "skills": ["Python"],
        }
    )
    with pytest.raises(AIResponseValidationError) as exc_info:
        parse_analysis_response(raw)

    assert exc_info.value.code == "ai_response_missing_required_fields"
    assert "experiences" in exc_info.value.fields
    assert "education" in exc_info.value.fields


# ── Ranking still treats missing data as missing (no silent 60 substitution) ─


def test_compute_match_confidence_varies_with_candidate_signals() -> None:
    """Same job, three candidates with different signal completeness must
    produce three different confidence scores. If they all collapse to 60,
    the regression is back."""
    base = dict(
        final_score=80,
        structured_mandatory_skill_count=3,
        structured_total_skill_count=5,
        has_job_seniority=True,
        has_job_min_experience=True,
        candidate_structured_skill_count=4,
    )
    full_signals = compute_match_confidence(
        **base,
        candidate_has_experience=True,
        candidate_has_education=True,
    )
    no_exp = compute_match_confidence(
        **base,
        candidate_has_experience=False,
        candidate_has_education=True,
    )
    no_exp_no_edu = compute_match_confidence(
        **base,
        candidate_has_experience=False,
        candidate_has_education=False,
    )

    scores = {
        int(full_signals.confidence_score),
        int(no_exp.confidence_score),
        int(no_exp_no_edu.confidence_score),
    }
    assert len(scores) == 3, (
        f"confidence scores collapsed to fewer than 3 distinct values: {scores}"
    )
    assert int(full_signals.confidence_score) > int(no_exp.confidence_score) > int(
        no_exp_no_edu.confidence_score
    )
