from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisService
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


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


def _candidate_payload(**overrides) -> dict:
    payload = {
        "full_name": "Maria Candidate",
        "email": "MARIA.CANDIDATE@TEST.COM",
        "phone": "+55 11 99999-0000",
        "location_city": "São Paulo",
        "location_state": "SP",
        "location_country": "br",
        "linkedin_url": "https://linkedin.example/maria",
        "github_url": "https://github.example/maria",
        "portfolio_url": "https://portfolio.example/maria",
        "internal_notes": "Perfil indicado para backend",
        "tags": ["Python", " python ", "Senior"],
    }
    payload.update(overrides)
    return payload


def _job_payload(**overrides) -> dict:
    payload = {
        "title": "Backend Engineer",
        "description": "Build and maintain backend APIs",
        "requirements": "Python, FastAPI and PostgreSQL",
        "seniority_level": "senior",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "brl",
    }
    payload.update(overrides)
    return payload


def _pdf_with_text(text: str) -> bytes:
    stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET"
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


@pytest.mark.asyncio
async def test_candidate_role_cannot_create_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "candidate-candidate@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, "candidate-candidate@test.com", "password123")

    response = await client.post("/api/v1/candidates", json=_candidate_payload(), headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_can_crud_candidate_and_soft_delete(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-candidate@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-candidate@test.com", "password123")

    create = await client.post("/api/v1/candidates", json=_candidate_payload(), headers=headers)
    assert create.status_code == 201
    created = create.json()
    assert created["email"] == "maria.candidate@test.com"
    assert created["location_country"] == "BR"
    assert created["tags"] == ["python", "senior"]

    candidate_id = created["id"]
    duplicate = await client.post(
        "/api/v1/candidates",
        json=_candidate_payload(full_name="Maria Duplicate"),
        headers=headers,
    )
    assert duplicate.status_code == 409

    detail = await client.get(f"/api/v1/candidates/{candidate_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == candidate_id

    listing = await client.get("/api/v1/candidates?search=maria", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == candidate_id for item in listing.json()["data"])

    update = await client.patch(
        f"/api/v1/candidates/{candidate_id}",
        json={"full_name": "Maria Silva", "tags": ["Data", "Python"]},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["full_name"] == "Maria Silva"
    assert update.json()["tags"] == ["data", "python"]

    delete = await client.delete(f"/api/v1/candidates/{candidate_id}", headers=headers)
    assert delete.status_code == 204

    deleted_detail = await client.get(f"/api/v1/candidates/{candidate_id}", headers=headers)
    assert deleted_detail.status_code == 404


@pytest.mark.asyncio
async def test_recruiter_must_provide_valid_email_and_can_search_duplicate_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-duplicate@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-duplicate@test.com", "password123")

    missing_email = await client.post(
        "/api/v1/candidates",
        json=_candidate_payload(email=None),
        headers=headers,
    )
    assert missing_email.status_code == 422

    invalid_cpf = await client.post(
        "/api/v1/candidates",
        json=_candidate_payload(cpf="123"),
        headers=headers,
    )
    assert invalid_cpf.status_code == 422
    assert invalid_cpf.json()["detail"] == "CPF deve conter 11 dígitos"

    created = await client.post(
        "/api/v1/candidates",
        json=_candidate_payload(cpf="123.456.789-09"),
        headers=headers,
    )
    assert created.status_code == 201
    created_body = created.json()

    email_duplicate = await client.get(
        "/api/v1/candidates/search?email=maria.candidate@test.com",
        headers=headers,
    )
    assert email_duplicate.status_code == 200
    assert email_duplicate.json() == {
        "exists": True,
        "candidate_id": created_body["id"],
        "full_name": created_body["full_name"],
    }

    cpf_duplicate = await client.get(
        "/api/v1/candidates/search?cpf=12345678909",
        headers=headers,
    )
    assert cpf_duplicate.status_code == 200
    assert cpf_duplicate.json() == {
        "exists": True,
        "candidate_id": created_body["id"],
        "full_name": created_body["full_name"],
    }


@pytest.mark.asyncio
async def test_recruiter_can_view_candidate_overview_with_resume_analysis_and_matches(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-overview@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    await _create_active_user(
        db_session,
        "recruiter-overview@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate_headers = await _auth_headers(client, "candidate-overview@test.com", "password123")
    recruiter_headers = await _auth_headers(client, "recruiter-overview@test.com", "password123")

    resume_upload = await client.post("/api/v1/resumes", headers=candidate_headers)
    assert resume_upload.status_code == 202
    resume_id = UUID(resume_upload.json()["resume_id"])
    resume_version_id = UUID(resume_upload.json()["version_id"])

    pdf_response = await client.post(
        f"/api/v1/resumes/{resume_id}/upload",
        headers=candidate_headers,
        files={
            "file": (
                "overview.pdf",
                _pdf_with_text("Python FastAPI PostgreSQL"),
                "application/pdf",
            )
        },
    )
    assert pdf_response.status_code == 200

    candidate_model = await db_session.scalar(
        sa.select(CandidateModel).where(CandidateModel.user_id == candidate_user.id)
    )
    assert candidate_model is not None

    skill = SkillModel(
        name="Python Overview",
        normalized_name=f"python-overview-{uuid4().hex[:8]}",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-overview-{uuid4()}",
        model_name="Claude Overview Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"overview_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate_user.id,
    )
    db_session.add_all([skill, ai_model, prompt])
    await db_session.flush()

    analysis_id = uuid4()
    now = datetime.now(UTC)
    analysis = AnalysisModel(
        id=analysis_id,
        resume_version_id=resume_version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="completed",
        requested_by=candidate_user.id,
        created_at=now,
        updated_at=now,
        completed_at=now,
    )
    result = AnalysisResultModel(
        id=uuid4(),
        analysis_id=analysis_id,
        overall_score="91.00",
        technical_score="95.00",
        experience_score="84.00",
        education_score="75.00",
        communication_score="86.00",
        leadership_score="72.00",
        candidate_summary="Perfil forte para backend.",
        seniority_level="senior",
        total_experience_years="7.0",
        strengths=["Python"],
        weaknesses=[],
        recommendations=[],
        keywords=["python", "fastapi"],
        extracted_data={"skills": [{"name": "Python"}]},
        created_at=now,
    )
    db_session.add_all([analysis, result])
    await db_session.commit()

    job = await client.post("/api/v1/jobs", json=_job_payload(), headers=recruiter_headers)
    assert job.status_code == 201
    job_id = job.json()["id"]

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=recruiter_headers)
    assert publish.status_code == 200

    add_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_id": str(skill.id), "is_mandatory": True},
        headers=recruiter_headers,
    )
    assert add_skill.status_code == 201

    matched = await AnalysisService(
        SQLAlchemyAnalysisRepository(db_session)
    ).auto_match_published_jobs(
        analysis_id,
    )
    await db_session.commit()
    assert matched >= 1

    overview = await client.get(
        f"/api/v1/candidates/{candidate_model.id}/overview",
        headers=recruiter_headers,
    )
    assert overview.status_code == 200
    body = overview.json()
    assert body["candidate"]["id"] == str(candidate_model.id)
    assert len(body["resumes"]) == 1
    assert body["resumes"][0]["extraction_status"] == "completed"
    assert body["latest_analysis"]["analysis_id"] == str(analysis_id)
    assert body["latest_analysis"]["overall_score"] == 91.0
    assert body["latest_analysis_pipeline"]["analysis_id"] == str(analysis_id)
    assert body["latest_analysis_pipeline"]["published_jobs_total"] >= 1
    assert body["latest_analysis_pipeline"]["matched_jobs_count"] >= 1
    assert body["latest_analysis_pipeline"]["pending_jobs_count"] == (
        body["latest_analysis_pipeline"]["published_jobs_total"]
        - body["latest_analysis_pipeline"]["matched_jobs_count"]
    )
    assert body["latest_analysis_pipeline"]["matching_status"] in {"processing", "completed"}
    assert len(body["top_matches"]) >= 1
    assert body["top_matches"][0]["job_id"] == job_id
    assert body["top_matches"][0]["recommendation"] in {"strong_match", "good_match"}


@pytest.mark.asyncio
async def test_candidate_user_id_must_be_unique_when_linked_to_portal_user(
    db_session: AsyncSession,
):
    candidate_user = await _create_active_user(
        db_session,
        "candidate-link@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    recruiter = await _create_active_user(
        db_session,
        "recruiter-link@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    db_session.add(
        CandidateModel(
            full_name="Candidate One",
            email="candidate-one@test.com",
            user_id=candidate_user.id,
            created_by=recruiter.id,
        )
    )
    await db_session.flush()

    db_session.add(
        CandidateModel(
            full_name="Candidate Two",
            email="candidate-two@test.com",
            user_id=candidate_user.id,
            created_by=recruiter.id,
        )
    )

    with pytest.raises(sa.exc.IntegrityError):
        await db_session.flush()
