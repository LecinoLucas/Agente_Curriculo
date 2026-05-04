"""Integration tests for pipeline endpoints.

Coverage for:
- PATCH /pipeline/{job_id}/{candidate_id}/stage
- GET /pipeline/{job_id}/{candidate_id}/history
"""
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
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
        "title": "Senior Backend Engineer Position",
        "description": "Build and maintain backend APIs for production systems with high reliability and performance standards. Work with modern technologies and collaborate with cross-functional teams.",
        "requirements": "5+ years Python experience, expertise in FastAPI, PostgreSQL, Redis, Docker, Kubernetes, microservices architecture, REST API design",
        "responsibilities": "Design and implement scalable backend systems, mentor junior developers, lead technical decisions, manage production deployments, optimize database queries",
        "experience_context": "Experience with production-grade backend systems, distributed systems, high-traffic applications, CI/CD pipelines, infrastructure automation",
        "behavioral_requirements": ["Comunicação", "Autonomia", "Liderança", "Problem-solving"],
        "job_area": "technology",
        "seniority_level": "senior",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "BRL",
        "priority": "normal",
    }
    payload.update(overrides)
    return payload


async def _create_job(
    client: AsyncClient,
    headers: dict[str, str],
    db_session: AsyncSession,
    publish: bool = True,
    **overrides,
) -> UUID:
    """Create a job and optionally publish it."""
    job_resp = await client.post(
        "/api/v1/jobs",
        json=_job_payload(**overrides),
        headers=headers,
    )
    assert job_resp.status_code == 201, f"Job creation failed: {job_resp.text}"
    job_id = UUID(job_resp.json()["id"])

    if publish:
        # Keep this helper deterministic for pipeline tests by avoiding publish side-effects.
        job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
        assert job is not None
        job.status = "published"
        await db_session.commit()

    return job_id


async def _create_candidate(
    client: AsyncClient,
    headers: dict[str, str],
    db_session: AsyncSession,
    full_name: str,
    email: str,
) -> UUID:
    """Create a candidate via API."""
    resp = await client.post(
        "/api/v1/candidates",
        json={"full_name": full_name, "email": email},
        headers=headers,
    )
    assert resp.status_code == 201
    return UUID(resp.json()["id"])


