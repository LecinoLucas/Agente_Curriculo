import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.application.services.analysis_service import AnalysisResultDetails, AnalysisService
from src.infrastructure.ai.response_parser import parse_analysis_response


def _make_row(
    skill_name: str,
    *,
    is_mandatory: bool,
    aliases: list[str] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        skill_name=skill_name,
        skill_aliases=aliases or [],
        JobRequiredSkillModel=SimpleNamespace(is_mandatory=is_mandatory),
    )


def _make_job(
    *,
    seniority: str = "senior",
    minimum_education_level: str | None = None,
    minimum_years_experience: Decimal | None = None,
    deal_breakers: list[dict] | None = None,
) -> MagicMock:
    job = MagicMock()
    job.id = uuid4()
    job.seniority_level = seniority
    job.minimum_education_level = minimum_education_level
    job.minimum_years_experience = minimum_years_experience
    job.deal_breakers = deal_breakers or []
    return job


def _make_result(
    *,
    skills: list[str] | None = None,
    keywords: list[str] | None = None,
    seniority: str = "senior",
    overall_score: Decimal = Decimal("90"),
    highest_education_level: str | None = "master",
    total_experience_years: Decimal | None = Decimal("7.0"),
    work_model: str | None = "remote",
    location: str | None = "Sao Paulo",
) -> MagicMock:
    result = MagicMock()
    result.keywords = keywords or []
    result.extracted_data = {"skills": [{"name": skill} for skill in (skills or [])]}
    result.seniority_level = seniority
    result.overall_score = overall_score
    result.experience_score = Decimal("70")
    result.highest_education_level = highest_education_level
    result.total_experience_years = total_experience_years
    result.work_model = work_model
    result.location = location
    return result


def _make_service(job: MagicMock, job_skill_rows: list[SimpleNamespace]) -> AnalysisService:
    repo = MagicMock()
    repo.find_active_job = AsyncMock(return_value=job)
    repo.list_active_job_skill_rows = AsyncMock(return_value=job_skill_rows)
    repo.find_active_score_model_version = AsyncMock(return_value=None)
    repo.find_job_match = AsyncMock(return_value=None)
    repo.save_job_match = AsyncMock()
    repo.session = MagicMock()
    repo.session.scalar = AsyncMock(return_value=None)
    return AnalysisService(repository=repo)


async def _match(
    *,
    job: MagicMock,
    job_skills: list[SimpleNamespace],
    result: MagicMock,
):
    service = _make_service(job, job_skills)
    analysis = MagicMock()
    analysis.id = uuid4()
    details = AnalysisResultDetails(analysis=analysis, result=result)
    return await service._match_details_to_job(details, job.id)


def _build_v2_payload(*, experiences: list[dict], skills: list[dict], education: list[dict]) -> dict:
    return {
        "personal_info": {
            "name": "Edge Case Candidate",
            "email": "edge@example.com",
            "phone": None,
            "location": "Sao Paulo",
        },
        "experience": experiences,
        "skills": skills,
        "leadership": {
            "has_management": False,
            "has_project_lead": False,
            "has_mentoring": False,
            "has_cross_team": False,
        },
        "education": education,
        "languages": [{"language": "English", "level": "advanced"}],
        "employment_gaps": [],
        "cv_quality_score": {"total": 82},
    }


def _long_resume_text(words: int = 620) -> str:
    tokens = [f"impacto{i}" for i in range(words)]
    return "###\n" + "  ".join(tokens) + "\n\n-- stack:: Python | Node.js | AWS --"


def test_parser_handles_long_and_malformatted_cv_payload() -> None:
    payload = _build_v2_payload(
        experiences=[
            {
                "company": "Acme",
                "role_title": "Backend Engineer",
                "start_date": "2020-01",
                "end_date": "2025-01",
                "is_current": False,
                "duration_months": None,
                "description": _long_resume_text(),
            }
        ],
        skills=[
            {"name": "Python", "proficiency": "advanced"},
            {"name": "Node.js", "proficiency": "advanced"},
            {"name": "AWS", "proficiency": "intermediate"},
        ],
        education=[
            {
                "degree": "bachelor",
                "field": "Computer Science",
                "institution": "USP",
                "end_date": "2019-12",
            }
        ],
    )

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["total_experience_years"] == 5.0
    assert parsed["communication_score"] == 82.0
    assert parsed["keywords"] == ["Python", "Node.js", "AWS"]
    assert [skill["name"] for skill in parsed["extracted_data"]["skills"]] == [
        "Python",
        "Node.js",
        "AWS",
    ]


