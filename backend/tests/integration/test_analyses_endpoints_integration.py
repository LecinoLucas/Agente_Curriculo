"""Integration tests for analyses endpoints.

Coverage for:
- GET /analyses/{analysis_id}/result
- POST /analyses/{analysis_id}/retry
- POST /analyses/{analysis_id}/force-fail
"""
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
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
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


async def _seed_analysis(
    session: AsyncSession,
    requester_id: UUID,
    *,
    candidate_name: str = "Test Candidate",
    status: str = "completed",
    input_tokens: int | None = None,
) -> AnalysisModel:
    """Create a complete analysis with candidate, resume, and result."""
    now = datetime.now(UTC)

    candidate = CandidateModel(
        full_name=candidate_name,
        email=f"{uuid4().hex[:6]}@test.com",
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
        started_at=now if status in ("completed", "failed", "processing") else None,
        completed_at=now if status == "completed" else None,
        failed_at=now if status == "failed" else None,
        created_at=now,
        updated_at=now,
    )
    session.add(analysis)
    await session.flush()

    if status == "completed":
        result = AnalysisResultModel(
            analysis_id=analysis.id,
            overall_score="85.50",
            technical_score="82.00",
            experience_score="88.00",
            education_score="80.00",
            communication_score="87.00",
            leadership_score="78.00",
            candidate_summary="Strong candidate with good technical skills.",
            seniority_level="mid",
            total_experience_years="5.0",
            strengths=["Python", "FastAPI", "SQL"],
            weaknesses=["Leadership"],
            recommendations=["Work on leadership skills"],
            keywords=["python", "fastapi", "sql"],
            input_tokens=input_tokens or 1000,
            output_tokens=500,
            cache_read_tokens=0,
            cache_write_tokens=100,
            processing_time_ms=2500,
            created_at=now,
        )
        session.add(result)

    await session.commit()
    return analysis


async def _ensure_analysis_prerequisites(
    session: AsyncSession,
    created_by: UUID,
) -> None:
    active_model = await session.scalar(
        sa.select(AIModelModel).where(AIModelModel.is_active.is_(True)).limit(1)
    )
    if active_model is None:
        session.add(
            AIModelModel(
                provider="anthropic",
                model_id=f"claude-manual-{uuid4().hex[:8]}",
                model_name="Claude Manual Test",
                is_active=True,
            )
        )

    active_prompt = await session.scalar(
        sa.select(PromptTemplateModel)
        .where(
            PromptTemplateModel.template_type == "full_analysis",
            PromptTemplateModel.is_active.is_(True),
        )
        .limit(1)
    )
    if active_prompt is None:
        session.add(
            PromptTemplateModel(
                name=f"manual-analysis-prompt-{uuid4().hex[:8]}",
                version=1,
                template_type="full_analysis",
                system_prompt="Analyze resume",
                user_prompt_template="Resume: {resume_text} Context: {job_context}",
                is_active=True,
                created_by=created_by,
            )
        )
    await session.commit()


async def _seed_resume_version_with_text(
    session: AsyncSession,
    *,
    requester_id: UUID,
) -> UUID:
    candidate = CandidateModel(
        full_name=f"Manual Candidate {uuid4().hex[:6]}",
        email=f"manual-{uuid4().hex[:6]}@test.com",
        location_country="BR",
        tags=[],
        created_by=requester_id,
    )
    session.add(candidate)
    await session.flush()

    resume = ResumeModel(
        candidate_id=candidate.id,
        title="CV Manual",
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
        s3_key=f"resumes/manual-{uuid4().hex}.pdf",
        original_file_name="manual-cv.pdf",
        file_size_bytes=1024,
        file_hash_sha256=uuid4().hex,
        mime_type="application/pdf",
        extracted_text="Senior Python engineer with FastAPI experience.",
        extraction_status="completed",
        uploaded_by=requester_id,
    )
    session.add(version)
    await session.commit()
    return version.id


