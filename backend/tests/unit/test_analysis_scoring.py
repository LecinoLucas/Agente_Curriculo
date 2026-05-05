"""Unit tests for analysis_service scoring: skill matching,
reweighting when a skill category is empty, and seniority penalty.

Note: Tokenization tests removed as part of skill matching refactor.
Old _tokenize() has been replaced with _skill_matches() which uses:
- Exact match (case-insensitive)
- Alias lookup
- Levenshtein distance for typos (length >= 4, distance <= 2)
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.application.services.analysis_service import (
    AnalysisResultDetails,
    AnalysisService,
)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_row(skill_name: str, *, is_mandatory: bool, aliases: list[str] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=aliases or [],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


def _make_result(
    *,
    keywords: list[str] | None = None,
    skills: list[str] | None = None,
    seniority: str = "mid",
    overall_score: Decimal = Decimal("70"),
    total_experience_years: Decimal | None = None,
    highest_education_level: str | None = None,
) -> MagicMock:
    r = MagicMock()
    r.keywords = keywords or []
    r.extracted_data = {"skills": [{"name": s} for s in (skills or [])]}
    r.seniority_level = seniority
    r.overall_score = overall_score
    r.experience_score = Decimal("70")
    r.highest_education_level = highest_education_level
    r.total_experience_years = total_experience_years
    return r


def _make_job(seniority: str | None = "mid") -> MagicMock:
    j = MagicMock()
    j.id = uuid4()
    j.title = "Test Job"
    j.description = "Test description"
    j.requirements = "Test requirements"
    j.seniority_level = seniority
    j.job_area = "technology"
    j.responsibilities = []
    j.experience_context = ""
    j.behavioral_requirements = []
    j.priority = "normal"
    j.minimum_education_level = None  # No strict education requirement by default
    j.minimum_years_experience = None  # No strict experience requirement by default
    j.deal_breakers = []
    return j


def _make_service(job: MagicMock, job_skill_rows: list[SimpleNamespace]) -> AnalysisService:
    repo = MagicMock()
    candidate_id = uuid4()
    resume_version_id = uuid4()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skill_rows)
    repo.find_active_score_model_version = AsyncMock(return_value=None)  # Fallback to hardcoded weights
    repo.find_latest_candidate_profile_analysis_for_resume = AsyncMock(
        return_value=SimpleNamespace(id=uuid4())
    )
    repo.find_preferred_ai_model = AsyncMock(return_value=None)
    repo.find_job_profile_analysis_by_signature = AsyncMock(
        return_value=SimpleNamespace(id=uuid4())
    )
    repo.get_candidate_id_from_analysis = AsyncMock(return_value=candidate_id)
    repo.get_resume_version_id_from_analysis = AsyncMock(return_value=resume_version_id)
    repo.upsert_candidate_job_match = AsyncMock()
    # session is passed to SQLAlchemyPipelineRepository when register_match_entry
    # is called from _match_details_to_job. scalar returns None so the pipeline
    # upsert exits early without further DB interaction.
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)
    repo.session.get = AsyncMock(return_value=None)
    repo.session.flush = AsyncMock()
    return AnalysisService(repository=repo)


def _make_details(result: MagicMock) -> AnalysisResultDetails:
    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = uuid4()
    return AnalysisResultDetails(analysis=analysis, result=result)


# ─── Reweighting: mandatory = 0 ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reweight_when_no_mandatory_skills() -> None:
    """With zero mandatory skills the weight must flow to optional so that a
    candidate who matches all optional skills gets a higher score than one
    who matches none."""
    job = _make_job(seniority="mid")
    rows = [
        _make_row("Python", is_mandatory=False),
        _make_row("FastAPI", is_mandatory=False),
    ]

    # Candidate matches all optional skills
    result_full = _make_result(skills=["Python", "FastAPI"], seniority="mid")
    service = _make_service(job, rows)
    resp_full = await service._match_details_to_job(
        _make_details(result_full), job.id
    )

    # Candidate matches no optional skills
    result_none = _make_result(skills=["Java"], seniority="mid")
    service2 = _make_service(job, rows)
    resp_none = await service2._match_details_to_job(
        _make_details(result_none), job.id
    )

    assert resp_full.match_score > resp_none.match_score, (
        "Full optional match must outscore zero optional match when mandatory weight is redistributed"
    )


@pytest.mark.asyncio
async def test_fallback_to_job_profile_analysis_skills_when_job_has_no_rows() -> None:
    job = _make_job(seniority="senior")
    result = _make_result(
        skills=["SQL", "Power BI", "Excel", "Python"],
        seniority="senior",
        overall_score=Decimal("90"),
        total_experience_years=Decimal("10"),
        highest_education_level="bachelor",
    )
    service = _make_service(job, [])
    service._repository.find_job_profile_analysis_by_signature = AsyncMock(
        return_value=SimpleNamespace(
            id=uuid4(),
            required_skills_json=["SQL", "Power BI", "Excel"],
            nice_to_have_skills_json=["Python"],
        )
    )

    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.mandatory_skills_total == 3
    assert resp.mandatory_skills_matched == 3
    assert resp.optional_skills_matched == 1
    assert resp.recommendation in {"good_match", "strong_match"}


@pytest.mark.asyncio
async def test_reweight_when_no_skills_at_all() -> None:
    """With no skills at all, only deterministic signals drive the overall score."""
    job = _make_job(seniority="senior")
    rows: list[SimpleNamespace] = []

    result = _make_result(seniority="senior", overall_score=Decimal("80"))
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    # The score must be deterministic and remain in the valid range.
    assert Decimal("0") < resp.match_score <= Decimal("100")


# ─── Skill matching (token intersection) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_exact_skill_match() -> None:
    job = _make_job()
    rows = [_make_row("Python", is_mandatory=True)]
    result = _make_result(skills=["Python"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 1


@pytest.mark.asyncio
async def test_skill_match_ignores_markdown_and_role_text() -> None:
    job = _make_job()
    rows = [_make_row("Python", is_mandatory=True)]
    result = _make_result(skills=["**Python** Developer"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 1


@pytest.mark.asyncio
async def test_java_does_not_match_javascript() -> None:
    """java in candidate skills must NOT match javascript job requirement."""
    job = _make_job()
    rows = [_make_row("javascript", is_mandatory=True)]
    result = _make_result(skills=["java"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 0


@pytest.mark.asyncio
async def test_csharp_matches_csharp() -> None:
    job = _make_job()
    rows = [_make_row("C#", is_mandatory=True)]
    result = _make_result(skills=["C#"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 1


@pytest.mark.asyncio
async def test_cpp_matches_cpp() -> None:
    job = _make_job()
    rows = [_make_row("C++", is_mandatory=True)]
    result = _make_result(skills=["C++"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 1


@pytest.mark.asyncio
async def test_csharp_does_not_match_cpp() -> None:
    job = _make_job()
    rows = [_make_row("C++", is_mandatory=True)]
    result = _make_result(skills=["C#"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 0


@pytest.mark.asyncio
async def test_reactjs_matches_reactjs() -> None:
    job = _make_job()
    rows = [_make_row("React.js", is_mandatory=True)]
    result = _make_result(skills=["React.js"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 1


@pytest.mark.asyncio
async def test_react_does_not_match_reactjs() -> None:
    """Plain react and react.js are distinct tokens; they must not cross-match."""
    job = _make_job()
    rows = [_make_row("React.js", is_mandatory=True)]
    result = _make_result(skills=["react"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 0


@pytest.mark.asyncio
async def test_postgresql_matches_sql_via_skill_normalizer() -> None:
    job = _make_job()
    rows = [_make_row("SQL", is_mandatory=True)]
    result = _make_result(skills=["PostgreSQL"])
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.mandatory_skills_matched == 1


# ─── Seniority penalty ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_seniority_overqualified_penalty() -> None:
    """A senior candidate applying for a junior role must score lower on
    seniority than a perfectly matched (mid == mid) candidate."""
    job_junior = _make_job(seniority="junior")
    job_mid = _make_job(seniority="mid")
    rows: list[SimpleNamespace] = []

    # Senior applying for junior (overqualified: candidate_sen > job_sen)
    result_senior = _make_result(seniority="senior", overall_score=Decimal("70"))
    service_over = _make_service(job_junior, rows)
    resp_over = await service_over._match_details_to_job(
        _make_details(result_senior), job_junior.id
    )

    # Mid applying for mid (perfect match)
    result_mid = _make_result(seniority="mid", overall_score=Decimal("70"))
    service_exact = _make_service(job_mid, rows)
    resp_exact = await service_exact._match_details_to_job(
        _make_details(result_mid), job_mid.id
    )

    assert resp_over.seniority_score < resp_exact.seniority_score, (
        "Overqualified candidate must receive a lower seniority score"
    )


@pytest.mark.asyncio
async def test_seniority_underqualified_no_extra_penalty() -> None:
    """A junior applying for a senior role scores the same base seniority as
    a senior applying for a junior role (same distance), but without the
    overqualification multiplier."""
    job_senior = _make_job(seniority="senior")
    job_junior = _make_job(seniority="junior")
    rows: list[SimpleNamespace] = []

    result_junior = _make_result(seniority="junior", overall_score=Decimal("70"))
    service_under = _make_service(job_senior, rows)
    resp_under = await service_under._match_details_to_job(
        _make_details(result_junior), job_senior.id
    )

    result_senior = _make_result(seniority="senior", overall_score=Decimal("70"))
    service_over = _make_service(job_junior, rows)
    resp_over = await service_over._match_details_to_job(
        _make_details(result_senior), job_junior.id
    )

    # Overqualified gets the 0.90 multiplier penalty, underqualified does not.
    assert resp_under.seniority_score > resp_over.seniority_score


# ─── Overall score clamp ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_overall_score_never_exceeds_100() -> None:
    """Regardless of input, the overall score must be clamped to 100."""
    job = _make_job(seniority="mid")
    rows = [
        _make_row("Python", is_mandatory=True),
        _make_row("FastAPI", is_mandatory=False),
    ]
    result = _make_result(
        skills=["Python", "FastAPI"],
        seniority="mid",
        overall_score=Decimal("100"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)
    assert resp.match_score <= Decimal("100")


@pytest.mark.asyncio
async def test_ai_score_does_not_change_canonical_match_score() -> None:
    job = _make_job(seniority="mid")
    job.minimum_years_experience = Decimal("5")
    rows = [_make_row("Python", is_mandatory=True)]

    low_ai = _make_result(
        skills=["Python"],
        seniority="mid",
        overall_score=Decimal("0"),
        total_experience_years=Decimal("5"),
    )
    high_ai = _make_result(
        skills=["Python"],
        seniority="mid",
        overall_score=Decimal("100"),
        total_experience_years=Decimal("5"),
    )

    low_resp = await _make_service(job, rows)._match_details_to_job(_make_details(low_ai), job.id)
    high_resp = await _make_service(job, rows)._match_details_to_job(_make_details(high_ai), job.id)

    assert high_resp.match_score == low_resp.match_score


@pytest.mark.asyncio
async def test_experience_score_uses_years_vs_minimum_requirement() -> None:
    job = _make_job(seniority=None)
    job.minimum_years_experience = Decimal("5")
    rows: list[SimpleNamespace] = []

    result_exact = _make_result(
        seniority="mid",
        overall_score=Decimal("70"),
        total_experience_years=Decimal("5"),
    )
    result_above = _make_result(
        seniority="mid",
        overall_score=Decimal("70"),
        total_experience_years=Decimal("8"),
    )

    resp_exact = await _make_service(job, rows)._match_details_to_job(_make_details(result_exact), job.id)
    resp_above = await _make_service(job, rows)._match_details_to_job(_make_details(result_above), job.id)

    assert resp_above.match_score > resp_exact.match_score


@pytest.mark.asyncio
async def test_jobs_without_structured_requirements_stay_below_potential_threshold() -> None:
    job = _make_job(seniority=None)
    rows: list[SimpleNamespace] = []

    result = _make_result(
        seniority="senior",
        overall_score=Decimal("100"),
        total_experience_years=Decimal("10"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.match_score <= Decimal("44.00")


@pytest.mark.asyncio
async def test_job_profile_fallback_does_not_bypass_no_requirements_cap() -> None:
    job = _make_job(seniority=None)
    rows: list[SimpleNamespace] = []

    result = _make_result(
        skills=["Python", "FastAPI", "PostgreSQL"],
        seniority="senior",
        overall_score=Decimal("100"),
        total_experience_years=Decimal("10"),
    )
    service = _make_service(job, rows)
    service._repository.find_job_profile_analysis_by_signature = AsyncMock(
        return_value=SimpleNamespace(
            id=uuid4(),
            required_skills_json=["Python", "FastAPI", "PostgreSQL"],
            nice_to_have_skills_json=[],
        )
    )

    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.mandatory_skills_total == 0
    assert resp.optional_skills_total == 0
    assert resp.match_score <= Decimal("44.00")


@pytest.mark.asyncio
async def test_mandatory_soft_penalty_applies_between_sixty_and_eighty_percent() -> None:
    job = _make_job(seniority="mid")
    job.minimum_years_experience = Decimal("5")
    rows = [
        _make_row("Python", is_mandatory=True),
        _make_row("FastAPI", is_mandatory=True),
        _make_row("SQL", is_mandatory=True),
        _make_row("Docker", is_mandatory=True),
        _make_row("AWS", is_mandatory=True),
    ]

    result_sixty = _make_result(
        skills=["Python", "FastAPI", "SQL"],
        seniority="mid",
        overall_score=Decimal("70"),
        total_experience_years=Decimal("5"),
    )
    result_eighty = _make_result(
        skills=["Python", "FastAPI", "SQL", "Docker"],
        seniority="mid",
        overall_score=Decimal("70"),
        total_experience_years=Decimal("5"),
    )

    resp_sixty = await _make_service(job, rows)._match_details_to_job(_make_details(result_sixty), job.id)
    resp_eighty = await _make_service(job, rows)._match_details_to_job(_make_details(result_eighty), job.id)

    assert resp_sixty.match_score > Decimal("39.00")
    assert resp_sixty.match_score < resp_eighty.match_score


@pytest.mark.asyncio
async def test_recommendation_thresholds_respect_strong_good_potential_bands() -> None:
    job = _make_job(seniority="mid")
    job.minimum_years_experience = Decimal("5")

    strong_rows = [
        _make_row("Python", is_mandatory=True),
        _make_row("FastAPI", is_mandatory=True),
        _make_row("SQL", is_mandatory=True),
        _make_row("Docker", is_mandatory=True),
    ]
    strong_result = _make_result(
        skills=["Python", "FastAPI", "SQL", "Docker"],
        seniority="mid",
        overall_score=Decimal("90"),
        total_experience_years=Decimal("8"),
    )
    strong_resp = await _make_service(job, strong_rows)._match_details_to_job(
        _make_details(strong_result), job.id
    )

    good_result = _make_result(
        skills=["Python", "FastAPI", "SQL"],
        seniority="mid",
        overall_score=Decimal("70"),
        total_experience_years=Decimal("5"),
    )
    good_resp = await _make_service(job, strong_rows)._match_details_to_job(
        _make_details(good_result), job.id
    )

    potential_rows = [
        _make_row("Python", is_mandatory=True),
        _make_row("FastAPI", is_mandatory=True),
        _make_row("SQL", is_mandatory=True),
        _make_row("Docker", is_mandatory=True),
        _make_row("AWS", is_mandatory=True),
    ]
    potential_result = _make_result(
        skills=["Python", "FastAPI", "SQL"],
        seniority="mid",
        overall_score=Decimal("70"),
        total_experience_years=Decimal("5"),
    )
    potential_resp = await _make_service(job, potential_rows)._match_details_to_job(
        _make_details(potential_result), job.id
    )

    low_potential_result = _make_result(
        skills=["Python", "FastAPI"],
        seniority="mid",
        overall_score=Decimal("20"),
        total_experience_years=Decimal("5"),
    )
    low_potential_resp = await _make_service(job, potential_rows)._match_details_to_job(
        _make_details(low_potential_result), job.id
    )

    assert strong_resp.match_score >= Decimal("85.00")
    assert strong_resp.recommendation == "strong_match"

    assert good_resp.match_score >= Decimal("70.00")
    assert good_resp.recommendation == "good_match"

    assert potential_resp.match_score >= Decimal("55.00")
    assert potential_resp.recommendation == "potential"

    assert low_potential_resp.match_score < Decimal("55.00")
    assert low_potential_resp.recommendation == "not_match"
