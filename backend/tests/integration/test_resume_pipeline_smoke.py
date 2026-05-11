import json
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisResponse
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.resume_model import ResumeVersionModel
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password
from src.interface.workers.analysis_tasks import _process_analysis_async
from src.interface.workers.analysis_tasks import _remove_sensitive_resume_data
from src.interface.workers.resume_extraction_tasks import _process_resume_extraction_async
from tests.conftest import TestSessionFactory


def _stub_celery_sessionmaker() -> AsyncMock:
    return AsyncMock(
        return_value=(
            SimpleNamespace(dispose=AsyncMock()),
            TestSessionFactory,
        )
    )


async def _create_active_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _ensure_skills(
    session: AsyncSession,
    specs: list[dict],
) -> list[SkillModel]:
    normalized_names = [spec["normalized_name"] for spec in specs]
    existing = {
        skill.normalized_name: skill
        for skill in (
            await session.execute(
                sa.select(SkillModel).where(SkillModel.normalized_name.in_(normalized_names))
            )
        ).scalars().all()
    }

    created: list[SkillModel] = []
    for spec in specs:
        normalized_name = spec["normalized_name"]
        if normalized_name in existing:
            created.append(existing[normalized_name])
            continue

        skill = SkillModel(**spec)
        session.add(skill)
        created.append(skill)

    await session.commit()
    return created


