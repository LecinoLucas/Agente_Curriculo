"""
Integration tests for next_interview in GET /api/v1/candidates/summaries.

Validates that list_summaries populates next_interview correctly:
- Returns next_interview when a scheduled/rescheduled interview exists.
- Ignores completed, cancelled, no_show statuses.
- Returns null when no interview exists.
- Returns the closest future interview when multiple exist.
- Does not return interview from a different job/cycle.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.job_model import JobModel
from tests.integration.helpers import _auth_headers, _create_active_user

ENDPOINT = "/api/v1/candidates/summaries"


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
async def recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"rec-ni-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "pass1234", UserRole.RECRUITER)
    return await _auth_headers(client, email, "pass1234")


def _make_candidate(suffix: str = "") -> CandidateModel:
    return CandidateModel(
        id=uuid4(),
        full_name=f"Candidate {suffix}",
        email=f"cand-{uuid4().hex[:8]}@ni-test.com",
    )


def _make_job() -> JobModel:
    return JobModel(
        id=uuid4(),
        title="Test Job",
        description="desc",
        status="published",
        created_by=uuid4(),
    )


def _make_pipeline(candidate_id, job_id) -> CandidateJobPipelineModel:
    return CandidateJobPipelineModel(
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_stage="hr_interview",
        relationship_status="active",
        is_terminal=False,
    )


def _make_interview(
    candidate_id,
    job_id,
    status: str = "scheduled",
    delta_hours: int = 24,
) -> InterviewScheduleModel:
    now = datetime.now(UTC)
    return InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        title="Entrevista",
        interview_type="hr",
        interview_format="online",
        status=status,
        scheduled_start=now + timedelta(hours=delta_hours),
        scheduled_end=now + timedelta(hours=delta_hours + 1),
    )


# ── Tests ─────────────────────────────────────────────────────────────────────


async def test_next_interview_returned_when_scheduled(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("scheduled")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    interview = _make_interview(candidate.id, job.id, status="scheduled")
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is not None
    assert row["next_interview"]["interview_type"] == "hr"
    assert row["next_interview"]["interview_format"] == "online"
    assert "scheduled_start" in row["next_interview"]
    assert "scheduled_end" in row["next_interview"]


async def test_next_interview_returned_when_rescheduled(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("rescheduled")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    interview = _make_interview(candidate.id, job.id, status="rescheduled")
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is not None


async def test_next_interview_null_when_no_interview(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("no-interview")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    db_session.add(pipeline)
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is None


async def test_next_interview_ignores_completed(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("completed")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    interview = _make_interview(candidate.id, job.id, status="completed")
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is None


async def test_next_interview_ignores_cancelled(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("cancelled")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    interview = _make_interview(candidate.id, job.id, status="cancelled")
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is None


async def test_next_interview_ignores_no_show(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("no_show")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    interview = _make_interview(candidate.id, job.id, status="no_show")
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is None


async def test_next_interview_returns_closest_when_multiple(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("multiple")
    job = _make_job()
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job.id)
    interview_soon = _make_interview(candidate.id, job.id, status="scheduled", delta_hours=4)
    interview_later = _make_interview(candidate.id, job.id, status="scheduled", delta_hours=48)
    db_session.add_all([pipeline, interview_soon, interview_later])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    ni = row["next_interview"]
    assert ni is not None
    # Both interviews are in the future; the soonest (delta_hours=4) should be returned.
    # We verify: the returned start is within 24 hours of now, not 48+.
    ni_start_str = ni["scheduled_start"].replace("Z", "+00:00")
    ni_dt = datetime.fromisoformat(ni_start_str)
    if ni_dt.tzinfo is None:
        ni_dt = ni_dt.replace(tzinfo=UTC)
    now_utc = datetime.now(UTC)
    assert ni_dt < now_utc + timedelta(hours=24), (
        f"Expected closest interview (<24h), got {ni_dt.isoformat()}"
    )


async def test_next_interview_null_for_different_job(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict,
) -> None:
    candidate = _make_candidate("diff-job")
    job_active = _make_job()
    job_other = _make_job()
    db_session.add_all([candidate, job_active, job_other])
    await db_session.flush()

    pipeline = _make_pipeline(candidate.id, job_active.id)
    # Interview is for job_other, not the active job
    interview = _make_interview(candidate.id, job_other.id, status="scheduled")
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    resp = await client.get(
        ENDPOINT,
        params={"link_status_filter": "with_active_job"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 200
    items = resp.json()["data"]
    row = next((i for i in items if i["id"] == str(candidate.id)), None)
    assert row is not None
    assert row["next_interview"] is None
