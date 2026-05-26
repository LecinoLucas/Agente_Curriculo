from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel

from .helpers import _auth_headers, _create_active_user

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")

async def _setup_data(client: AsyncClient, db_session: AsyncSession):
    recruiter = await _create_active_user(
        db_session,
        f"recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    candidate_id = uuid4()
    job_id = uuid4()

    candidate = CandidateModel(
        id=candidate_id,
        full_name="Test Candidate",
        email=f"test_{candidate_id}@example.com",
        created_by=SYSTEM_USER_ID,
    )
    job = JobModel(
        id=job_id,
        title="Test Job",
        description="Test description",
        status="published",
        created_by=SYSTEM_USER_ID,
    )
    pipeline = CandidateJobPipelineModel(
        candidate_job_pipeline_id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_stage="hr_interview",
        relationship_status="active",
    )
    db_session.add_all([candidate, job, pipeline])
    await db_session.commit()
    return candidate_id, job_id, headers

async def _create_interview(
    db_session: AsyncSession,
    candidate_id: UUID,
    job_id: UUID,
    status: str,
    interview_type: str = "hr",
):
    interview_id = uuid4()
    now = datetime.now(UTC)
    interview = InterviewScheduleModel(
        id=interview_id,
        candidate_id=candidate_id,
        job_id=job_id,
        title="Test Interview",
        interview_type=interview_type,
        status=status,
        scheduled_start=now,
        scheduled_end=now + timedelta(hours=1),
        created_by=SYSTEM_USER_ID,
    )
    db_session.add(interview)
    await db_session.commit()
    return interview_id

async def _create_scorecard(
    db_session: AsyncSession,
    candidate_id: UUID,
    job_id: UUID,
    interview_id: UUID,
    status: str = "submitted",
    final_recommendation: str | None = "yes",
):
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        interview_id=interview_id,
        status=status,
        final_recommendation=final_recommendation,
        evaluator_id=SYSTEM_USER_ID,
    )
    db_session.add(scorecard)
    await db_session.commit()

@pytest.mark.asyncio
async def test_interview_feedback_pending(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    await _create_interview(db_session, candidate_id, job_id, "awaiting_feedback", "hr")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    assert any(p["id"] == "interview_feedback_pending" for p in pendencies)

@pytest.mark.asyncio
async def test_interview_feedback_saved_removes_pending(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    # Status completed implies feedback is saved
    interview_id = await _create_interview(db_session, candidate_id, job_id, "completed", "hr")
    await _create_scorecard(db_session, candidate_id, job_id, interview_id, "submitted", "yes")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    assert not any(p["id"] == "interview_feedback_pending" for p in pendencies)

@pytest.mark.asyncio
async def test_interview_completed_without_scorecard_generates_pending(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    await _create_interview(db_session, candidate_id, job_id, "completed", "hr")
    # No scorecard created

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    assert any(p["id"] == "interview_scorecard_pending" for p in pendencies)

@pytest.mark.asyncio
async def test_scorecard_submitted_removes_pending(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    interview_id = await _create_interview(db_session, candidate_id, job_id, "completed", "hr")
    await _create_scorecard(db_session, candidate_id, job_id, interview_id, "submitted", "yes")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    assert not any(p["id"] == "interview_scorecard_pending" for p in pendencies)

@pytest.mark.asyncio
async def test_interview_other_job_does_not_interfere(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    _, other_job_id, _ = await _setup_data(client, db_session)

    # Awaiting feedback in another job
    await _create_interview(db_session, candidate_id, other_job_id, "awaiting_feedback", "hr")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    # Should say not scheduled for current job
    assert any(p["id"] == "interview_not_scheduled" for p in pendencies)
    assert not any(p["id"] == "interview_feedback_pending" for p in pendencies)

@pytest.mark.asyncio
async def test_hr_interview_does_not_interfere_with_technical(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    # Set stage to technical_interview
    await db_session.execute(
        sa.update(CandidateJobPipelineModel)
        .where(CandidateJobPipelineModel.candidate_id == candidate_id, CandidateJobPipelineModel.job_id == job_id)
        .values(pipeline_stage="technical_interview")
    )
    await db_session.commit()

    # Awaiting feedback for HR interview
    await _create_interview(db_session, candidate_id, job_id, "awaiting_feedback", "hr")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    # The current stage is technical_interview, so it looks for a technical interview.
    # It shouldn't find one and should say not scheduled.
    assert any(p["id"] == "interview_not_scheduled" for p in pendencies)
    assert not any(p["id"] == "interview_feedback_pending" for p in pendencies)

@pytest.mark.asyncio
async def test_technical_interview_does_not_interfere_with_hr(client: AsyncClient, db_session: AsyncSession):
    candidate_id, job_id, headers = await _setup_data(client, db_session)
    # Set stage is already hr_interview

    # Awaiting feedback for technical interview
    await _create_interview(db_session, candidate_id, job_id, "awaiting_feedback", "technical")

    response = await client.get(f"/api/v1/candidates/{candidate_id}/overview?job_id={job_id}", headers=headers)
    assert response.status_code == 200
    pendencies = response.json().get("preview_pendencies", [])
    # The current stage is hr_interview, so it looks for HR interview.
    assert any(p["id"] == "interview_not_scheduled" for p in pendencies)
    assert not any(p["id"] == "interview_feedback_pending" for p in pendencies)
