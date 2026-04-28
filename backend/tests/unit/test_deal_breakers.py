"""Unit tests for deal-breaker evaluation in candidate matching.

Deal-breakers are explicit criteria that automatically reject candidates.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.application.services.analysis_service import (
    AnalysisResultDetails,
    AnalysisService,
    _evaluate_deal_breaker,
)


class TestEvaluateDealBreaker:
    """Test the deal-breaker evaluation function with correct semantics.

    Deal-breaker REJECTS candidates that MATCH prohibited criteria.
    Operator="equals" means "reject if candidate_value == value"
    """

    def test_equals_operator_hits_when_match(self) -> None:
        """Equals operator rejects when candidate matches prohibited value."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "equals",
            "value": "intern",
            "reason": "Vaga não aceita nível Junior ou menos",
            "is_active": True,
        }
        result = MagicMock()
        result.seniority_level = "intern"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is True
        assert "não aceita" in reason.lower()

    def test_equals_operator_no_hit_when_different(self) -> None:
        """Equals operator does not hit when candidate is different."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "equals",
            "value": "intern",
            "reason": "Vaga não aceita nível Junior ou menos",
            "is_active": True,
        }
        result = MagicMock()
        result.seniority_level = "senior"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is False
        assert reason is None

    def test_equals_case_insensitive(self) -> None:
        """Equals comparison is case-insensitive for strings."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "equals",
            "value": "Intern",
            "reason": "Rejeita Junior",
            "is_active": True,
        }
        result = MagicMock()
        result.seniority_level = "INTERN"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is True  # "INTERN" == "Intern" (case-insensitive)

    def test_not_equals_operator_hits_when_different(self) -> None:
        """Not-equals operator rejects when candidate is NOT the required value."""
        deal_breaker = {
            "field": "work_model",
            "operator": "not_equals",
            "value": "remote",
            "reason": "Vaga requer trabalho remoto",
            "is_active": True,
        }
        result = MagicMock()
        result.work_model = "hybrid"  # NOT "remote"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is True
        assert "remoto" in reason.lower()

    def test_not_equals_operator_no_hit_when_match(self) -> None:
        """Not-equals operator does not hit when candidate matches required value."""
        deal_breaker = {
            "field": "work_model",
            "operator": "not_equals",
            "value": "remote",
            "reason": "Vaga requer trabalho remoto",
            "is_active": True,
        }
        result = MagicMock()
        result.work_model = "remote"  # Matches required value

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is False
        assert reason is None

    def test_in_operator_hits_when_candidate_in_list(self) -> None:
        """In operator rejects when candidate is in prohibited list."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "in",
            "value": ["intern", "junior"],
            "reason": "Vaga não aceita nível Junior ou menos",
            "is_active": True,
        }
        result = MagicMock()
        result.seniority_level = "junior"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is True

    def test_in_operator_no_hit_when_not_in_list(self) -> None:
        """In operator does not hit when candidate not in list."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "in",
            "value": ["intern", "junior"],
            "reason": "Vaga não aceita nível Junior ou menos",
            "is_active": True,
        }
        result = MagicMock()
        result.seniority_level = "senior"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is False

    def test_inactive_deal_breaker_ignored(self) -> None:
        """Inactive deal-breaker is not evaluated."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "equals",
            "value": "intern",
            "reason": "Rejeita Junior",
            "is_active": False,
        }
        result = MagicMock()
        result.seniority_level = "intern"

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is False
        assert reason is None

    def test_missing_candidate_data_no_hit(self) -> None:
        """Deal-breaker does not hit if candidate data is missing."""
        deal_breaker = {
            "field": "seniority_level",
            "operator": "equals",
            "value": "intern",
            "reason": "Rejeita Junior",
            "is_active": True,
        }
        result = MagicMock()
        result.seniority_level = None

        hit, reason = _evaluate_deal_breaker(deal_breaker, result)

        assert hit is False  # No explicit data, no deal-breaker hit
        assert reason is None


def _make_row(skill_name: str, *, is_mandatory: bool) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=[],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


def _make_result(
    seniority: str = "mid",
    work_model: str | None = None,
    **kwargs,
) -> MagicMock:
    r = MagicMock()
    r.seniority_level = seniority
    r.work_model = work_model
    r.keywords = kwargs.get("keywords", [])
    r.extracted_data = {"skills": [{"name": s} for s in kwargs.get("skills", [])]}
    r.overall_score = kwargs.get("overall_score", Decimal("70"))
    r.experience_score = Decimal("70")
    r.highest_education_level = kwargs.get("highest_education_level", None)
    r.total_experience_years = kwargs.get("total_experience_years", None)
    return r


def _make_job(
    seniority: str = "mid",
    deal_breakers: list | None = None,
) -> MagicMock:
    j = MagicMock()
    j.id = uuid4()
    j.seniority_level = seniority
    j.minimum_education_level = None
    j.minimum_years_experience = None
    j.deal_breakers = deal_breakers or []
    return j


def _make_service(job: MagicMock, job_skill_rows: list) -> AnalysisService:
    repo = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skill_rows)
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)
    return AnalysisService(repository=repo)


def _make_details(result: MagicMock) -> AnalysisResultDetails:
    analysis = MagicMock()
    analysis.id = uuid4()
    return AnalysisResultDetails(analysis=analysis, result=result)


# ── Deal-breaker Tests ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_seniority_deal_breaker_equals_hit() -> None:
    """Equals operator: candidate matches prohibited value → FAIL, score ≤ 39."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "seniority_level",
                "operator": "equals",
                "value": "intern",
                "reason": "Vaga não aceita nível Junior ou menos",
                "is_active": True,
            }
        ],
    )
    rows = []

    result = _make_result(
        seniority="intern",  # Matches prohibited value
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")
    assert any("não aceita" in reason.lower() for reason in resp.rejection_reasons)


@pytest.mark.asyncio
async def test_seniority_deal_breaker_equals_no_hit() -> None:
    """Equals operator: candidate different from prohibited value → PASS, normal scoring."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "seniority_level",
                "operator": "equals",
                "value": "intern",
                "reason": "Vaga não aceita nível Junior ou menos",
                "is_active": True,
            }
        ],
    )
    rows = []

    result = _make_result(
        seniority="senior",  # Different from prohibited "intern"
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "pass"
    # Rejection reason should NOT mention the deal-breaker
    assert not any("não aceita" in reason.lower() for reason in resp.rejection_reasons)
    assert resp.match_score > Decimal("39")


@pytest.mark.asyncio
async def test_not_equals_deal_breaker() -> None:
    """Not-equals operator: candidate is NOT required value → FAIL."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "work_model",
                "operator": "not_equals",
                "value": "remote",
                "reason": "Vaga requer trabalho remoto",
                "is_active": True,
            }
        ],
    )
    rows = []

    result = _make_result(
        work_model="hybrid",  # Not equal to "remote"
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")


@pytest.mark.asyncio
async def test_in_operator_deal_breaker() -> None:
    """In operator: candidate in prohibited list → FAIL."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "seniority_level",
                "operator": "in",
                "value": ["intern", "junior"],
                "reason": "Vaga não aceita nível Junior ou menos",
                "is_active": True,
            }
        ],
    )
    rows = []

    result = _make_result(
        seniority="junior",  # In prohibited list
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")


@pytest.mark.asyncio
async def test_inactive_deal_breaker_ignored() -> None:
    """Inactive deal-breaker is not evaluated."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "seniority_level",
                "operator": "equals",
                "value": "intern",
                "reason": "Rejeita Junior",
                "is_active": False,  # Inactive!
            }
        ],
    )
    rows = []

    result = _make_result(
        seniority="intern",
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "pass"
    # Should NOT have rejection reason from deal-breaker
    assert not any("Rejeita" in reason for reason in resp.rejection_reasons)


@pytest.mark.asyncio
async def test_no_deal_breakers_normal_matching() -> None:
    """No deal-breakers → normal matching logic applies."""
    job = _make_job(deal_breakers=[])
    rows = [_make_row("Python", is_mandatory=True)]

    result = _make_result(
        seniority="mid",
        skills=["Python"],
        overall_score=Decimal("75"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    assert resp.validation_status == "pass"
    assert resp.mandatory_skills_matched == 1
    assert resp.match_score > Decimal("39")


@pytest.mark.asyncio
async def test_deal_breaker_with_missing_candidate_data() -> None:
    """Deal-breaker with missing candidate data → no hit (explicit data only)."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "seniority_level",
                "operator": "equals",
                "value": "intern",
                "reason": "Rejeita Junior",
                "is_active": True,
            }
        ],
    )
    rows = []

    result = _make_result(
        seniority=None,  # Missing seniority data
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    # Missing data doesn't trigger deal-breaker hit (no explicit data to compare)
    # Deal-breaker should not appear in rejection reasons
    assert not any("Rejeita" in reason for reason in resp.rejection_reasons)


@pytest.mark.asyncio
async def test_backward_compatibility_no_operator() -> None:
    """Deal-breaker without operator field defaults to equals."""
    job = _make_job(
        deal_breakers=[
            {
                "field": "seniority_level",
                # No operator field - should default to "equals"
                "value": "intern",
                "reason": "Rejeita Junior",
                "is_active": True,
            }
        ],
    )
    rows = []

    result = _make_result(
        seniority="intern",
        overall_score=Decimal("80"),
    )
    service = _make_service(job, rows)
    resp = await service._match_details_to_job(_make_details(result), job.id)

    # Should behave like equals operator
    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