def _pdf_with_text(text: str) -> bytes:
    sanitized = text.replace("\\", "/").replace("(", "[").replace(")", "]")
    stream = f"BT /F1 11 Tf 36 740 Td ({sanitized}) Tj ET"
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        (
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
        ),
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        (
            f"5 0 obj << /Length {len(stream.encode())} >> stream\n"
            f"{stream}\nendstream endobj\n"
        ).encode(),
    ]
    body = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(body))
        body += obj

    xref_offset = len(body)
    xref = f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        xref += f"{offset:010d} 00000 n \n".encode()

    trailer = (
        f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    return body + xref + trailer


def _analysis_payload(
    *,
    name: str,
    location: str,
    work_model: str,
    experiences: list[dict],
    skills: list[dict],
    education: list[dict],
    keywords: list[str] | None = None,
    employment_gaps: list[dict] | None = None,
    quality_total: int = 80,
) -> dict:
    return {
        "personal_info": {
            "name": name,
            "email": f"{name.lower().replace(' ', '.')}@example.com",
            "phone": None,
            "location": location,
            "work_model": work_model,
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
        "employment_gaps": employment_gaps or [],
        "cv_quality_score": {"total": quality_total},
        "keywords": keywords or [],
    }


@pytest.mark.asyncio
async def test_resume_pipeline_smoke_realish_pdfs(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "src.infrastructure.database.connection.AsyncSessionFactory",
        TestSessionFactory,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )
    monkeypatch.setattr(
        "src.interface.api.routers.analyses.enqueue_analysis",
        lambda analysis_id: None,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
        lambda version_id: None,
    )
    monkeypatch.setattr(
        "src.interface.workers.matching_tasks.match_analysis_to_job.delay",
        lambda analysis_id, job_id: None,
    )

    recruiter = await _create_active_user(
        db_session,
        "recruiter-smoke-pipeline@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    recruiter_headers = await _auth_headers(
        client,
        "recruiter-smoke-pipeline@test.com",
        "password123",
    )

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-smoke-{uuid4()}",
        model_name="Claude Smoke Pipeline Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"smoke_pipeline_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        system_prompt="Analyze the resume carefully",
        user_prompt_template="Resume:\n{resume_text}\nContext:\n{job_context}",
        is_active=True,
        created_by=recruiter.id,
    )
    score_version = ScoreModelVersionModel(
        version=f"smoke-{uuid4().hex[:8]}",
        weights={
            "skill_match": 0.40,
            "experience_match": 0.25,
            "seniority_match": 0.15,
            "education": 0.10,
            "ai_confidence": 0.10,
        },
        thresholds={"high": 70, "low": 45},
        is_active=True,
    )
    db_session.add_all([ai_model, prompt, score_version])
    await db_session.commit()

    candidates = [
        {
            "name": "Helena Rocha Strong",
            "email": "helena.strong@example.com",
            "resume_text": (
                "Helena Rocha Strong Senior backend engineer Python Java SQL Node.js AWS Docker "
                "architected payment systems from 2016 to 2024 led resilient APIs improved latency "
                "wrote migrations mentored squads delivered remote projects from Sao Paulo"
            ),
            "ai_payload": _analysis_payload(
                name="Helena Rocha Strong",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "Atlas",
                        "role_title": "Senior Backend Engineer",
                        "start_date": "2016-01",
                        "end_date": "2024-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Python Java SQL Node.js AWS Docker",
                    }
                ],
                skills=[
                    {"name": "Python", "proficiency": "expert"},
                    {"name": "Java", "proficiency": "advanced"},
                    {"name": "SQL", "proficiency": "expert"},
                    {"name": "Node.js", "proficiency": "advanced"},
                    {"name": "AWS", "proficiency": "advanced"},
                    {"name": "Docker", "proficiency": "advanced"},
                ],
                education=[
                    {
                        "degree": "master",
                        "field": "Computer Science",
                        "institution": "USP",
                        "end_date": "2015-12",
                    }
                ],
                quality_total=88,
            ),
        },
        {
            "name": "Bruno Lima Gap",
            "email": "bruno.gap@example.com",
            "resume_text": (
                "Bruno Lima Gap backend engineer Python SQL Node.js Docker Sao Paulo remote "
                "2019 2022 main role 2020 2021 parallel consulting 2022 2025 product team "
                "resume notes a short career gap but steady delivery and clean architecture"
            ),
            "ai_payload": _analysis_payload(
                name="Bruno Lima Gap",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "CoreBank",
                        "role_title": "Backend Engineer",
                        "start_date": "2019-01",
                        "end_date": "2022-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Python SQL services",
                    },
                    {
                        "company": "Freelance",
                        "role_title": "Consultant",
                        "start_date": "2020-01",
                        "end_date": "2021-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Overlapping consulting should not inflate experience",
                    },
                    {
                        "company": "Nova",
                        "role_title": "Software Engineer",
                        "start_date": "2022-07",
                        "end_date": "2025-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Node.js and Docker platform work",
                    },
                ],
                skills=[
                    {"name": "Python", "proficiency": "advanced"},
                    {"name": "SQL", "proficiency": "advanced"},
                    {"name": "Node.js", "proficiency": "advanced"},
                    {"name": "Docker", "proficiency": "intermediate"},
                ],
                education=[
                    {
                        "degree": "bachelor",
                        "field": "Information Systems",
                        "institution": "UFABC",
                        "end_date": "2018-12",
                    }
                ],
                employment_gaps=[
                    {
                        "start_date": "2022-02",
                        "end_date": "2022-06",
                        "duration_months": 5,
                    }
                ],
                quality_total=76,
            ),
        },
        {
            "name": "Clara Nunes Weak",
            "email": "clara.weak@example.com",
            "resume_text": (
                "Clara Nunes Weak articulate profile excellent writing polished summary Python "
                "JavaScript remote Sao Paulo but only short projects from 2023 to 2025 and no "
                "evidence of Java SQL Node.js AWS depth"
            ),
            "ai_payload": _analysis_payload(
                name="Clara Nunes Weak",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "Studio",
                        "role_title": "Developer",
                        "start_date": "2023-01",
                        "end_date": "2025-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Python and JavaScript web work",
                    }
                ],
                skills=[
                    {"name": "Python", "proficiency": "intermediate"},
                    {"name": "JavaScript", "proficiency": "advanced"},
                ],
                education=[
                    {
                        "degree": "master",
                        "field": "Software Engineering",
                        "institution": "PUC",
                        "end_date": "2022-12",
                    }
                ],
                quality_total=92,
            ),
        },
        {
            "name": "Diego Messy Format",
            "email": "diego.messy@example.com",
            "resume_text": (
                "Diego Messy Format ### backend ??? Node AWS hybrid Rio outsourcing "
                "@@@ dates scrambled 2024 2024 random separators no reliable structure"
            ),
            "ai_payload": _analysis_payload(
                name="Diego Messy Format",
                location="Rio de Janeiro",
                work_model="hybrid",
                experiences=[
                    {
                        "company": "Temp",
                        "role_title": "Support Dev",
                        "start_date": "2024-01",
                        "end_date": "2024-12",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Node and AWS snippets",
                    }
                ],
                skills=[
                    {"name": "Node", "proficiency": "intermediate"},
                    {"name": "AWS", "proficiency": "basic"},
                ],
                education=[],
                keywords=["outsourcing"],
                quality_total=38,
            ),
        },
        {
            "name": "Erica Ambiguous Skills",
            "email": "erica.ambiguous@example.com",
            "resume_text": (
                "Erica Ambiguous Skills backend engineer Python JavaScript PostgreSQL Node "
                "Amazon Web Services remote Sao Paulo from 2018 to 2024 built APIs and data flows"
            ),
            "ai_payload": _analysis_payload(
                name="Erica Ambiguous Skills",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "DataMesh",
                        "role_title": "Backend Engineer",
                        "start_date": "2018-01",
                        "end_date": "2024-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Python JavaScript PostgreSQL Node AWS",
                    }
                ],
                skills=[
                    {"name": "Python", "proficiency": "advanced"},
                    {"name": "JavaScript", "proficiency": "advanced"},
                    {"name": "PostgreSQL", "proficiency": "advanced"},
                    {"name": "Node", "proficiency": "advanced"},
                    {"name": "Amazon Web Services", "proficiency": "advanced"},
                ],
                education=[
                    {
                        "degree": "bachelor",
                        "field": "Computer Engineering",
                        "institution": "Mackenzie",
                        "end_date": "2017-12",
                    }
                ],
                quality_total=70,
            ),
        },
        {
            "name": "Fabio No Dates",
            "email": "fabio.nodates@example.com",
            "resume_text": (
                "Fabio No Dates Python Java SQL Node.js AWS remote Sao Paulo strong claims "
                "but no trustworthy dates only vague periods like several years and long projects"
            ),
            "ai_payload": _analysis_payload(
                name="Fabio No Dates",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "Unknown",
                        "role_title": "Platform Engineer",
                        "start_date": None,
                        "end_date": None,
                        "is_current": False,
                        "duration_months": None,
                        "description": "Strong stack but no reliable dates",
                    }
                ],
                skills=[
                    {"name": "Python", "proficiency": "advanced"},
                    {"name": "Java", "proficiency": "advanced"},
                    {"name": "SQL", "proficiency": "advanced"},
                    {"name": "Node.js", "proficiency": "advanced"},
                    {"name": "AWS", "proficiency": "advanced"},
                ],
                education=[
                    {
                        "degree": "bachelor",
                        "field": "Computer Science",
                        "institution": "UFPE",
                        "end_date": "2019-12",
                    }
                ],
                quality_total=58,
            ),
        },
    ]

    candidate_rows: dict[str, CandidateModel] = {}
    for item in candidates:
        candidate = CandidateModel(
            user_id=None,
            full_name=item["name"],
            email=item["email"],
            created_by=recruiter.id,
        )
        db_session.add(candidate)
        await db_session.flush()
        candidate_rows[item["name"]] = candidate
    await db_session.commit()

    job_response = await client.post(
        "/api/v1/jobs",
        headers=recruiter_headers,
        json={
            "title": "Senior Backend Platform Engineer",
            "description": "Remote backend role in Sao Paulo requiring Python Java SQL Node.js AWS",
            "requirements": "Python, Java, SQL, Node.js, AWS",
            "job_area": "technology",
            "seniority_level": "senior",
            "work_model": "remote",
            "location": "Sao Paulo",
            "salary_min": "15000.00",
            "salary_max": "23000.00",
            "salary_currency": "brl",
            "minimum_education_level": "bachelor",
            "minimum_years_experience": "5.0",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "not_equals",
                    "value": "Sao Paulo",
                    "reason": "Localizacao obrigatoria em Sao Paulo",
                    "is_active": True,
                },
                {
                    "field": "work_model",
                    "operator": "not_equals",
                    "value": "remote",
                    "reason": "Vaga requer trabalho remoto",
                    "is_active": True,
                },
            ],
        },
    )
    assert job_response.status_code == 201
    job_id = UUID(job_response.json()["id"])

    skills = await _ensure_skills(
        db_session,
        [
            {"name": "Python", "normalized_name": "python"},
            {"name": "Java", "normalized_name": "java"},
            {"name": "SQL", "normalized_name": "sql"},
            {"name": "Node.js", "normalized_name": "node.js"},
            {"name": "AWS", "normalized_name": "aws"},
            {"name": "Docker", "normalized_name": "docker"},
            {"name": "Kubernetes", "normalized_name": "kubernetes"},
        ],
    )

    skill_names = {skill.name: skill.name for skill in skills}
    for skill_name in ["Python", "Java", "SQL", "Node.js", "AWS"]:
        response = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            headers=recruiter_headers,
            json={"skill_name": skill_names[skill_name], "priority_level": "priority"},
        )
        assert response.status_code == 201
    for skill_name in ["Docker", "Kubernetes"]:
        response = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            headers=recruiter_headers,
            json={"skill_name": skill_names[skill_name], "priority_level": "complementary"},
        )
        assert response.status_code == 201

    publish_response = await client.patch(
        f"/api/v1/jobs/{job_id}/publish",
        headers=recruiter_headers,
    )
    assert publish_response.status_code == 200

    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._provider_api_key_is_configured",
        lambda provider: True,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._real_ai_calls_allowed",
        lambda: True,
    )

    payload_by_name = {item["name"]: item["ai_payload"] for item in candidates}
    seen_resume_texts: dict[str, str] = {}

    class FakeAIService:
        async def analyze(self, request):
            matched_name = next(
                name for name in payload_by_name
                if name in request.resume_text
            )
            seen_resume_texts[matched_name] = request.resume_text
            return AIAnalysisResponse(
                content=json.dumps(payload_by_name[matched_name]),
                input_tokens=100,
                output_tokens=200,
                cache_read_tokens=0,
                cache_write_tokens=0,
                processing_time_ms=250,
            )

    monkeypatch.setattr(
        "src.infrastructure.ai.factory.AIServiceFactory.create",
        lambda provider, model_id: FakeAIService(),
    )

    uploaded: dict[str, dict] = {}
    for item in candidates:
        init_upload = await client.post(
            "/api/v1/resumes",
            headers=recruiter_headers,
            json={"candidate_id": str(candidate_rows[item["name"]].id)},
        )
        assert init_upload.status_code == 202
        resume_id = init_upload.json()["resume_id"]

        pdf = _pdf_with_text(item["resume_text"])
        upload_response = await client.post(
            f"/api/v1/resumes/{resume_id}/upload",
            headers=recruiter_headers,
            files={"file": (f"{item['name'].lower().replace(' ', '-')}.pdf", pdf, "application/pdf")},
        )
        assert upload_response.status_code == 202
        upload_payload = upload_response.json()
        assert upload_payload["analysis_auto_requested"] is False
        assert upload_payload["analysis_status"] is None
        assert upload_response.json()["extraction_status"] == "pending"

        extraction_result = await _process_resume_extraction_async(
            resume_version_id=upload_payload["version_id"]
        )
        assert extraction_result["status"] == "completed"

        analysis_request = await client.post(
            "/api/v1/analyses",
            headers=recruiter_headers,
            params={
                "resume_version_id": upload_payload["version_id"],
                "job_id": str(job_id),
            },
        )
        assert analysis_request.status_code == 202
        analysis_payload = analysis_request.json()
        uploaded[item["name"]] = {
            **upload_payload,
            "analysis_id": analysis_payload["analysis_id"],
            "analysis_status": analysis_payload["status"],
        }
        assert analysis_payload["status"] == "pending"

    analysis_ids = [UUID(uploaded[item["name"]]["analysis_id"]) for item in candidates]
    for analysis_id in analysis_ids:
        worker_result = await _process_analysis_async(analysis_id, f"task-{analysis_id.hex[:8]}")
        assert worker_result["status"] == "completed"

    await db_session.commit()

    version_rows = {
        row.original_file_name: row
        for row in (
            await db_session.execute(sa.select(ResumeVersionModel))
        ).scalars().all()
    }
    analysis_results = {
        row.analysis_id: row
        for row in (
            await db_session.execute(sa.select(AnalysisResultModel))
        ).scalars().all()
    }

    matches_by_name: dict[str, dict] = {}
    for item in candidates:
        analysis_id = UUID(uploaded[item["name"]]["analysis_id"])
        response = await client.post(
            f"/api/v1/analyses/{analysis_id}/match/{job_id}",
            headers=recruiter_headers,
        )
        assert response.status_code == 200
        matches_by_name[item["name"]] = response.json()

    scoring_response = await client.post(
        f"/api/v1/jobs/{job_id}/scoring",
        headers=recruiter_headers,
    )
    assert scoring_response.status_code == 200

    ranking_response = await client.get(
        f"/api/v1/jobs/{job_id}/ranking",
        headers=recruiter_headers,
    )
    assert ranking_response.status_code == 200
    ranking = ranking_response.json()

    # Extraction evidence
    for item in candidates:
        stored_resume = next(
            row for file_name, row in version_rows.items()
            if item["name"].lower().replace(" ", "-") in file_name
        )
        assert item["name"] in stored_resume.extracted_text
        assert stored_resume.word_count >= 10
        assert seen_resume_texts[item["name"]] == _remove_sensitive_resume_data(
            stored_resume.extracted_text
        )

    # Parser evidence
    result_by_name = {
        item["name"]: analysis_results[UUID(uploaded[item["name"]]["analysis_id"])]
        for item in candidates
    }
    assert all(result_by_name[item["name"]].analysis_id == UUID(uploaded[item["name"]]["analysis_id"]) for item in candidates)
    assert result_by_name["Fabio No Dates"].total_experience_years is None
    assert result_by_name["Diego Messy Format"].highest_education_level == "none"

    # Matching evidence
    assert matches_by_name["Helena Rocha Strong"]["recommendation"] != "not_match"
    assert matches_by_name["Helena Rocha Strong"]["priority_skills_matched"] == 5

    assert matches_by_name["Bruno Lima Gap"]["priority_skills_matched"] == 3
    assert matches_by_name["Bruno Lima Gap"]["recommendation"] != "strong_match"

    assert matches_by_name["Diego Messy Format"]["validation_status"] in {"fail", "unknown"}
    assert matches_by_name["Diego Messy Format"]["recommendation"] in {
        "not_match",
        "review_manually",
    }
    reasons_text = " | ".join(matches_by_name["Diego Messy Format"]["rejection_reasons"]).lower()
    assert reasons_text

    assert matches_by_name["Erica Ambiguous Skills"]["priority_skills_matched"] == 4
    assert matches_by_name["Erica Ambiguous Skills"]["priority_skills_total"] == 5
    assert matches_by_name["Erica Ambiguous Skills"]["recommendation"] != "strong_match"

    assert matches_by_name["Fabio No Dates"]["validation_status"] == "unknown"
    assert matches_by_name["Fabio No Dates"]["recommendation"] == "review_manually"
    assert "experience" in matches_by_name["Fabio No Dates"]["missing_evidence"]

    # Ranking evidence
    assert ranking["total_candidates"] == len(ranking["candidates"])
    for entry in ranking["candidates"]:
        assert "job_fit_score" in entry
        assert "final_score" not in entry

    persisted_matches = (
        await db_session.execute(
            sa.select(CandidateJobMatchModel).where(CandidateJobMatchModel.job_id == job_id)
        )
    ).scalars().all()
    assert len(persisted_matches) == 6

    print("\nPIPELINE SMOKE EVIDENCE")
    for item in candidates:
        name = item["name"]
        parsed = result_by_name[name]
        match = matches_by_name[name]
        ranking_entry = next(
            (entry for entry in ranking["candidates"] if entry["candidate_name"] == name),
            None,
        )
        print(
            f"- {name}: years={parsed.total_experience_years} "
            f"priority={match['priority_skills_matched']}/{match['priority_skills_total']} "
            f"validation={match['validation_status']} recommendation={match['recommendation']} "
            f"job_fit_score={ranking_entry['job_fit_score'] if ranking_entry else 'MISSING'} "
            f"decision={ranking_entry['decision_suggestion'] if ranking_entry else 'MISSING'}"
        )


