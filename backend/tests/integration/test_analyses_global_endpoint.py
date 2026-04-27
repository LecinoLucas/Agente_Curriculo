"""Integration tests for GET /api/v1/analyses/global (Phase 13.3)."""
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.domain.entities.user import User


async def _create_user(
    session: AsyncSession,
    email: str,
    role: UserRole,
) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password("password123"),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str) -> dict[str, str]:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    assert resp.status_code == 200
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _seed_analysis(
    session: AsyncSession,
    requester_id,
    *,
    candidate_name: str = "Test Candidate",
    candidate_email: str | None = None,
    status: str = "completed",
    input_tokens: int | None = None,
    overall_score: str | None = "80.00",
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    failed_at: datetime | None = None,
) -> AnalysisModel:
    now = datetime.now(UTC)

    candidate = CandidateModel(
        full_name=candidate_name,
        email=candidate_email or f"{uuid4().hex[:6]}@test.com",
        location_country="BR",
        tags=[],
        created_by=requester_id,
    )
    session.add(candidate)
    await session.flush()

    resume = ResumeModel(
        candidate_id=candidate.id,
        title="CV",
        status="active",
        current_version=1,
        created_by=requester_id,
    )
    session.add(resume)
    await session.flush()

    version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key=f"resumes/{uuid4()}.pdf",
        original_file_name="cv.pdf",
        file_size_bytes=1024,
        file_hash_sha256=uuid4().hex,
        mime_type="application/pdf",
        extraction_status="completed",
        extracted_text="Sample extracted text",
        uploaded_by=requester_id,
    )
    session.add(version)
    await session.flush()

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-test-{uuid4()}",
        model_name="Claude Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"test_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze",
        is_active=True,
        created_by=requester_id,
    )
    session.add_all([ai_model, prompt])
    await session.flush()

    analysis = AnalysisModel(
        resume_version_id=version.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status=status,
        requested_by=requester_id,
        started_at=started_at or now,
        completed_at=completed_at or (now if status == "completed" else None),
        failed_at=failed_at or (now if status == "failed" else None),
        created_at=now,
        updated_at=now,
    )
    session.add(analysis)
    await session.flush()

    if status == "completed":
        result = AnalysisResultModel(
            id=uuid4(),
            analysis_id=analysis.id,
            overall_score=overall_score,
            technical_score="75.00",
            experience_score="70.00",
            education_score="65.00",
            communication_score="80.00",
            leadership_score="60.00",
            candidate_summary="Good candidate.",
            seniority_level="mid",
            total_experience_years="3.0",
            strengths=["Python"],
            weaknesses=[],
            recommendations=[],
            keywords=["python"],
            extracted_data={"skills": [{"name": "Python"}]},
            input_tokens=input_tokens,
            output_tokens=None,
            cache_read_tokens=None,
            cache_write_tokens=None,
            created_at=now,
        )
        session.add(result)

    await session.commit()
    return analysis


@pytest.mark.asyncio
async def test_global_analyses_returns_paginated_list(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-ga-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    await _seed_analysis(db_session, recruiter.id, candidate_name="Alice")
    await _seed_analysis(db_session, recruiter.id, candidate_name="Bob")

    resp = await client.get("/api/v1/analyses/global?page=1&page_size=10", headers=headers)

    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "total" in body
    assert "total_pages" in body
    assert body["total"] >= 2
    item = body["data"][0]
    # All fields from AnalysisGlobalItemResponse must be present
    for field in ("id", "status", "resume_version_id", "retry_count", "created_at"):
        assert field in item, f"Missing field: {field}"


@pytest.mark.asyncio
async def test_global_analyses_status_filter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-gf-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    await _seed_analysis(db_session, recruiter.id, status="completed")
    await _seed_analysis(db_session, recruiter.id, status="failed")

    completed_resp = await client.get(
        "/api/v1/analyses/global?status=completed", headers=headers
    )
    assert completed_resp.status_code == 200
    items = completed_resp.json()["data"]
    assert all(i["status"] == "completed" for i in items)

    failed_resp = await client.get(
        "/api/v1/analyses/global?status=failed", headers=headers
    )
    assert failed_resp.status_code == 200
    items = failed_resp.json()["data"]
    assert all(i["status"] == "failed" for i in items)


@pytest.mark.asyncio
async def test_global_analyses_search_filter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-gs-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    unique_name = f"UniqueCandidate{uuid4().hex[:6]}"
    await _seed_analysis(db_session, recruiter.id, candidate_name=unique_name)
    await _seed_analysis(db_session, recruiter.id, candidate_name="OtherPerson")

    resp = await client.get(
        f"/api/v1/analyses/global?search={unique_name.lower()[:10]}", headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert len(data) >= 1
    assert all(unique_name.lower()[:10] in (i.get("candidate_name") or "").lower() for i in data)


@pytest.mark.asyncio
async def test_global_analyses_used_real_ai_filter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-gai-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    # Real AI: has input_tokens > 0
    real_analysis = await _seed_analysis(
        db_session, recruiter.id, candidate_name="RealAI", input_tokens=1500
    )
    # Mock: no tokens
    await _seed_analysis(
        db_session, recruiter.id, candidate_name="MockAI", input_tokens=None
    )

    real_resp = await client.get(
        "/api/v1/analyses/global?used_real_ai=true", headers=headers
    )
    assert real_resp.status_code == 200
    real_items = real_resp.json()["data"]
    assert all(i["used_real_ai"] is True for i in real_items)
    assert any(i["id"] == str(real_analysis.id) for i in real_items)

    mock_resp = await client.get(
        "/api/v1/analyses/global?used_real_ai=false", headers=headers
    )
    assert mock_resp.status_code == 200
    mock_items = mock_resp.json()["data"]
    assert all(i["used_real_ai"] is False for i in mock_items)


@pytest.mark.asyncio
async def test_global_analyses_viewer_is_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    viewer = await _create_user(db_session, f"viewer-ga-{uuid4().hex[:6]}@test.com", UserRole.VIEWER)
    headers = await _auth_headers(client, viewer.email)

    resp = await client.get("/api/v1/analyses/global", headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_global_analyses_response_fields_types(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_user(db_session, f"recruiter-gft-{uuid4().hex[:6]}@test.com", UserRole.RECRUITER)
    headers = await _auth_headers(client, recruiter.email)

    analysis = await _seed_analysis(
        db_session,
        recruiter.id,
        candidate_name="TypeCheck Candidate",
        candidate_email="typecheck@example.com",
        input_tokens=500,
        overall_score="88.50",
    )

    resp = await client.get("/api/v1/analyses/global", headers=headers)
    assert resp.status_code == 200

    items = resp.json()["data"]
    target = next((i for i in items if i["id"] == str(analysis.id)), None)
    assert target is not None, "Created analysis not found in response"

    assert target["candidate_name"] == "TypeCheck Candidate"
    assert target["candidate_email"] == "typecheck@example.com"
    assert target["status"] == "completed"
    assert target["resume_file_name"] == "cv.pdf"
    assert target["used_real_ai"] is True
    assert target["overall_score"] == pytest.approx(88.5, abs=0.01)
    assert target["retry_count"] == 0
    assert target["started_at"] is not None
    assert target["completed_at"] is not None
    assert target["failed_at"] is None
