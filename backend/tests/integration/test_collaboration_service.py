"""Collaboration service tests — RBAC, scope, and data safety."""

import pytest
from uuid import uuid4, UUID
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from src.domain.entities.user import User, UserRole, UserStatus
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.security.password_service import hash_password
from src.application.services.collaboration_service import CollaborationService


async def _create_user(
    db: AsyncSession, email: str, role: UserRole, password: str = "test1234"
) -> User:
    """Helper to create a test user."""
    user = UserModel(
        id=uuid4(),
        email=email,
        full_name=f"Test {role.value.title()}",
        role=role.value,
        status=UserStatus.ACTIVE.value,
        password_hash=hash_password(password),
        email_verified_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return User(
        id=user.id,
        email=user.email,
        password_hash=user.password_hash,
        role=UserRole(user.role),
        status=UserStatus(user.status),
        full_name=user.full_name,
        created_at=user.created_at,
        updated_at=user.updated_at,
        email_verified_at=user.email_verified_at,
    )


async def _create_job(db: AsyncSession, created_by: UUID | None = None) -> UUID:
    """Helper to create a test job."""
    if created_by is None:
        created_by = uuid4()
    job = JobModel(
        id=uuid4(),
        title="Software Engineer",
        description="Test job",
        created_by=created_by if isinstance(created_by, UUID) else UUID(created_by),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job.id


async def _create_candidate(db: AsyncSession, created_by: UUID | None = None) -> UUID:
    """Helper to create a test candidate."""
    if created_by is None:
        created_by = uuid4()
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Test Candidate",
        email="candidate@test.com",
        created_by=created_by if isinstance(created_by, UUID) else UUID(created_by),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)
    return candidate.id


async def _create_pipeline(
    db: AsyncSession, candidate_id: UUID, job_id: UUID, pipeline_stage: str = "entry"
) -> None:
    """Helper to create a pipeline."""
    pipeline = CandidateJobPipelineModel(
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_stage=pipeline_stage,
        pipeline_status="active",
        link_status="active",
        relationship_status="active",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(pipeline)
    await db.commit()


async def _create_scorecard(
    db: AsyncSession, evaluator_id: UUID, candidate_id: UUID, job_id: UUID
) -> None:
    """Helper to create a scorecard."""
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        evaluator_id=evaluator_id,
        status="draft",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(scorecard)
    await db.commit()


@pytest.mark.asyncio
async def test_recruiter_creates_comment(db_session: AsyncSession):
    """Recruiter can create internal comment."""
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)

    service = CollaborationService(db_session, recruiter)
    comment = await service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Strong technical background",
    )

    assert comment is not None
    assert comment["author_id"] == str(recruiter.id)
    assert comment["author_role"] == "recruiter"
    assert comment["comment_type"] == "comment"
    assert comment["message"] == "Strong technical background"
    assert comment["recommendation"] is None


@pytest.mark.asyncio
async def test_recruiter_requests_manager_review(db_session: AsyncSession):
    """Recruiter can request manager review."""
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)

    service = CollaborationService(db_session, recruiter)
    comment = await service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="review_request",
        message="Please review for interview",
    )

    assert comment is not None
    assert comment["comment_type"] == "review_request"
    assert comment["author_role"] == "recruiter"


@pytest.mark.asyncio
async def test_manager_sees_assigned_collaboration(db_session: AsyncSession):
    """Manager sees collaboration for candidate they evaluate."""
    manager = await _create_user(db_session, "manager@test.com", UserRole.MANAGER)
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)
    await _create_scorecard(db_session, manager.id, candidate_id, job_id)

    # Recruiter creates comment
    recruiter_service = CollaborationService(db_session, recruiter)
    await recruiter_service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Test comment",
    )

    # Manager retrieves comments
    manager_service = CollaborationService(db_session, manager)
    comments = await manager_service.list_collaboration(candidate_id, job_id)

    assert len(comments) == 1
    assert comments[0]["message"] == "Test comment"
    assert comments[0]["author_role"] == "recruiter"


@pytest.mark.asyncio
async def test_manager_cannot_see_unassigned_collaboration(db_session: AsyncSession):
    """Manager does NOT see collaboration for candidate outside their scope."""
    manager = await _create_user(db_session, "manager@test.com", UserRole.MANAGER)
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)
    # NO scorecard for manager — out of scope

    # Recruiter creates comment
    recruiter_service = CollaborationService(db_session, recruiter)
    await recruiter_service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Test comment",
    )

    # Manager tries to retrieve comments
    manager_service = CollaborationService(db_session, manager)
    comments = await manager_service.list_collaboration(candidate_id, job_id)

    assert len(comments) == 0


