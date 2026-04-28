"""End-to-end test of the complete matching flow with deal-breakers and validation.

This test verifies the entire matching pipeline with:
- Mandatory skill filtering (must have >= 60% of required skills)
- Deal-breaker auto-rejection
- Objective validation (PASS/FAIL)
- Score calculation
- Recommendation generation
- Final ranking
"""
import pytest
from decimal import Decimal
from uuid import uuid4
from unittest.mock import MagicMock, AsyncMock
from types import SimpleNamespace

from src.application.services.analysis_service import AnalysisService, AnalysisResultDetails


def _make_job_skill_row(skill_name: str, is_mandatory: bool):
    """Helper to create a job skill row mock."""
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=[],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


@pytest.mark.asyncio
async def test_e2e_matching_with_mandatory_skills_and_validation() -> None:
    """End-to-end test covering mandatory skills, validation, and deal-breakers.

    Job requires:
    - 2 mandatory skills: Python, PostgreSQL (need 60% = both)
    - 1 optional skill: Docker
    - Education: Bachelor minimum
    - Experience: 5 years minimum
    - Work model: Remote (enforced via deal-breaker)
    """

    # === SETUP: Create Job with Mandatory Skills ===
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

    # Job skill requirements: Python (mandatory), PostgreSQL (mandatory), Docker (optional)
    job_skills = [
        _make_job_skill_row("Python", is_mandatory=True),
        _make_job_skill_row("PostgreSQL", is_mandatory=True),
        _make_job_skill_row("Docker", is_mandatory=False),
    ]

    # Create service
    repo = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skills)
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)

    service = AnalysisService(repository=repo)

    # === CANDIDATES DATA ===
    candidates = [
        {
            "name": "Strong Candidate - All Skills",
            "work_model": "remote",
            "education": "master",
            "experience_years": Decimal("8.0"),
            "skills": ["Python", "PostgreSQL", "Docker"],
            "overall_score": Decimal("85"),
            "expected_status": "pass",
            "expected_score_min": Decimal("75"),  # Should be high
        },
        {
            "name": "Missing Optional Skill Only",
            "work_model": "remote",
            "education": "master",
            "experience_years": Decimal("7.0"),
            "skills": ["Python", "PostgreSQL"],  # Has all mandatory, missing Docker
            "overall_score": Decimal("75"),
            "expected_status": "pass",
            "expected_score_min": Decimal("70"),  # Still good, mandatory skills met
        },
        {
            "name": "Missing Mandatory Skill (PostgreSQL)",
            "work_model": "remote",
            "education": "master",
            "experience_years": Decimal("8.0"),
            "skills": ["Python"],  # Only 50% mandatory skills (1/2)
            "overall_score": Decimal("80"),
            "expected_status": "fail",
            "expected_score_max": Decimal("39"),  # Should fail mandatory filter
        },
        {
            "name": "Below Minimum Education/Experience",
            "work_model": "remote",
            "education": "high_school",
            "experience_years": Decimal("2.0"),
            "skills": ["Python", "PostgreSQL", "Docker"],  # Has all skills
            "overall_score": Decimal("70"),
            "expected_status": "fail",
            "expected_score_max": Decimal("39"),  # Fails objective validation
        },
        {
            "name": "Deal Breaker Hit - Not Remote",
            "work_model": "hybrid",  # Violates deal-breaker
            "education": "master",
            "experience_years": Decimal("8.0"),
            "skills": ["Python", "PostgreSQL", "Docker"],
            "overall_score": Decimal("80"),
            "expected_status": "fail",
            "expected_score_max": Decimal("39"),  # Fails deal-breaker
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
                "expected": cand_data,
            }
        )

    # === ASSERTIONS ===

    # Candidate 0: Strong - All Skills - PASS
    assert results[0]["response"].validation_status == "pass", \
        f"Expected PASS, got {results[0]['response'].validation_status}"
    assert results[0]["response"].match_score >= results[0]["expected"]["expected_score_min"], \
        f"Score {results[0]['response'].match_score} below minimum"
    assert results[0]["response"].recommendation in ["strong_match", "good_match", "potential"]
    assert results[0]["response"].mandatory_skills_matched == 2
    assert results[0]["response"].mandatory_skills_total == 2

    # Candidate 1: Missing Optional Skill - PASS
    assert results[1]["response"].validation_status == "pass", \
        f"Expected PASS, got {results[1]['response'].validation_status}"
    assert results[1]["response"].match_score >= results[1]["expected"]["expected_score_min"], \
        f"Score {results[1]['response'].match_score} below minimum"
    assert results[1]["response"].mandatory_skills_matched == 2
    assert results[1]["response"].mandatory_skills_total == 2

    # Candidate 2: Missing Mandatory Skill - FAIL (mandatory filter)
    assert results[2]["response"].validation_status == "fail", \
        f"Expected FAIL (mandatory skill filter), got {results[2]['response'].validation_status}"
    assert results[2]["response"].match_score <= results[2]["expected"]["expected_score_max"], \
        f"Score {results[2]['response'].match_score} should be <= 39"
    assert results[2]["response"].recommendation == "not_match"
    assert results[2]["response"].mandatory_skills_matched == 1  # Only Python
    assert results[2]["response"].mandatory_skills_total == 2
    # Should mention missing mandatory skills
    reasons_text = "\n".join(results[2]["response"].rejection_reasons)
    assert "obrigatória" in reasons_text.lower() or "habilidades" in reasons_text.lower(), \
        f"Should mention missing mandatory skill. Reasons: {results[2]['response'].rejection_reasons}"

    # Candidate 3: Below Minimum Education/Experience - FAIL
    assert results[3]["response"].validation_status == "fail", \
        f"Expected FAIL (objective validation), got {results[3]['response'].validation_status}"
    assert results[3]["response"].match_score <= results[3]["expected"]["expected_score_max"]
    assert results[3]["response"].recommendation == "not_match"
    # Should mention education and experience
    reasons_text = "\n".join(results[3]["response"].rejection_reasons)
    assert "educação" in reasons_text.lower() or "education" in reasons_text.lower()
    assert "experiência" in reasons_text.lower() or "experience" in reasons_text.lower()

    # Candidate 4: Deal Breaker - FAIL
    assert results[4]["response"].validation_status == "fail", \
        f"Expected FAIL (deal-breaker), got {results[4]['response'].validation_status}"
    assert results[4]["response"].match_score <= results[4]["expected"]["expected_score_max"]
    assert results[4]["response"].recommendation == "not_match"
    assert any(
        "remoto" in reason.lower() for reason in results[4]["response"].rejection_reasons
    )

    # === RANKING VALIDATION ===
    ranked = sorted(results, key=lambda r: r["response"].match_score, reverse=True)

    print("\n" + "="*80)
    print("FINAL RANKING")
    print("="*80)
    for rank, item in enumerate(ranked, 1):
        status_icon = "✓" if item["response"].validation_status == "pass" else "✗"
        print(f"{rank}. [{status_icon}] {item['candidate']}: {item['response'].match_score} ({item['response'].recommendation})")

    # Top candidates should have pass status
    assert ranked[0]["response"].validation_status == "pass"
    assert ranked[1]["response"].validation_status == "pass"

    # Bottom candidates should have fail status
    assert ranked[2]["response"].validation_status == "fail"
    assert ranked[3]["response"].validation_status == "fail"
    assert ranked[4]["response"].validation_status == "fail"

    # Score distribution
    assert ranked[0]["response"].match_score > ranked[2]["response"].match_score

