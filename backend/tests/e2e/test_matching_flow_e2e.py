import pytest
from decimal import Decimal
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock
from types import SimpleNamespace

from src.application.services.analysis_service import (
    AnalysisService,
    AnalysisResultDetails,
)


def _make_job_skill_row(skill_name: str, is_mandatory: bool):
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=[],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


@pytest.mark.asyncio
async def test_e2e_matching_with_validation_rules():
    job = MagicMock()
    job.id = uuid4()
    job.title = "Senior Backend Engineer"
    job.description = "Build backend APIs"
    job.requirements = "Python PostgreSQL"
    job.seniority_level = "senior"
    job.job_area = "technology"
    job.responsibilities = []
    job.experience_context = ""
    job.behavioral_requirements = []
    job.priority = "normal"
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

    job_skills = [
        _make_job_skill_row("Python", True),
        _make_job_skill_row("PostgreSQL", True),
        _make_job_skill_row("Docker", False),
    ]

    repo = MagicMock()
    candidate_id = uuid4()
    resume_version_id = uuid4()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skills)
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

    service = AnalysisService(repository=repo)

    def make_candidate(data):
        result = MagicMock()
        result.highest_education_level = data["education"]
        result.total_experience_years = data["experience"]
        result.overall_score = data["score"]
        result.experience_score = Decimal("70")
        result.seniority_level = "senior"
        result.work_model = data["work_model"]
        result.extracted_data = {
            "skills": [{"name": s} for s in data["skills"]]
        }
        result.keywords = []

        analysis = MagicMock()
        analysis.id = uuid4()
        analysis.resume_version_id = resume_version_id

        return AnalysisResultDetails(analysis=analysis, result=result)

    candidates = [
        ("perfect", dict(
            skills=["Python", "PostgreSQL", "Docker"],
            education="master",
            experience=Decimal("8"),
            work_model="remote",
            score=Decimal("85"),
        )),
        ("missing_optional", dict(
            skills=["Python", "PostgreSQL"],
            education="master",
            experience=Decimal("7"),
            work_model="remote",
            score=Decimal("75"),
        )),
        ("missing_mandatory", dict(
            skills=["Python"],
            education="master",
            experience=Decimal("8"),
            work_model="remote",
            score=Decimal("80"),
        )),
        ("low_experience", dict(
            skills=["Python", "PostgreSQL"],
            education="bachelor",
            experience=Decimal("2"),
            work_model="remote",
            score=Decimal("70"),
        )),
        ("deal_breaker", dict(
            skills=["Python", "PostgreSQL"],
            education="master",
            experience=Decimal("8"),
            work_model="hybrid",
            score=Decimal("80"),
        )),
    ]

    responses = []

    for name, data in candidates:
        details = make_candidate(data)
        res = await service._match_details_to_job(details, job.id)

        responses.append((name, res))

    # ─────────────────────────────────────────
    # ASSERT REGRAS CRÍTICAS
    # ─────────────────────────────────────────

    res_map = dict(responses)

    # PASS cases
    assert res_map["perfect"].validation_status == "pass"
    assert res_map["missing_optional"].validation_status == "pass"

    # FAIL cases
    assert res_map["missing_mandatory"].validation_status == "fail"
    assert res_map["low_experience"].validation_status == "fail"
    assert res_map["deal_breaker"].validation_status == "fail"

    # Mandatory rule (60%)
    assert res_map["missing_mandatory"].mandatory_skills_matched == 1
    assert res_map["missing_mandatory"].mandatory_skills_total == 2

    # Deal breaker check
    assert any(
        "remoto" in r.lower()
        for r in res_map["deal_breaker"].rejection_reasons
    )

    # Experience check
    assert any(
        "experiência" in r.lower() or "experience" in r.lower()
        for r in res_map["low_experience"].rejection_reasons
    )

    # ─────────────────────────────────────────
    # RANKING REAL
    # ─────────────────────────────────────────

    ranked = sorted(
        responses,
        key=lambda x: x[1].match_score,
        reverse=True,
    )

    # Garantia de ordenação correta
    assert ranked[0][0] == "perfect"
    assert ranked[1][0] == "missing_optional"

    # Garantia de rejeição no final
    assert ranked[-1][1].validation_status == "fail"