@pytest.mark.asyncio
async def test_resume_pipeline_smoke_skill_normalization_real_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "src.infrastructure.database.connection.AsyncSessionFactory",
        TestSessionFactory,
    )
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        _stub_celery_sessionmaker(),
    )
    monkeypatch.setattr(
        "src.interface.api.routers.analyses.enqueue_analysis",
        lambda analysis_id: None,
    )
    monkeypatch.setattr(
        "src.interface.api.routers.resumes.enqueue_resume_extraction",
        lambda version_id: None,
    )
    monkeypatch.setattr(
        "src.interface.workers.matching_tasks.match_analysis_to_job.delay",
        lambda analysis_id, job_id: None,
    )

    recruiter = await _create_active_user(
        db_session,
        "recruiter-skill-smoke@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    recruiter_headers = await _auth_headers(
        client,
        "recruiter-skill-smoke@test.com",
        "password123",
    )

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-skill-smoke-{uuid4()}",
        model_name="Claude Skill Smoke Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"skill_smoke_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        system_prompt="Analyze the resume carefully",
        user_prompt_template="Resume:\n{resume_text}\nContext:\n{job_context}",
        is_active=True,
        created_by=recruiter.id,
    )
    score_version = ScoreModelVersionModel(
        version=f"skill-smoke-{uuid4().hex[:8]}",
        weights={
            "skill_match": 0.40,
            "experience_match": 0.25,
            "seniority_match": 0.15,
            "education": 0.10,
            "ai_confidence": 0.10,
        },
        thresholds={"high": 70, "low": 45},
        is_active=True,
    )
    db_session.add_all([ai_model, prompt, score_version])
    await db_session.commit()

    job_response = await client.post(
        "/api/v1/jobs",
        headers=recruiter_headers,
        json={
            "title": "Backend Python Engineer",
            "description": "Python backend role with PostgreSQL and Docker",
            "requirements": "Python, PostgreSQL, Docker",
            "job_area": "technology",
            "seniority_level": "senior",
            "work_model": "remote",
            "location": "Sao Paulo",
            "salary_min": "15000.00",
            "salary_max": "23000.00",
            "salary_currency": "brl",
            "minimum_education_level": "bachelor",
            "minimum_years_experience": "5.0",
        },
    )
    assert job_response.status_code == 201
    job_id = UUID(job_response.json()["id"])

    skills = await _ensure_skills(
        db_session,
        [
            {"name": "Python", "normalized_name": "python"},
            {"name": "PostgreSQL", "normalized_name": "postgresql"},
            {"name": "Docker", "normalized_name": "docker"},
        ],
    )

    skill_names = {skill.name: skill.name for skill in skills}
    for skill_name in ["Python", "PostgreSQL", "Docker"]:
        response = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            headers=recruiter_headers,
            json={"skill_name": skill_names[skill_name], "priority_level": "priority"},
        )
        assert response.status_code == 201

    publish_response = await client.patch(
        f"/api/v1/jobs/{job_id}/publish",
        headers=recruiter_headers,
    )
    assert publish_response.status_code == 200

    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._provider_api_key_is_configured",
        lambda provider: True,
    )
    monkeypatch.setattr(
        "src.interface.workers.analysis_tasks._real_ai_calls_allowed",
        lambda: True,
    )

    candidates = [
        {
            "name": "Styled Python",
            "resume_text": "Styled Python Developer Python PostgreSQL Docker from Sao Paulo",
            "ai_payload": _analysis_payload(
                name="Styled Python",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "Atlas",
                        "role_title": "Backend Engineer",
                        "start_date": "2018-01",
                        "end_date": "2024-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Python PostgreSQL Docker",
                    }
                ],
                skills=[
                    {"name": "**Python**", "proficiency": "expert"},
                    {"name": "PostgreSQL", "proficiency": "advanced"},
                    {"name": "Docker", "proficiency": "advanced"},
                ],
                education=[
                    {
                        "degree": "bachelor",
                        "field": "Computer Science",
                        "institution": "USP",
                        "end_date": "2017-12",
                    }
                ],
                quality_total=82,
            ),
        },
        {
            "name": "Phrase Python",
            "resume_text": "Phrase Python Developer Python PostgreSQL Docker from Sao Paulo",
            "ai_payload": _analysis_payload(
                name="Phrase Python",
                location="Sao Paulo",
                work_model="remote",
                experiences=[
                    {
                        "company": "Atlas",
                        "role_title": "Backend Engineer",
                        "start_date": "2018-01",
                        "end_date": "2024-01",
                        "is_current": False,
                        "duration_months": None,
                        "description": "Python PostgreSQL Docker",
                    }
                ],
                skills=[
                    {"name": "Python Developer", "proficiency": "expert"},
                    {"name": "PostgreSQL", "proficiency": "advanced"},
                    {"name": "Docker", "proficiency": "advanced"},
                ],
                education=[
                    {
                        "degree": "bachelor",
                        "field": "Computer Science",
                        "institution": "USP",
                        "end_date": "2017-12",
                    }
                ],
                quality_total=82,
            ),
        },
    ]

    candidate_rows: dict[str, CandidateModel] = {}
    for item in candidates:
        candidate = CandidateModel(
            user_id=None,
            full_name=item["name"],
            email=f"{item['name'].lower().replace(' ', '.')}@example.com",
            created_by=recruiter.id,
        )
        db_session.add(candidate)
        await db_session.flush()
        candidate_rows[item["name"]] = candidate
    await db_session.commit()

    payload_by_name = {item["name"]: item["ai_payload"] for item in candidates}

    class FakeAIService:
        async def analyze(self, request):
            matched_name = next(
                name for name in payload_by_name
                if name in request.resume_text
            )
            return AIAnalysisResponse(
                content=json.dumps(payload_by_name[matched_name]),
                input_tokens=100,
                output_tokens=200,
                cache_read_tokens=0,
                cache_write_tokens=0,
                processing_time_ms=250,
            )

    monkeypatch.setattr(
        "src.infrastructure.ai.factory.AIServiceFactory.create",
        lambda provider, model_id: FakeAIService(),
    )

    uploaded: dict[str, dict] = {}
    for item in candidates:
        init_upload = await client.post(
            "/api/v1/resumes",
            headers=recruiter_headers,
            json={"candidate_id": str(candidate_rows[item["name"]].id)},
        )
        assert init_upload.status_code == 202
        resume_id = init_upload.json()["resume_id"]

        pdf = _pdf_with_text(item["resume_text"])
        upload_response = await client.post(
            f"/api/v1/resumes/{resume_id}/upload",
            headers=recruiter_headers,
            files={"file": (f"{item['name'].lower().replace(' ', '-')}.pdf", pdf, "application/pdf")},
        )
        assert upload_response.status_code == 202
        upload_payload = upload_response.json()
        assert upload_payload["analysis_auto_requested"] is False
        assert upload_payload["analysis_status"] is None
        assert upload_response.json()["extraction_status"] == "pending"

        extraction_result = await _process_resume_extraction_async(
            resume_version_id=upload_payload["version_id"]
        )
        assert extraction_result["status"] == "completed"

        analysis_request = await client.post(
            "/api/v1/analyses",
            headers=recruiter_headers,
            params={
                "resume_version_id": upload_payload["version_id"],
                "job_id": str(job_id),
            },
        )
        assert analysis_request.status_code == 202
        analysis_payload = analysis_request.json()
        uploaded[item["name"]] = {
            **upload_payload,
            "analysis_id": analysis_payload["analysis_id"],
            "analysis_status": analysis_payload["status"],
        }
        assert analysis_payload["status"] == "pending"

    for item in candidates:
        analysis_id = UUID(uploaded[item["name"]]["analysis_id"])
        worker_result = await _process_analysis_async(analysis_id, f"skill-{analysis_id.hex[:8]}")
        assert worker_result["status"] == "completed"

    matches_by_name: dict[str, dict] = {}
    for item in candidates:
        analysis_id = UUID(uploaded[item["name"]]["analysis_id"])
        response = await client.post(
            f"/api/v1/analyses/{analysis_id}/match/{job_id}",
            headers=recruiter_headers,
        )
        assert response.status_code == 200
        matches_by_name[item["name"]] = response.json()

    scoring_response = await client.post(
        f"/api/v1/jobs/{job_id}/scoring",
        headers=recruiter_headers,
    )
    assert scoring_response.status_code == 200

    ranking_response = await client.get(
        f"/api/v1/jobs/{job_id}/ranking",
        headers=recruiter_headers,
    )
    assert ranking_response.status_code == 200
    ranking = ranking_response.json()

    print("\nSKILL NORMALIZATION SMOKE")
    print("ranking_candidates=", [entry["candidate_name"] for entry in ranking["candidates"]])
    for name in [item["name"] for item in candidates]:
        entry = next(
            (candidate for candidate in ranking["candidates"] if candidate["candidate_name"] == name),
            None,
        )
        print(
            f"- {name}: match={matches_by_name[name]['recommendation']} "
            f"priority={matches_by_name[name]['priority_skills_matched']}/{matches_by_name[name]['priority_skills_total']} "
            f"decision={entry['decision_suggestion'] if entry else 'MISSING'} "
            f"score={entry['job_fit_score'] if entry else 'MISSING'}"
        )

    assert matches_by_name["Styled Python"]["recommendation"] != "not_match"
    assert matches_by_name["Phrase Python"]["recommendation"] != "not_match"
    assert matches_by_name["Styled Python"]["priority_skills_matched"] == 3
    assert matches_by_name["Phrase Python"]["priority_skills_matched"] == 3
    assert ranking["total_candidates"] == len(ranking["candidates"])
    for entry in ranking["candidates"]:
        assert "job_fit_score" in entry
        assert "final_score" not in entry
