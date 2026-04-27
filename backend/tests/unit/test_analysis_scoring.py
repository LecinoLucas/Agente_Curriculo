"""Unit tests for analysis_service scoring: tokenisation, skill matching,
reweighting when a skill category is empty, and seniority penalty."""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.application.services.analysis_service import (
    AnalysisResultDetails,
    AnalysisService,
    _tokenize,
)


# ─── _tokenize ────────────────────────────────────────────────────────────────

def test_tokenize_plain_word() -> None:
    assert _tokenize("python") == frozenset({"python"})


def test_tokenize_csharp() -> None:
    assert _tokenize("c#") == frozenset({"c#"})


def test_tokenize_cpp() -> None:
    assert _tokenize("c++") == frozenset({"c++"})


def test_tokenize_react_js() -> None:
    assert _tokenize("react.js") == frozenset({"react.js"})


def test_tokenize_node_js() -> None:
    assert _tokenize("node.js") == frozenset({"node.js"})


def test_tokenize_multiword() -> None:
    tokens = _tokenize("machine learning")
    assert "machine" in tokens
    assert "learning" in tokens


def test_tokenize_java_not_javascript() -> None:
    """java and javascript must produce disjoint token sets (no substring bleed)."""
    assert not (_tokenize("java") & _tokenize("javascript"))


def test_tokenize_react_not_reactjs() -> None:
    """react and react.js are different skills; their tokens must not intersect."""
    assert not (_tokenize("react") & _tokenize("react.js"))


def test_tokenize_csharp_not_cpp() -> None:
    assert not (_tokenize("c#") & _tokenize("c++"))


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _make_row(skill_name: str, *, is_mandatory: bool) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


def _make_result(
    *,
    keywords: list[str] | None = None,
    skills: list[str] | None = None,
    seniority: str = "mid",
    overall_score: Decimal = Decimal("70"),
) -> MagicMock:
    r = MagicMock()
    r.keywords = keywords or []
    r.extracted_data = {"skills": [{"name": s} for s in (skills or [])]}
    r.seniority_level = seniority
    r.overall_score = overall_score
    r.experience_score = Decimal("70")
    return r


def _make_job(seniority: str = "mid") -> MagicMock:
    j = MagicMock()
    j.id = uuid4()
    j.seniority_level = seniority
    return j


def _make_service(job: MagicMock, job_skill_rows: list[SimpleNamespace]) -> AnalysisService:
    repo = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skill_rows)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    # session is passed to SQLAlchemyPipelineRepository when register_match_entry
    # is called from _match_details_to_job. scalar returns None so the pipeline
    # upsert exits early without further DB interaction.
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)
    return AnalysisService(repository=repo)


def _make_details(result: MagicMock) -> AnalysisResultDetails:
    analysis = MagicMock()
    analysis.id = uuid4()
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
async def test_reweight_when_no_skills_at_all() -> None:
    """With no skills at all, seniority and ai scores drive the overall score."""
    job = _make_job(seniority="senior")
    rows: list[SimpleNamespace] = []

    result = _make_result(seniority="senior", overall_score=Decimal("80"))
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    # With perfect seniority match (distance=0 → 100) and ai_score=80, and equal weights:
    # expected ≈ (100 * 0.40 + 80 * 0.40) ... but exact split doesn't matter;
    # the score must be > 0 and ≤ 100.
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
