from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.job_model import SkillModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password
from src.interface.workers.analysis_tasks import (
    _mark_analysis_failed,
    _mark_analysis_retry_scheduled,
)
from src.interface.workers.matching_tasks import _match_analysis_to_job_async
from tests.conftest import TestSessionFactory


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
async def test_analysis_retry_and_failure_state_are_persisted(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "src.infrastructure.database.connection.AsyncSessionFactory",
        TestSessionFactory,
    )

    candidate = await _create_active_user(
        db_session,
        "candidate-worker-state@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, "candidate-worker-state@test.com", "password123")

    resume_upload = await client.post("/api/v1/resumes", headers=headers)
    assert resume_upload.status_code == 202
    resume_version_id = UUID(resume_upload.json()["version_id"])

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-worker-state-{uuid4()}",
        model_name="Claude Worker State Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"worker_state_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=resume_version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="processing",
        requested_by=candidate.id,
        started_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(analysis)
    await db_session.commit()

    await _mark_analysis_retry_scheduled(
        analysis_id=str(analysis.id),
        task_id="task-retry-1",
        error="provider timeout",
        retry_count=1,
        countdown_seconds=30,
    )

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status == "pending"
    assert refreshed.retry_count == 1
    assert refreshed.failure_reason == "provider timeout"
    assert refreshed.failed_at is None
    assert refreshed.next_retry_at is not None

    await _mark_analysis_failed(
        analysis_id=str(analysis.id),
        task_id="task-retry-3",
        error="provider timeout after max retries",
        retry_count=3,
    )

    await db_session.refresh(refreshed)
    assert refreshed.status == "failed"
    assert refreshed.retry_count == 3
    assert refreshed.failure_reason == "provider timeout after max retries"
    assert refreshed.failed_at is not None
    assert refreshed.next_retry_at is None


@pytest.mark.asyncio
async def test_matching_task_matches_completed_analysis_to_job(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "src.infrastructure.database.connection.AsyncSessionFactory",
        TestSessionFactory,
    )

    candidate = await _create_active_user(
        db_session,
        "candidate-worker-match@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    await _create_active_user(
        db_session,
        "recruiter-worker-match@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate_headers = await _auth_headers(
        client,
        "candidate-worker-match@test.com",
        "password123",
    )
    recruiter_headers = await _auth_headers(
        client,
        "recruiter-worker-match@test.com",
        "password123",
    )

    resume_upload = await client.post("/api/v1/resumes", headers=candidate_headers)
    assert resume_upload.status_code == 202
    resume_version_id = UUID(resume_upload.json()["version_id"])

    skill = SkillModel(
        name="Python Worker Match",
        normalized_name=f"python-worker-match-{uuid4().hex[:8]}",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-worker-match-{uuid4()}",
        model_name="Claude Worker Match Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"worker_match_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([skill, ai_model, prompt])
    await db_session.flush()

    analysis_id = uuid4()
    now = datetime.now(UTC)
    db_session.add_all(
        [
            AnalysisModel(
                id=analysis_id,
                resume_version_id=resume_version_id,
                ai_model_id=ai_model.id,
                prompt_template_id=prompt.id,
                status="completed",
                requested_by=candidate.id,
                created_at=now,
                updated_at=now,
                completed_at=now,
            ),
            AnalysisResultModel(
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
                extracted_data={"skills": [{"name": "Python Worker Match"}]},
                created_at=now,
            ),
        ]
    )
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

    result = await _match_analysis_to_job_async(str(analysis_id), job_id)

    assert result["analysis_id"] == str(analysis_id)
    assert result["job_id"] == job_id
    assert result["recommendation"] in {"strong_match", "good_match"}

    persisted = await db_session.scalar(
        sa.select(ResumeJobMatchModel).where(
            ResumeJobMatchModel.analysis_id == analysis_id,
            ResumeJobMatchModel.job_id == UUID(job_id),
        )
    )
    assert persisted is not None
    assert persisted.recommendation in {"strong_match", "good_match"}