async def _add_candidate_to_job(
    client: AsyncClient,
    headers: dict[str, str],
    candidate_id: UUID,
    job_id: UUID,
    initial_stage: str = "entry",
) -> dict:
    """Add a candidate to a job's pipeline."""
    resp = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_id), "initial_stage": initial_stage},
        headers=headers,
    )
    assert resp.status_code == 200
    return resp.json()


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_endpoint(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH /pipeline/{job_id}/{candidate_id}/stage endpoint."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-patch-v2-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    # Create job and candidate
    job_id = await _create_job(client, headers, db_session, title="Backend Position")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Alice Johnson", f"alice-{uuid4().hex[:6]}@test.com"
    )

    # Add candidate to job
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    # Move candidate from entry to screening stage
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "screening", "notes": "Strong profile", "reason": "Good fit"},
        headers=headers,
    )

    assert move_resp.status_code == 200
    result = move_resp.json()
    assert result["stage"] == "screening"
    assert result["candidate_id"] == str(candidate_id)


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_with_multiple_jobs(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Candidate cannot be active in two jobs and must transfer between jobs."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-multi-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    # Create two jobs
    job_a_id = await _create_job(client, headers, db_session, title="Backend Position A")
    job_b_id = await _create_job(client, headers, db_session, title="Backend Position B")

    # Create one candidate
    candidate_id = await _create_candidate(
        client, headers, db_session, "Bob Smith", f"bob-{uuid4().hex[:6]}@test.com"
    )

    # Add candidate to job A
    await _add_candidate_to_job(client, headers, candidate_id, job_a_id, "entry")

    # Trying to add candidate to job B while active in job A must fail
    add_b = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_b_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_b.status_code == 409
    assert "Use transferência" in add_b.json().get("detail", "")

    # Transfer candidate from A to B
    transfer = await client.patch(
        f"/api/v1/pipeline/{candidate_id}/transfer-job",
        json={
            "from_job_id": str(job_a_id),
            "to_job_id": str(job_b_id),
            "reason": "Mudança de contexto",
        },
        headers=headers,
    )
    assert transfer.status_code == 200, transfer.text
    assert transfer.json()["to_job_id"] == str(job_b_id)

    # Move candidate in job B to offer
    move_b = await client.patch(
        f"/api/v1/pipeline/{job_b_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_b.status_code == 200
    assert move_b.json()["stage"] == "hr_interview"

    # Candidate is no longer in job A pipeline
    move_a = await client.patch(
        f"/api/v1/pipeline/{job_a_id}/{candidate_id}/stage",
        json={"stage": "offer", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_a.status_code == 404

    # Verify candidate appears only in job B board
    board_a = await client.get(f"/api/v1/pipeline/{job_a_id}", headers=headers)
    assert board_a.status_code == 200
    ids_a = {
        candidate["candidate_id"]
        for column in board_a.json()["columns"]
        for candidate in column["candidates"]
    }
    assert str(candidate_id) not in ids_a

    board_b = await client.get(f"/api/v1/pipeline/{job_b_id}", headers=headers)
    assert board_b.status_code == 200
    ids_b = {
        candidate["candidate_id"]
        for column in board_b.json()["columns"]
        for candidate in column["candidates"]
    }
    assert str(candidate_id) in ids_b


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_invalid_transition(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH endpoint rejects invalid stage transitions."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-invalid-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(
        client, headers, db_session, "Charlie Brown", f"charlie-{uuid4().hex[:6]}@test.com"
    )

    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    # Try invalid stage
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "invalid_stage_xyz", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_nonexistent_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH endpoint with nonexistent candidate."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-nocandidate-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    fake_candidate_id = uuid4()

    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{fake_candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_pipeline_stage_v2_not_in_pipeline(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test PATCH endpoint when candidate is not in the job's pipeline."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-notpipe-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(
        client, headers, db_session, "David Lee", f"david-{uuid4().hex[:6]}@test.com"
    )

    # Do NOT add candidate to job
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 404


@pytest.mark.asyncio
async def test_get_candidate_pipeline_history(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET /pipeline/{job_id}/{candidate_id}/history endpoint."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-history-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session, title="History Test Job")
    candidate_id = await _create_candidate(
        client, headers, db_session, "Eve Wilson", f"eve-{uuid4().hex[:6]}@test.com"
    )

    # Add candidate to job
    await _add_candidate_to_job(client, headers, candidate_id, job_id, "entry")

    # Move through stages to create history
    await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "First interview", "reason": "Good background"},
        headers=headers,
    )

    await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "technical_interview", "notes": "Programming test", "reason": "Interview passed"},
        headers=headers,
    )

    # Get history
    history_resp = await client.get(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/history",
        headers=headers,
    )

    assert history_resp.status_code == 200
    history = history_resp.json()

    # Check history response has required fields
    assert "candidate_id" in history
    assert "current_stage" in history
    assert history["current_stage"] == "technical_interview"
    assert "transitions" in history
    assert len(history["transitions"]) >= 2  # At least 2 transitions (entry→hr_interview, hr_interview→technical_interview)


@pytest.mark.asyncio
async def test_get_candidate_pipeline_history_nonexistent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET history endpoint with nonexistent candidate/job."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-nohistory-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    fake_candidate_id = uuid4()

    history_resp = await client.get(
        f"/api/v1/pipeline/{job_id}/{fake_candidate_id}/history",
        headers=headers,
    )
    assert history_resp.status_code == 404


@pytest.mark.asyncio
async def test_get_candidate_pipeline_history_not_in_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test GET history when candidate is not in the job."""
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-history-notpipe-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, headers, db_session)
    candidate_id = await _create_candidate(
        client, headers, db_session, "Frank Brown", f"frank-{uuid4().hex[:6]}@test.com"
    )

    history_resp = await client.get(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/history",
        headers=headers,
    )
    assert history_resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_pipeline_stage_only_recruiter_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Test that only recruiters/admins can modify pipeline stages."""
    candidate_user = await _create_active_user(
        db_session,
        f"candidate-move-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, candidate_user.email, "password123")

    recruiter = await _create_active_user(
        db_session,
        f"recruiter-perm-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    recruiter_headers = await _auth_headers(client, recruiter.email, "password123")

    job_id = await _create_job(client, recruiter_headers, db_session, title="Permission Test Job")
    candidate_id = await _create_candidate(
        client, recruiter_headers, db_session, "Grace Lee", f"grace-{uuid4().hex[:6]}@test.com"
    )

    await _add_candidate_to_job(client, recruiter_headers, candidate_id, job_id, "entry")

    # Try to move with candidate account
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=headers,
    )
    assert move_resp.status_code == 403

    # Should work with recruiter
    move_resp = await client.patch(
        f"/api/v1/pipeline/{job_id}/{candidate_id}/stage",
        json={"stage": "hr_interview", "notes": "", "reason": ""},
        headers=recruiter_headers,
    )
    assert move_resp.status_code == 200
