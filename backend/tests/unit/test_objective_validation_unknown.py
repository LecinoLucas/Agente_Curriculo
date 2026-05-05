"""Unit tests for objective validation with UNKNOWN state support.

Tests the three validation states:
1. PASS: candidate meets requirement
2. FAIL: candidate below requirement (hard reject, score <= 39)
3. UNKNOWN: missing evidence (flag for manual review, light penalty)
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.application.services.analysis_service import (
    AnalysisResultDetails,
    AnalysisService,
    _validate_education,
    _validate_experience,
)


class TestValidationFunctions:
    """Test the new _validate_education and _validate_experience functions."""

    def test_validate_education_pass(self):
        """Candidate education >= job requirement → PASS."""
        result = _validate_education("bachelor", "high_school")
        assert result.status == "pass"
        assert result.reason is None

    def test_validate_education_fail(self):
        """Candidate education < job requirement → FAIL."""
        result = _validate_education("high_school", "bachelor")
        assert result.status == "fail"
        assert "insuficiente" in result.reason.lower()

    def test_validate_education_unknown_null_candidate(self):
        """Candidate education null with job requirement → UNKNOWN."""
        result = _validate_education(None, "bachelor")
        assert result.status == "unknown"
        assert "não informada" in result.reason.lower()

    def test_validate_education_no_requirement(self):
        """No job requirement → PASS."""
        result = _validate_education("high_school", None)
        assert result.status == "pass"
        assert result.reason is None

    def test_validate_experience_pass(self):
        """Candidate years >= job requirement → PASS."""
        result = _validate_experience(Decimal("5.0"), Decimal("3.0"))
        assert result.status == "pass"
        assert result.reason is None

    def test_validate_experience_fail(self):
        """Candidate years < job requirement → FAIL."""
        result = _validate_experience(Decimal("2.0"), Decimal("5.0"))
        assert result.status == "fail"
        assert "insuficiente" in result.reason.lower()

    def test_validate_experience_unknown_null_candidate(self):
        """Candidate years null with job requirement → UNKNOWN."""
        result = _validate_experience(None, Decimal("5.0"))
        assert result.status == "unknown"
        assert "não informada" in result.reason.lower()

    def test_validate_experience_no_requirement(self):
        """No job requirement → PASS."""
        result = _validate_experience(Decimal("2.0"), None)
        assert result.status == "pass"
        assert result.reason is None


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
    highest_education_level: str | None = None,
    total_experience_years: Decimal | None = None,
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


def _make_job(
    seniority: str = "mid",
    minimum_education_level: str | None = None,
    minimum_years_experience: Decimal | None = None,
) -> MagicMock:
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
    j.deal_breakers = []
    j.minimum_education_level = minimum_education_level
    j.minimum_years_experience = minimum_years_experience
    return j


def _make_service(job: MagicMock, job_skill_rows: list[SimpleNamespace]) -> AnalysisService:
    repo = MagicMock()
    candidate_id = uuid4()
    resume_version_id = uuid4()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skill_rows)
    repo.find_active_score_model_version = AsyncMock(return_value=None)
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
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)
    return AnalysisService(repository=repo)


def _make_details(result: MagicMock) -> AnalysisResultDetails:
    analysis = MagicMock()
    analysis.id = uuid4()
    analysis.resume_version_id = uuid4()
    return AnalysisResultDetails(analysis=analysis, result=result)


# ── Test PASS state ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validation_pass_education_and_experience() -> None:
    """Both education and experience meet requirements → PASS, no penalty."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("3.0"),
    )
    rows = [_make_row("Python", is_mandatory=True)]

    result = _make_result(
        skills=["Python"],
        seniority="mid",
        highest_education_level="master",
        total_experience_years=Decimal("5.0"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "pass"
    assert resp.missing_evidence == []
    # Score should NOT be penalized
    assert resp.recommendation != "review_manually"


# ── Test FAIL state ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validation_fail_education_insufficient() -> None:
    """Candidate education < requirement → FAIL, score capped at 39."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="bachelor",
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level="high_school",
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.missing_evidence == []
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")


@pytest.mark.asyncio
async def test_validation_fail_experience_insufficient() -> None:
    """Candidate experience < requirement → FAIL, score capped at 39."""
    job = _make_job(
        seniority="mid",
        minimum_years_experience=Decimal("5.0"),
    )
    rows = []

    result = _make_result(
        seniority="mid",
        total_experience_years=Decimal("2.0"),
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.missing_evidence == []
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")


@pytest.mark.asyncio
async def test_validation_fail_both_insufficient() -> None:
    """Both education and experience insufficient → FAIL."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="master",
        minimum_years_experience=Decimal("5.0"),
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level="bachelor",
        total_experience_years=Decimal("2.0"),
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")


# ── Test UNKNOWN state ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_validation_unknown_education_missing() -> None:
    """Candidate education null with requirement → UNKNOWN, not auto-reject."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="bachelor",
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level=None,  # Missing!
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "unknown"
    assert "education" in resp.missing_evidence
    assert resp.recommendation == "review_manually"
    # Score should be penalized but NOT hard-capped
    assert resp.match_score > Decimal("39")
    assert resp.match_score < Decimal("100")
    # Score should have 10% penalty applied
    # (exact value depends on weight distribution, but should be reduced)


@pytest.mark.asyncio
async def test_validation_unknown_experience_missing() -> None:
    """Candidate experience null with requirement → UNKNOWN, not auto-reject."""
    job = _make_job(
        seniority="mid",
        minimum_years_experience=Decimal("5.0"),
    )
    rows = []

    result = _make_result(
        seniority="mid",
        total_experience_years=None,  # Missing!
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "unknown"
    assert "experience" in resp.missing_evidence
    assert resp.recommendation == "review_manually"
    # Score should be penalized but NOT hard-capped
    assert resp.match_score > Decimal("39")
    assert resp.match_score < Decimal("100")


@pytest.mark.asyncio
async def test_validation_unknown_both_missing() -> None:
    """Both education and experience null → UNKNOWN, not auto-reject."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("5.0"),
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level=None,
        total_experience_years=None,
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "unknown"
    assert set(resp.missing_evidence) == {"education", "experience"}
    assert resp.recommendation == "review_manually"
    # Score should be penalized but NOT hard-capped
    assert resp.match_score > Decimal("39")


# ── Test mixed scenarios (FAIL overrides UNKNOWN) ────────────────────────────────

@pytest.mark.asyncio
async def test_validation_fail_education_unknown_experience() -> None:
    """Education FAIL, experience UNKNOWN → overall FAIL (hard reject)."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("5.0"),
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level="high_school",  # FAIL
        total_experience_years=None,  # UNKNOWN
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")


@pytest.mark.asyncio
async def test_validation_unknown_education_pass_experience() -> None:
    """Education UNKNOWN, experience PASS → overall UNKNOWN."""
    job = _make_job(
        seniority="mid",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("5.0"),
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level=None,  # UNKNOWN
        total_experience_years=Decimal("5.0"),  # PASS
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "unknown"
    assert "education" in resp.missing_evidence
    assert "experience" not in resp.missing_evidence
    assert resp.recommendation == "review_manually"
    # Score penalized by 10%
    assert resp.match_score > Decimal("39")
    assert resp.match_score < Decimal("100")


# ── Backward compatibility: no requirements ────────────────────────────────────

@pytest.mark.asyncio
async def test_validation_pass_no_requirements() -> None:
    """No education/experience requirements → PASS regardless of candidate data."""
    job = _make_job(
        seniority="mid",
        minimum_education_level=None,
        minimum_years_experience=None,
    )
    rows = []

    result = _make_result(
        seniority="mid",
        highest_education_level=None,
        total_experience_years=None,
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "pass"
    assert resp.missing_evidence == []
    # No penalty applied (no evidence needed since no requirements)
    assert resp.match_score > Decimal("39")
    # Recommendation should not be "review_manually" since PASS
    assert resp.recommendation != "review_manually"
