import hashlib
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel, PromptTemplateModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel

from .helpers import _auth_headers, _create_active_user


@pytest.mark.asyncio
async def test_request_analysis_returns_404_when_resume_version_does_not_exist(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"analysis-contract-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    response = await client.post(
        f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Versão de currículo não encontrada"


@pytest.mark.asyncio
async def test_request_analysis_is_idempotent_for_pending_candidate_job_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"analysis-idempotent-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")
    monkeypatch.setattr("src.interface.api.routers.analyses.enqueue_analysis", lambda analysis_id: None)

    candidate = CandidateModel(
        email=f"manual-analysis-{uuid4().hex[:6]}@test.com",
        full_name="Manual Analysis Candidate",
        created_by=recruiter.id,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(candidate_id=candidate.id, title="Currículo", created_by=recruiter.id)
    db_session.add(resume)
    await db_session.flush()

    resume_version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key=f"resumes/{uuid4()}.pdf",
        original_file_name="curriculo.pdf",
        file_size_bytes=128,
        file_hash_sha256=hashlib.sha256(b"manual-analysis").hexdigest(),
        mime_type="application/pdf",
        extracted_text="Experiência com Python, FastAPI e PostgreSQL.",
        extraction_status="completed",
        uploaded_by=recruiter.id,
    )
    db_session.add(resume_version)

    ai_model = AIModelModel(
        provider="google",
        model_id=f"manual-analysis-{uuid4().hex[:6]}",
        model_name="Manual Analysis Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"manual_analysis_prompt_{uuid4().hex[:6]}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=recruiter.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.commit()

    job = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Backend APIs with Python and FastAPI for hiring workflows.",
            "requirements": "Python, FastAPI, PostgreSQL, automated tests and production support.",
            "seniority_level": "senior",
            "minimum_education_level": "bachelor",
            "minimum_years_experience": "3.0",
            "work_model": "remote",
            "location": "Brasil",
            "salary_min": "12000.00",
            "salary_max": "18000.00",
            "salary_currency": "BRL",
            "job_area": "technology",
            "responsibilities": "Build APIs, review code and maintain observability.",
            "experience_context": "Production backend systems.",
            "behavioral_requirements": ["Ownership"],
        },
        headers=headers,
    )
    assert job.status_code == 201
    job_id = job.json()["id"]

    first = await client.post(
        f"/api/v1/analyses?resume_version_id={resume_version.id}&job_id={job_id}",
        headers=headers,
    )
    second = await client.post(
        f"/api/v1/analyses?resume_version_id={resume_version.id}&job_id={job_id}",
        headers=headers,
    )

    assert first.status_code == 202
    assert second.status_code == 202
    first_payload = first.json()
    second_payload = second.json()
    assert first_payload["status"] == "pending"
    assert first_payload["created"] is True
    assert second_payload["analysis_id"] == first_payload["analysis_id"]
    assert second_payload["created"] is False
    assert second_payload["reused"] is True

    total = await db_session.scalar(
        sa.select(sa.func.count(AnalysisModel.id)).where(
            AnalysisModel.resume_version_id == resume_version.id,
            AnalysisModel.job_id == UUID(job_id),
        )
    )
    assert total == 1