@pytest.mark.asyncio
async def test_post_analyses_requires_job_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _create_active_user(
        db_session,
        f"user-manual-no-job-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")
    version_id = await _seed_resume_version_with_text(db_session, requester_id=user.id)

    resp = await client.post(
        f"/api/v1/analyses?resume_version_id={version_id}",
        headers=headers,
    )

    assert resp.status_code == 422
    assert resp.json()["detail"] == "job_id é obrigatório para solicitar análise"


@pytest.mark.asyncio
async def test_post_analyses_with_job_id_creates_manual_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _create_active_user(
        db_session,
        f"user-manual-job-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")
    await _ensure_analysis_prerequisites(db_session, user.id)
    version_id = await _seed_resume_version_with_text(db_session, requester_id=user.id)

    job = JobModel(
        title=f"Manual Analysis Job {uuid4().hex[:6]}",
        description="Manual analysis target job",
        created_by=user.id,
        status="published",
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    resp = await client.post(
        f"/api/v1/analyses?resume_version_id={version_id}&job_id={job.id}",
        headers=headers,
    )

    assert resp.status_code == 202, resp.text
    payload = resp.json()
    assert payload["analysis_id"]
    assert payload["status"] == "pending"

    created_analysis = await db_session.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.id == UUID(payload["analysis_id"]))
    )
    assert created_analysis is not None
    assert created_analysis.job_id == job.id
    assert created_analysis.resume_version_id == version_id


@pytest.mark.asyncio
async def test_get_analysis_result_completed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET /analyses/{analysis_id}/result for completed analysis."""
    user = await _create_active_user(
        db_session,
        f"user-get-result-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    analysis = await _seed_analysis(
        db_session,
        user.id,
        candidate_name="Test Candidate",
        status="completed",
        input_tokens=1500,
    )

    resp = await client.get(
        f"/api/v1/analyses/{analysis.id}/result",
        headers=headers,
    )

    assert resp.status_code == 200
    result = resp.json()

    # Verify key fields
    assert result["analysis_id"] == str(analysis.id)
    assert result["candidate_name"] == "Test Candidate"
    assert "status" not in result or result["status"] == "completed"  # May not be in result schema
    assert float(result["overall_score"]) == pytest.approx(85.5, abs=0.01)
    assert float(result["technical_score"]) == pytest.approx(82.0, abs=0.01)
    assert result["seniority_level"] == "mid"
    assert result["total_experience_years"] == "5.0"
    assert "Python" in result["strengths"]
    assert "Leadership" in result["weaknesses"]
    assert result["used_real_ai"] is True
    assert result["input_tokens"] == 1500


@pytest.mark.asyncio
async def test_get_analysis_result_not_completed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET /result endpoint when analysis is still pending."""
    user = await _create_active_user(
        db_session,
        f"user-pending-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    analysis = await _seed_analysis(
        db_session,
        user.id,
        status="pending",
    )

    resp = await client.get(
        f"/api/v1/analyses/{analysis.id}/result",
        headers=headers,
    )

    # Should fail because analysis is not completed
    assert resp.status_code == 409
    assert "ainda não concluída" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_get_analysis_result_nonexistent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET /result endpoint with nonexistent analysis."""
    user = await _create_active_user(
        db_session,
        f"user-noanalysis-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    fake_id = uuid4()

    resp = await client.get(
        f"/api/v1/analyses/{fake_id}/result",
        headers=headers,
    )

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_retry_analysis_from_failed_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /analyses/{analysis_id}/retry for failed analysis."""
    user = await _create_active_user(
        db_session,
        f"recruiter-retry-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create a failed analysis
    analysis = await _seed_analysis(
        db_session,
        user.id,
        status="failed",
    )

    # Retry it
    retry_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/retry",
        headers=headers,
    )

    assert retry_resp.status_code == 202
    result = retry_resp.json()
    assert result["status"] == "pending"
    assert result["analysis_id"] == str(analysis.id)

    # Verify the analysis was actually reset
    analysis_check = await db_session.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.id == analysis.id)
    )
    assert analysis_check.status == "pending"
    assert analysis_check.failure_reason is None


