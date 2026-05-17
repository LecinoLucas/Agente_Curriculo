from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.core.settings import settings
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.application.ports.ai_service import AIAnalysisResponse
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password
from src.interface.workers.analysis_tasks import (
    AnalysisErrorClassification,
    PROMPT_INSTRUCTION,
    TEMPORARY_RETRY_MESSAGE,
    _process_analysis_async,
    _mark_analysis_failed,
    _mark_analysis_retry_scheduled,
)
from src.interface.workers.matching_tasks import _match_analysis_to_job_async
from tests.conftest import TestSessionFactory


class FakeCeleryEngine:
    async def dispose(self) -> None:
        return None


async def fake_create_celery_async_sessionmaker():
    return FakeCeleryEngine(), TestSessionFactory


def _patch_celery_sessionmaker(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.infrastructure.database.connection.create_celery_async_sessionmaker",
        fake_create_celery_async_sessionmaker,
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


def _job_payload(**overrides) -> dict:
    payload = {
        "title": "Backend Engineer",
        "description": (
            "Build and maintain backend APIs for high-volume hiring workflows, "
            "owning integrations, observability, automated tests, and production reliability."
        ),
        "requirements": (
            "Strong backend experience with Python, FastAPI, PostgreSQL, API design, "
            "testing, and production troubleshooting."
        ),
        "seniority_level": "senior",
        "minimum_education_level": "bachelor",
        "minimum_years_experience": "3.0",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "brl",
        "job_area": "technology",
        "responsibilities": (
            "Design backend services, maintain integrations, review code, improve observability, "
            "and support production incidents with clear ownership."
        ),
        "experience_context": "Experience delivering backend systems in production environments.",
        "behavioral_requirements": ["Ownership", "Clear communication"],
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_process_analysis_uses_current_worker_prompt_and_persists_prompt_version(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    _patch_celery_sessionmaker(monkeypatch)

    requested_user = await _create_active_user(
        db_session,
        "candidate-worker-db-prompt@test.com",
        "password123",
        UserRole.CANDIDATE,
    )

    candidate = CandidateModel(
        user_id=requested_user.id,
        full_name="Candidate Worker DB Prompt",
        email="candidate-worker-db-prompt@test.com",
        created_by=requested_user.id,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(
        candidate_id=candidate.id,
        title="Currículo principal",
        created_by=requested_user.id,
    )
    db_session.add(resume)
    await db_session.flush()

    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key="resume/test.pdf",
        original_file_name="test.pdf",
        file_size_bytes=1234,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extracted_text="Python FastAPI PostgreSQL",
        extraction_status="completed",
        uploaded_by=requested_user.id,
    )
    db_session.add(version)

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-db-prompt-{uuid4()}",
        model_name="Claude DB Prompt Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name="full_analysis",
        version=7,
        template_type="full_analysis",
        system_prompt="DB SYSTEM PROMPT",
        user_prompt_template="DB TEMPLATE\nResume:\n{resume_text}\nContext:\n{job_context}",
        is_active=True,
        created_by=requested_user.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    analysis = AnalysisModel(
        id=uuid4(),
        resume_version_id=version.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="pending",
        requested_by=requested_user.id,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db_session.add(analysis)
    await db_session.commit()

    captured: dict[str, object] = {}
    class FakeAIService:
        async def analyze(self, request):
            captured["system_prompt"] = request.system_prompt
            captured["prompt_template"] = request.prompt_template
            captured["max_tokens"] = request.max_tokens
            captured["temperature"] = request.temperature
            return AIAnalysisResponse(
                content='{"personal_info":{"name":"Ana","email":"ana@example.com","phone":null,"location":"Sao Paulo"},"experience":[],"skills":[{"name":"Python","proficiency":"advanced"}],"leadership":{"has_management":false,"has_project_lead":false,"has_mentoring":false,"has_cross_team":false},"education":[],"languages":[],"employment_gaps":[],"cv_quality_score":{"total":80}}',
                input_tokens=10,
                output_tokens=20,
                cache_read_tokens=0,
                cache_write_tokens=0,
                processing_time_ms=123,
            )

    def fake_create(provider: str, model_id: str):
        return FakeAIService()

    monkeypatch.setattr("src.interface.workers.analysis_tasks._provider_api_key_is_configured", lambda provider: True)
    monkeypatch.setattr("src.interface.workers.analysis_tasks._real_ai_calls_allowed", lambda: True)
    monkeypatch.setattr("src.infrastructure.ai.factory.AIServiceFactory.create", fake_create)

    result = await _process_analysis_async(analysis.id, "task-db-prompt")

    assert result["status"] == "completed"
    assert captured["system_prompt"] == PROMPT_INSTRUCTION
    assert "Python FastAPI PostgreSQL" in captured["prompt_template"]
    assert captured["max_tokens"] == min(settings.AI_MAX_TOKENS, settings.AI_ANALYSIS_MAX_OUTPUT_TOKENS)
    assert captured["temperature"] == float(prompt.temperature)

    persisted_result = await db_session.scalar(
        sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis.id)
    )
    assert persisted_result is not None
    assert persisted_result.prompt_version_used.startswith("7:")


@pytest.mark.asyncio
async def test_analysis_retry_and_failure_state_are_persisted(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    candidate = await _create_active_user(
        db_session,
        "candidate-worker-state@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, "candidate-worker-state@test.com", "password123")

    db_session.add(
        CandidateModel(
            user_id=candidate.id,
            full_name="Candidate Worker State",
            email="candidate-worker-state@test.com",
            created_by=candidate.id,
        )
    )
    await db_session.commit()

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
        attempts=1,
        classification=AnalysisErrorClassification(
            provider_error_type="temporary",
            is_temporary=True,
        ),
        sessionmaker=TestSessionFactory,
    )

    refreshed = await db_session.get(AnalysisModel, analysis.id)
    assert refreshed is not None
    await db_session.refresh(refreshed)
    assert refreshed.status == "retry_scheduled"
    assert refreshed.retry_count == 1
    assert refreshed.failure_reason == TEMPORARY_RETRY_MESSAGE
    assert refreshed.failed_at is None
    assert refreshed.next_retry_at is not None

    await _mark_analysis_failed(
        analysis_id=str(analysis.id),
        task_id="task-retry-3",
        error="provider timeout after max retries",
        retry_count=3,
        attempts=3,
        classification=AnalysisErrorClassification(
            provider_error_type="provider_error",
            is_temporary=False,
        ),
        sessionmaker=TestSessionFactory,
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
    _patch_celery_sessionmaker(monkeypatch)

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

    db_session.add(
        CandidateModel(
            user_id=candidate.id,
            full_name="Candidate Worker Match",
            email="candidate-worker-match@test.com",
            created_by=candidate.id,
        )
    )
    await db_session.commit()

    resume_upload = await client.post("/api/v1/resumes", headers=candidate_headers)
    assert resume_upload.status_code == 202
    resume_version_id = UUID(resume_upload.json()["version_id"])

    skill_name = f"Python Worker Match {uuid4().hex[:8]}"
    secondary_skill_name = f"FastAPI Worker Match {uuid4().hex[:8]}"
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
    db_session.add_all([ai_model, prompt])
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
                candidate_summary="Perfil backend forte.",
                seniority_level="senior",
                total_experience_years="6.0",
                strengths=[skill_name, secondary_skill_name],
                weaknesses=[],
                recommendations=[],
                keywords=["python", "fastapi"],
                extracted_data={"skills": [{"name": skill_name}, {"name": secondary_skill_name}]},
                created_at=now,
            ),
        ]
    )
    await db_session.commit()

    job = await client.post("/api/v1/jobs", json=_job_payload(), headers=recruiter_headers)
    assert job.status_code == 201
    job_id = job.json()["id"]

    add_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_name": skill_name, "priority_level": "priority"},
        headers=recruiter_headers,
    )
    assert add_skill.status_code == 201
    add_secondary_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_name": secondary_skill_name, "priority_level": "priority"},
        headers=recruiter_headers,
    )
    assert add_secondary_skill.status_code == 201

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=recruiter_headers)
    assert publish.status_code == 200

    result = await _match_analysis_to_job_async(str(analysis_id), job_id)

    assert result["analysis_id"] == str(analysis_id)
    assert result["job_id"] == job_id
    assert result["recommendation"] in {"strong_match", "good_match", "review_manually"}

    persisted = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(
            CandidateJobMatchModel.resume_version_id == resume_version_id,
            CandidateJobMatchModel.job_id == UUID(job_id),
        )
    )
    assert persisted is not None
    assert persisted.recommendation in {"strong_match", "good_match", "review_manually"}
