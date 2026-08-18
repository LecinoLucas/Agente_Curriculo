from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.job_model import JobModel
from tests.integration.helpers import _auth_headers, _create_active_user

ENDPOINT = "/api/v1/rh/dashboard"
LOCAL_TZ = ZoneInfo("America/Sao_Paulo")


async def _headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> dict[str, str]:
    email = f"rh-{role.value}-{uuid4().hex[:8]}@test.com"
    await _create_active_user(db_session, email, "pass1234", role)
    return await _auth_headers(client, email, "pass1234")


def _candidate(name: str) -> CandidateModel:
    return CandidateModel(
        id=uuid4(),
        full_name=name,
        email=f"{uuid4().hex[:8]}@rh.test",
    )


def _job(created_by, title: str = "Analista de RH") -> JobModel:
    return JobModel(
        id=uuid4(),
        title=title,
        description="Vaga para teste da Central RH",
        status="published",
        created_by=created_by,
    )


def _pipeline(candidate_id, job_id, stage: str) -> CandidateJobPipelineModel:
    return CandidateJobPipelineModel(
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_stage=stage,
        relationship_status="active",
        is_terminal=False,
    )


def _today_interview(candidate_id, job_id) -> InterviewScheduleModel:
    local_start = datetime.now(LOCAL_TZ).replace(hour=14, minute=0, second=0, microsecond=0)
    start = local_start.astimezone(UTC)
    return InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        title="Entrevista RH",
        interview_type="hr",
        interview_format="online",
        status="scheduled",
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=1),
    )


async def test_rh_dashboard_returns_light_summary_and_pending_actions(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _create_active_user(
        db_session,
        f"rh-admin-{uuid4().hex[:8]}@test.com",
        "pass1234",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, user.email, "pass1234")

    candidate = _candidate("Ana Silva")
    job = _job(user.id)
    db_session.add_all([candidate, job])
    await db_session.flush()

    pipeline = _pipeline(candidate.id, job.id, "final")
    interview = _today_interview(candidate.id, job.id)
    db_session.add_all([pipeline, interview])
    await db_session.commit()

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["new_candidates"] >= 1
    assert body["summary"]["interviews_today"] >= 1
    assert body["summary"]["pending_decisions"] >= 1

    action = next(item for item in body["pending_actions"] if item["type"] == "interview_today")
    assert action["candidate_id"] == str(candidate.id)
    assert action["candidate_name"] == "Ana Silva"
    assert action["job_id"] == str(job.id)
    assert action["job_title"] == "Analista de RH"
    assert action["action_label"] == "Abrir Agenda"
    assert action["href"] == "/agenda"

    forbidden_keys = {
        "documents",
        "match_details",
        "score_details",
        "protheus_payload",
        "internal_notes",
        "history",
    }
    assert forbidden_keys.isdisjoint(action.keys())


async def test_rh_dashboard_empty_state_contract(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers(client, db_session, UserRole.RECRUITER)

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {
        "new_candidates": 0,
        "interviews_today": 0,
        "pending_decisions": 0,
        "active_jobs": 0,
        "pending_pre_admissions": 0,
        "admitted_this_month": 0,
    }
    assert body["pending_actions"] == []


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR, UserRole.RECRUITER, UserRole.VIEWER])
async def test_rh_dashboard_allowed_internal_read_roles(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    headers = await _headers(client, db_session, role)

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == 200


async def test_rh_dashboard_blocks_candidate_role(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers(client, db_session, UserRole.CANDIDATE)

    response = await client.get(ENDPOINT, headers=headers)

    assert response.status_code == 403


async def test_rh_dashboard_trends_returns_contiguous_daily_points(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = await _create_active_user(
        db_session,
        f"rh-trends-{uuid4().hex[:8]}@test.com",
        "pass1234",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, user.email, "pass1234")

    candidate = _candidate("Carlos Silva")
    job = _job(user.id)
    db_session.add_all([candidate, job])
    await db_session.flush()

    interview = _today_interview(candidate.id, job.id)
    db_session.add(interview)
    await db_session.commit()

    # Test default 14 days
    res = await client.get("/api/v1/rh/dashboard/trends", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["days"] == 14
    assert len(body["points"]) == 14

    # Verify point structure
    for pt in body["points"]:
        assert "date" in pt
        assert "candidates" in pt
        assert "interviews" in pt
        assert "hires" in pt

    # Test custom 7 days param
    res7 = await client.get("/api/v1/rh/dashboard/trends", params={"days": 7}, headers=headers)
    assert res7.status_code == 200
    body7 = res7.json()
    assert body7["days"] == 7
    assert len(body7["points"]) == 7


async def test_rh_dashboard_trends_blocks_candidate_role(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _headers(client, db_session, UserRole.CANDIDATE)
    res = await client.get("/api/v1/rh/dashboard/trends", headers=headers)
    assert res.status_code == 403

