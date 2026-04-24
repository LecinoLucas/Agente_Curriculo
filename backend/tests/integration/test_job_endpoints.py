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
    ResumeJobMatchModel,
)
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


@pytest.mark.asyncio
async def test_candidate_cannot_create_job(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "candidate-job@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, "candidate-job@test.com", "password123")

    response = await client.post("/api/v1/jobs", json=_job_payload(), headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_can_crud_job_and_soft_delete(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job@test.com", "password123")

    create = await client.post("/api/v1/jobs", json=_job_payload(), headers=headers)
    assert create.status_code == 201
    created = create.json()
    assert created["title"] == "Backend Engineer"
    assert created["salary_currency"] == "BRL"

    job_id = created["id"]
    detail = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == job_id

    update = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"title": "Senior Backend Engineer", "salary_max": "20000.00"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["title"] == "Senior Backend Engineer"

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=headers)
    assert publish.status_code == 200
    assert publish.json()["status"] == "published"

    listing = await client.get("/api/v1/jobs", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == job_id for item in listing.json()["data"])

    delete = await client.delete(f"/api/v1/jobs/{job_id}", headers=headers)
    assert delete.status_code == 204

    deleted_detail = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert deleted_detail.status_code == 404

    listing_after_delete = await client.get("/api/v1/jobs", headers=headers)
    assert listing_after_delete.status_code == 200
    assert all(item["id"] != job_id for item in listing_after_delete.json()["data"])


@pytest.mark.asyncio
async def test_match_endpoint_persists_job_candidate_ranking(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _create_active_user(
        db_session,
        "candidate-ranking@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    await _create_active_user(
        db_session,
        "recruiter-ranking@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate_headers = await _auth_headers(client, "candidate-ranking@test.com", "password123")
    recruiter_headers = await _auth_headers(client, "recruiter-ranking@test.com", "password123")

    resume_upload = await client.post("/api/v1/resumes", headers=candidate_headers)
    assert resume_upload.status_code == 202
    resume_version_id = UUID(resume_upload.json()["version_id"])

    skill = SkillModel(
        name="Python",
        normalized_name="python",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    db_session.add(skill)
    await db_session.flush()

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-ranking-{uuid4()}",
        model_name="Claude Ranking Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"ranking_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    analysis_id = uuid4()
    now = datetime.now(UTC)
    analysis = AnalysisModel(
        id=analysis_id,
        resume_version_id=resume_version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="completed",
        requested_by=candidate.id,
        created_at=now,
        updated_at=now,
    )
    result = AnalysisResultModel(
        id=uuid4(),
        analysis_id=analysis_id,
        overall_score="88.00",
        technical_score="92.00",
        experience_score="80.00",
        education_score="75.00",
        communication_score="85.00",
        leadership_score="70.00",
        candidate_summary="Perfil backend forte.",
        seniority_level="senior",
        total_experience_years="6.0",
        strengths=["Python"],
        weaknesses=[],
        recommendations=[],
        keywords=["python", "fastapi"],
        extracted_data={"skills": [{"name": "Python"}]},
        created_at=now,
    )
    db_session.add_all([analysis, result])
    await db_session.commit()

    job = await client.post(
        "/api/v1/jobs",
        json=_job_payload(),
        headers=recruiter_headers,
    )
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

    auto_matched = await AnalysisService(
        SQLAlchemyAnalysisRepository(db_session)
    ).auto_match_published_jobs(analysis_id)
    await db_session.commit()
    assert auto_matched >= 1

    match = await client.post(
        f"/api/v1/analyses/{analysis_id}/match/{job_id}",
        headers=recruiter_headers,
    )
    assert match.status_code == 200
    assert match.json()["recommendation"] in {"strong_match", "good_match"}

    persisted = await db_session.scalar(
        sa.select(ResumeJobMatchModel).where(
            ResumeJobMatchModel.analysis_id == analysis_id,
            ResumeJobMatchModel.job_id == UUID(job_id),
        )
    )
    assert persisted is not None
    assert persisted.matched_skills == ["Python"]
    assert persisted.missing_skills == []

    ranking = await client.get(f"/api/v1/jobs/{job_id}/candidates", headers=recruiter_headers)
    assert ranking.status_code == 200
    candidates = ranking.json()["candidates"]
    assert len(candidates) == 1
    assert candidates[0]["candidate_name"] == candidate.full_name
    assert candidates[0]["recommendation"] == match.json()["recommendation"]