@pytest.mark.asyncio
async def test_retry_analysis_from_cancelled_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /retry for cancelled analysis."""
    user = await _create_active_user(
        db_session,
        f"recruiter-retry-cancel-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create cancelled analysis directly in DB
    now = datetime.now(UTC)
    candidate = CandidateModel(
        full_name="Retry Candidate",
        email=f"retry-{uuid4().hex[:6]}@test.com",
        location_country="BR",
        created_by=user.id,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(
        candidate_id=candidate.id,
        title="CV",
        status="active",
        current_version=1,
        created_by=user.id,
    )
    db_session.add(resume)
    await db_session.flush()

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
        extracted_text="Sample text",
        uploaded_by=user.id,
    )
    db_session.add(version)
    await db_session.flush()

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-{uuid4()}",
        model_name="Claude",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"prompt-{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze",
        is_active=True,
        created_by=user.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    analysis = AnalysisModel(
        resume_version_id=version.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="cancelled",
        requested_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(analysis)
    await db_session.commit()

    # Retry it
    retry_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/retry",
        headers=headers,
    )

    assert retry_resp.status_code == 202
    assert retry_resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_retry_analysis_invalid_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /retry rejects completed/pending analyses."""
    user = await _create_active_user(
        db_session,
        f"recruiter-retry-invalid-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create completed analysis
    analysis = await _seed_analysis(
        db_session,
        user.id,
        status="completed",
    )

    # Try to retry completed analysis
    retry_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/retry",
        headers=headers,
    )

    assert retry_resp.status_code == 409
    assert "Cannot retry" in retry_resp.json()["detail"]


@pytest.mark.asyncio
async def test_retry_analysis_nonexistent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /retry with nonexistent analysis."""
    user = await _create_active_user(
        db_session,
        f"recruiter-retry-notfound-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    fake_id = uuid4()

    retry_resp = await client.post(
        f"/api/v1/analyses/{fake_id}/retry",
        headers=headers,
    )

    assert retry_resp.status_code == 404


@pytest.mark.asyncio
async def test_force_fail_analysis(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /analyses/{analysis_id}/force-fail endpoint."""
    user = await _create_active_user(
        db_session,
        f"recruiter-force-fail-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create a pending analysis
    analysis = await _seed_analysis(
        db_session,
        user.id,
        status="pending",
    )

    # Force-fail it
    fail_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/force-fail",
        headers=headers,
    )

    assert fail_resp.status_code == 200
    assert fail_resp.json()["status"] == "failed"

    # Verify the analysis was marked failed
    analysis_check = await db_session.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.id == analysis.id)
    )
    assert analysis_check.status == "failed"
    assert "Encerrada manualmente" in analysis_check.failure_reason