@pytest.mark.asyncio
async def test_manager_sends_feedback_with_recommendation(db_session: AsyncSession):
    """Manager can send feedback with recommendation."""
    manager = await _create_user(db_session, "manager@test.com", UserRole.MANAGER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)
    await _create_scorecard(db_session, manager.id, candidate_id, job_id)

    service = CollaborationService(db_session, manager)
    comment = await service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="manager_feedback",
        message="Profile aligns with requirements",
        recommendation="advance",
    )

    assert comment is not None
    assert comment["comment_type"] == "manager_feedback"
    assert comment["author_role"] == "manager"
    assert comment["recommendation"] == "advance"


@pytest.mark.asyncio
async def test_candidate_cannot_access_collaboration(client: AsyncClient, db_session: AsyncSession):
    """Candidate cannot access collaboration endpoints."""
    candidate_user = await _create_user(db_session, "candidate@test.com", UserRole.CANDIDATE)
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)

    # Recruiter creates comment
    recruiter_service = CollaborationService(db_session, recruiter)
    await recruiter_service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Test comment",
    )
    await db_session.commit()

    # Candidate login
    login = await client.post("/api/v1/auth/login", json={
        "email": "candidate@test.com",
        "password": "test1234",
    })
    token = login.json()["access_token"]

    # Try to access collaboration
    response = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_recommendation_does_not_move_pipeline(db_session: AsyncSession):
    """Manager recommendation does NOT automatically move pipeline."""
    manager = await _create_user(db_session, "manager@test.com", UserRole.MANAGER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id, pipeline_stage="entry")
    await _create_scorecard(db_session, manager.id, candidate_id, job_id)

    # Manager sends recommendation to advance
    service = CollaborationService(db_session, manager)
    await service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="manager_feedback",
        message="Ready for next stage",
        recommendation="advance",
    )
    await db_session.commit()

    # Verify pipeline stage unchanged
    import sqlalchemy as sa
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            and_(
                CandidateJobPipelineModel.candidate_id == candidate_id,
                CandidateJobPipelineModel.job_id == job_id,
            )
        )
    )
    assert pipeline.pipeline_stage == "entry"  # Still entry, not moved


@pytest.mark.asyncio
async def test_collaboration_does_not_expose_sensitive_data(db_session: AsyncSession):
    """Collaboration comments do NOT contain documents, ERP, or AI logs."""
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)

    service = CollaborationService(db_session, recruiter)
    comment = await service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Candidate profile review",
    )

    # Only safe fields present
    assert "documents" not in comment
    assert "erp_payload" not in comment
    assert "ai_logs" not in comment
    assert "score_breakdown" not in comment
    # Only these fields allowed
    assert set(comment.keys()) == {
        "id", "author_id", "author_role", "comment_type",
        "recommendation", "message", "created_at"
    }


@pytest.mark.asyncio
async def test_admin_can_access_all_collaboration(db_session: AsyncSession):
    """Admin can access collaboration for any candidate+job."""
    admin = await _create_user(db_session, "admin@test.com", UserRole.ADMIN)
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)
    # No scorecard for admin — but should still access

    # Recruiter creates comment
    recruiter_service = CollaborationService(db_session, recruiter)
    await recruiter_service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Test comment",
    )

    # Admin retrieves comments
    admin_service = CollaborationService(db_session, admin)
    comments = await admin_service.list_collaboration(candidate_id, job_id)

    assert len(comments) == 1
    assert comments[0]["message"] == "Test comment"


@pytest.mark.asyncio
async def test_collaboration_events_are_registered(db_session: AsyncSession):
    """Collaboration events register author_id, author_role, created_at."""
    recruiter = await _create_user(db_session, "recruiter@test.com", UserRole.RECRUITER)
    job_id = await _create_job(db_session)
    candidate_id = await _create_candidate(db_session)
    await _create_pipeline(db_session, candidate_id, job_id)

    service = CollaborationService(db_session, recruiter)
    comment = await service.create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="comment",
        message="Test",
    )
    await db_session.commit()

    # Verify in database
    import sqlalchemy as sa
    db_comment = await db_session.scalar(
        sa.select(CollaborationCommentModel).where(
            CollaborationCommentModel.id == UUID(comment["id"])
        )
    )

    assert db_comment.author_id == recruiter.id
    assert db_comment.author_role == "recruiter"
    assert db_comment.created_at is not None
    assert db_comment.updated_at is not None


# Import for test_manager_cannot_see_unassigned_collaboration
from sqlalchemy import and_
