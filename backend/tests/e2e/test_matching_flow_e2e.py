"""End-to-end test of the complete matching flow with deal-breakers and validation.

This test verifies the entire matching pipeline with:
- Deal-breaker auto-rejection
- Objective validation (PASS/FAIL/UNKNOWN)
- Score calculation
- Recommendation generation
- Final ranking
"""
import pytest
from decimal import Decimal
from uuid import uuid4
from unittest.mock import MagicMock, AsyncMock

from src.application.services.analysis_service import AnalysisService, AnalysisResultDetails


@pytest.mark.asyncio
async def test_e2e_matching_with_deal_breakers_and_validation() -> None:
    """End-to-end test covering all validation and deal-breaker scenarios."""

    # === SETUP: Create Job ===
    job = MagicMock()
    job.id = uuid4()
    job.seniority_level = "senior"
    job.minimum_education_level = "bachelor"
    job.minimum_years_experience = Decimal("5.0")
    job.deal_breakers = [
        {
            "field": "work_model",
            "operator": "not_equals",
            "value": "remote",
            "reason": "Vaga requer trabalho remoto",
            "is_active": True,
        }
    ]

    # Create service
    repo = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=[])
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)

    service = AnalysisService(repository=repo)

    # === CANDIDATES DATA ===
    candidates = [
        {
            "name": "Strong Candidate",
            "work_model": "remote",
            "education": "master",
            "experience_years": Decimal("8.0"),
            "skills": ["Python", "PostgreSQL"],
            "overall_score": Decimal("85"),
        },
        {
            "name": "Missing Required Skill",
            "work_model": "remote",
            "education": "master",
            "experience_years": Decimal("7.0"),
            "skills": ["Python"],
            "overall_score": Decimal("75"),
        },
        {
            "name": "Below Minimum Education/Experience",
            "work_model": "remote",
            "education": "high_school",
            "experience_years": Decimal("2.0"),
            "skills": ["Python", "PostgreSQL"],
            "overall_score": Decimal("70"),
        },
        {
            "name": "Deal Breaker Hit - Not Remote",
            "work_model": "hybrid",
            "education": "master",
            "experience_years": Decimal("8.0"),
            "skills": ["Python", "PostgreSQL"],
            "overall_score": Decimal("80"),
        },
    ]

    results = []

    # === RUN MATCHING ===
    for cand_data in candidates:
        result = MagicMock()
        result.highest_education_level = cand_data["education"]
        result.total_experience_years = cand_data["experience_years"]
        result.overall_score = cand_data["overall_score"]
        result.seniority_level = (
            "mid" if cand_data["experience_years"] < Decimal("5") else "senior"
        )
        result.experience_score = Decimal("70")
        result.extracted_data = {"skills": [{"name": s} for s in cand_data["skills"]]}
        result.work_model = cand_data["work_model"]
        result.keywords = []

        analysis = MagicMock()
        analysis.id = uuid4()

        details = AnalysisResultDetails(analysis=analysis, result=result)
        match_response = await service._match_details_to_job(details, job.id)

        results.append(
            {
                "candidate": cand_data["name"],
                "response": match_response,
            }
        )

    # === ASSERTIONS ===

    # Candidate 0: Strong - PASS
    assert results[0]["response"].validation_status == "pass"
    assert results[0]["response"].match_score > Decimal("39")
    assert results[0]["response"].recommendation in [
        "strong_match",
        "good_match",
        "potential",
    ]
    assert results[0]["response"].missing_evidence == []

    # Candidate 1: Missing skill - PASS (skills are optional)
    assert results[1]["response"].validation_status == "pass"
    assert results[1]["response"].match_score > Decimal("39")
    assert results[1]["response"].missing_evidence == []

    # Candidate 2: Below minimum - FAIL
    assert results[2]["response"].validation_status == "fail"
    assert results[2]["response"].match_score == Decimal("39")
    assert results[2]["response"].recommendation == "not_match"
    assert len(results[2]["response"].rejection_reasons) > 0
    # Should mention both education and experience
    reasons_text = "\n".join(results[2]["response"].rejection_reasons)
    assert "educação" in reasons_text.lower() or "education" in reasons_text.lower()
    assert "experiência" in reasons_text.lower() or "experience" in reasons_text.lower()

    # Candidate 3: Deal breaker - FAIL
    assert results[3]["response"].validation_status == "fail"
    assert results[3]["response"].match_score == Decimal("39")
    assert results[3]["response"].recommendation == "not_match"
    assert any(
        "remoto" in reason.lower() for reason in results[3]["response"].rejection_reasons
    )

    # === RANKING VALIDATION ===
    ranked = sorted(results, key=lambda r: r["response"].match_score, reverse=True)
    # Top candidates should have pass status
    assert ranked[0]["response"].validation_status == "pass"
    assert ranked[1]["response"].validation_status == "pass"
    # Bottom candidates should have fail status
    assert ranked[2]["response"].validation_status == "fail"
    assert ranked[3]["response"].validation_status == "fail"

    # Score distribution: strong candidates > failed candidates
    assert ranked[0]["response"].match_score > ranked[2]["response"].match_score
    assert ranked[1]["response"].match_score > ranked[3]["response"].match_score