@pytest.mark.asyncio
async def test_force_fail_analysis_processing(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test force-fail on processing analysis."""
    user = await _create_active_user(
        db_session,
        f"recruiter-fail-processing-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    analysis = await _seed_analysis(
        db_session,
        user.id,
        status="processing",
    )

    fail_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/force-fail",
        headers=headers,
    )

    assert fail_resp.status_code == 200


@pytest.mark.asyncio
async def test_force_fail_analysis_already_completed(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test force-fail rejects completed analyses."""
    user = await _create_active_user(
        db_session,
        f"recruiter-fail-completed-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create completed analysis
    analysis = await _seed_analysis(
        db_session,
        user.id,
        status="completed",
    )

    # Try to force-fail
    fail_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/force-fail",
        headers=headers,
    )

    assert fail_resp.status_code == 409
    assert "não é possível encerrar" in fail_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_force_fail_analysis_nonexistent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test force-fail with nonexistent analysis."""
    user = await _create_active_user(
        db_session,
        f"recruiter-fail-notfound-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    fake_id = uuid4()

    fail_resp = await client.post(
        f"/api/v1/analyses/{fake_id}/force-fail",
        headers=headers,
    )

    assert fail_resp.status_code == 404


@pytest.mark.asyncio
async def test_force_fail_analysis_only_recruiter_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that only recruiters/admins can force-fail analyses."""
    candidate = await _create_active_user(
        db_session,
        f"candidate-fail-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate.email, "password123")

    recruiter = await _create_active_user(
        db_session,
        f"recruiter-fail-perm-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    analysis = await _seed_analysis(
        db_session,
        recruiter.id,
        status="pending",
    )

    # Try with candidate
    fail_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/force-fail",
        headers=headers,
    )

    assert fail_resp.status_code == 403


@pytest.mark.asyncio
async def test_retry_analysis_only_recruiter_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that only recruiters/admins can retry analyses."""
    candidate = await _create_active_user(
        db_session,
        f"candidate-retry-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate.email, "password123")

    recruiter = await _create_active_user(
        db_session,
        f"recruiter-retry-perm-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    analysis = await _seed_analysis(
        db_session,
        recruiter.id,
        status="failed",
    )

    # Try with candidate
    retry_resp = await client.post(
        f"/api/v1/analyses/{analysis.id}/retry",
        headers=headers,
    )

    assert retry_resp.status_code == 403


@pytest.mark.asyncio
async def test_bulk_retry_analyses(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /analyses/bulk-retry endpoint."""
    user = await _create_active_user(
        db_session,
        f"recruiter-bulk-retry-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create multiple failed analyses
    analysis1 = await _seed_analysis(db_session, user.id, status="failed")
    analysis2 = await _seed_analysis(db_session, user.id, status="failed")
    analysis3 = await _seed_analysis(db_session, user.id, status="completed")

    # Bulk retry
    bulk_resp = await client.post(
        "/api/v1/analyses/bulk-retry",
        json={"analysis_ids": [str(analysis1.id), str(analysis2.id), str(analysis3.id)]},
        headers=headers,
    )

    assert bulk_resp.status_code == 200
    result = bulk_resp.json()
    assert result["processed"] == 2  # Only failed ones
    assert result["skipped"] == 1    # Completed one skipped


@pytest.mark.asyncio
async def test_bulk_force_fail_analyses(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test POST /analyses/bulk-force-fail endpoint."""
    user = await _create_active_user(
        db_session,
        f"recruiter-bulk-fail-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "password123")

    # Create analyses in different states
    pending = await _seed_analysis(db_session, user.id, status="pending")
    processing = await _seed_analysis(db_session, user.id, status="processing")
    completed = await _seed_analysis(db_session, user.id, status="completed")
    failed = await _seed_analysis(db_session, user.id, status="failed")

    # Bulk force-fail
    bulk_resp = await client.post(
        "/api/v1/analyses/bulk-force-fail",
        json={
            "analysis_ids": [
                str(pending.id),
                str(processing.id),
                str(completed.id),
                str(failed.id),
            ]
        },
        headers=headers,
    )

    assert bulk_resp.status_code == 200
    result = bulk_resp.json()
    assert result["processed"] == 2  # pending + processing
    assert result["skipped"] == 2    # completed + failed (already terminal)


@pytest.mark.asyncio
async def test_bulk_force_fail_only_recruiter_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that only recruiters/admins can bulk force-fail."""
    candidate = await _create_active_user(
        db_session,
        f"candidate-bulk-fail-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate.email, "password123")

    recruiter = await _create_active_user(
        db_session,
        f"recruiter-bulk-fail-perm-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    analysis = await _seed_analysis(db_session, recruiter.id, status="pending")

    # Try with candidate
    bulk_resp = await client.post(
        "/api/v1/analyses/bulk-force-fail",
        json={"analysis_ids": [str(analysis.id)]},
        headers=headers,
    )

    assert bulk_resp.status_code == 403


@pytest.mark.asyncio
async def test_bulk_retry_only_recruiter_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that only recruiters/admins can bulk retry."""
    candidate = await _create_active_user(
        db_session,
        f"candidate-bulk-retry-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate.email, "password123")

    recruiter = await _create_active_user(
        db_session,
        f"recruiter-bulk-retry-perm-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )

    analysis = await _seed_analysis(db_session, recruiter.id, status="failed")

    # Try with candidate
    bulk_resp = await client.post(
        "/api/v1/analyses/bulk-retry",
        json={"analysis_ids": [str(analysis.id)]},
        headers=headers,
    )

    assert bulk_resp.status_code == 403