def test_parser_does_not_double_count_overlapping_experiences() -> None:
    payload = _build_v2_payload(
        experiences=[
            {
                "company": "Acme",
                "role_title": "Engineer I",
                "start_date": "2020-01",
                "end_date": "2023-01",
                "is_current": False,
                "duration_months": None,
                "description": "Service work",
            },
            {
                "company": "Beta",
                "role_title": "Engineer II",
                "start_date": "2021-01",
                "end_date": "2024-01",
                "is_current": False,
                "duration_months": None,
                "description": "Parallel consulting",
            },
            {
                "company": "Gamma",
                "role_title": "Contractor",
                "start_date": "2024-06",
                "end_date": "2023-06",
                "is_current": False,
                "duration_months": 24,
                "description": "Inconsistent dates must not inflate totals",
            },
        ],
        skills=[{"name": "Python", "proficiency": "advanced"}],
        education=[],
    )

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["total_experience_years"] == 4.0


def test_parser_keeps_missing_dates_as_unknown_experience() -> None:
    payload = _build_v2_payload(
        experiences=[
            {
                "company": "Acme",
                "role_title": "Engineer",
                "start_date": None,
                "end_date": None,
                "is_current": False,
                "duration_months": None,
                "description": "Poorly formatted CV with no dates",
            }
        ],
        skills=[{"name": "Python", "proficiency": "advanced"}],
        education=[],
    )

    parsed = parse_analysis_response(json.dumps(payload))

    assert parsed["total_experience_years"] is None


@pytest.mark.asyncio
async def test_problematic_skill_names_do_not_create_false_positive_match() -> None:
    job = _make_job()
    job_skills = [
        _make_row("Java", is_mandatory=True),
        _make_row("Node.js", is_mandatory=True, aliases=["Node"]),
        _make_row("AWS", is_mandatory=True, aliases=["Amazon Web Services"]),
        _make_row("SQL", is_mandatory=True),
    ]
    result = _make_result(
        skills=["JavaScript", "Node", "Amazon Web Services", "PostgreSQL"],
        overall_score=Decimal("95"),
    )

    resp = await _match(job=job, job_skills=job_skills, result=result)

    assert resp.mandatory_skills_matched == 2
    assert resp.mandatory_skills_total == 4
    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")
    assert any("2/4" in reason for reason in resp.rejection_reasons)


@pytest.mark.asyncio
async def test_skill_aliases_preserve_valid_candidate_match() -> None:
    job = _make_job()
    job_skills = [
        _make_row("Java", is_mandatory=True),
        _make_row("Node.js", is_mandatory=True, aliases=["Node"]),
        _make_row("AWS", is_mandatory=True, aliases=["Amazon Web Services"]),
        _make_row("SQL", is_mandatory=True),
    ]
    result = _make_result(
        skills=["Java", "Node", "Amazon Web Services", "SQL"],
        overall_score=Decimal("95"),
    )

    resp = await _match(job=job, job_skills=job_skills, result=result)

    assert resp.mandatory_skills_matched == 4
    assert resp.validation_status == "pass"
    assert resp.match_score > Decimal("39")
    assert resp.recommendation in {"strong_match", "good_match", "potential"}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("matched_skills", "expected_status", "expected_ratio"),
    [
        (["Python", "Django"], "fail", "2/5"),
        (["Python", "Django", "AWS"], "pass", "3/5"),
        (["Python", "Django", "AWS", "Docker"], "pass", "4/5"),
    ],
)
async def test_mandatory_threshold_boundaries(
    matched_skills: list[str],
    expected_status: str,
    expected_ratio: str,
) -> None:
    job = _make_job()
    job_skills = [
        _make_row("Python", is_mandatory=True),
        _make_row("Django", is_mandatory=True),
        _make_row("AWS", is_mandatory=True),
        _make_row("Docker", is_mandatory=True),
        _make_row("Kubernetes", is_mandatory=True),
    ]
    result = _make_result(skills=matched_skills, overall_score=Decimal("92"))

    resp = await _match(job=job, job_skills=job_skills, result=result)

    assert f"{resp.mandatory_skills_matched}/{resp.mandatory_skills_total}" == expected_ratio
    assert resp.validation_status == expected_status
    if expected_status == "fail":
        assert resp.recommendation == "not_match"
        assert resp.match_score <= Decimal("39")
    else:
        assert resp.recommendation != "not_match"
        assert resp.match_score > Decimal("39")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("education_level", "expected_status", "reason_fragment"),
    [
        ("bachelor", "pass", None),
        ("master", "pass", None),
        ("high_school", "fail", "educação insuficiente"),
        ("none", "fail", "educação insuficiente"),
    ],
)
async def test_education_requirements(
    education_level: str,
    expected_status: str,
    reason_fragment: str | None,
) -> None:
    job = _make_job(minimum_education_level="bachelor")
    result = _make_result(
        skills=[],
        highest_education_level=education_level,
        total_experience_years=Decimal("7.0"),
    )

    resp = await _match(job=job, job_skills=[], result=result)

    assert resp.validation_status == expected_status
    if expected_status == "fail":
        assert resp.recommendation == "not_match"
        assert resp.match_score <= Decimal("39")
        assert any(reason_fragment in reason.lower() for reason in resp.rejection_reasons)
    else:
        assert resp.recommendation != "not_match"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("years", "expected_status", "expected_recommendation"),
    [
        (Decimal("4.9"), "fail", "not_match"),
        (Decimal("5.0"), "pass", None),
        (Decimal("0.0"), "fail", "not_match"),
    ],
)
async def test_experience_requirement_boundaries(
    years: Decimal,
    expected_status: str,
    expected_recommendation: str | None,
) -> None:
    job = _make_job(minimum_years_experience=Decimal("5.0"))
    result = _make_result(skills=[], total_experience_years=years)

    resp = await _match(job=job, job_skills=[], result=result)

    assert resp.validation_status == expected_status
    if expected_recommendation is not None:
        assert resp.recommendation == expected_recommendation
        assert resp.match_score <= Decimal("39")
        assert any("experiência insuficiente" in reason.lower() for reason in resp.rejection_reasons)
    else:
        assert resp.recommendation != "not_match"


@pytest.mark.asyncio
async def test_missing_experience_due_to_parsing_goes_to_manual_review() -> None:
    job = _make_job(minimum_years_experience=Decimal("5.0"))
    result = _make_result(skills=[], total_experience_years=None)

    resp = await _match(job=job, job_skills=[], result=result)

    assert resp.validation_status == "unknown"
    assert resp.recommendation == "review_manually"
    assert "experience" in resp.missing_evidence
    assert resp.match_score > Decimal("39")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("deal_breaker", "candidate_kwargs", "reason_fragment"),
    [
        (
            {
                "field": "location",
                "operator": "not_equals",
                "value": "Sao Paulo",
                "reason": "Localizacao obrigatoria em Sao Paulo",
                "is_active": True,
            },
            {"location": "Rio de Janeiro"},
            "sao paulo",
        ),
        (
            {
                "field": "work_model",
                "operator": "not_equals",
                "value": "remote",
                "reason": "Vaga requer trabalho remoto",
                "is_active": True,
            },
            {"work_model": "hybrid"},
            "remoto",
        ),
        (
            {
                "field": "keywords",
                "operator": "contains",
                "value": "outsourcing",
                "reason": "Keyword proibida detectada",
                "is_active": True,
            },
            {"keywords": ["Python", "Outsourcing"]},
            "proibida",
        ),
    ],
)
async def test_deal_breakers_reject_conflicting_candidates(
    deal_breaker: dict,
    candidate_kwargs: dict,
    reason_fragment: str,
) -> None:
    job = _make_job(deal_breakers=[deal_breaker])
    result = _make_result(skills=["Python"], **candidate_kwargs)

    resp = await _match(job=job, job_skills=[], result=result)

    assert resp.validation_status == "fail"
    assert resp.recommendation == "not_match"
    assert resp.match_score <= Decimal("39")
    assert any(reason_fragment in reason.lower() for reason in resp.rejection_reasons)
