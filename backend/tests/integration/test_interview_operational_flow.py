from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> tuple[UUID, dict[str, str]]:
    user = await _create_active_user(
        db_session,
        f"interview-recruiter-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    return user.id, await _auth_headers(client, user.email, "Senha123!")


async def _role_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> tuple[UUID, dict[str, str]]:
    user = await _create_active_user(
        db_session,
        f"interview-{role.value}-{uuid4().hex}@example.com",
        "Senha123!",
        role,
    )
    return user.id, await _auth_headers(client, user.email, "Senha123!")


async def _seed_candidate_job(
    db_session: AsyncSession,
    *,
    owner_id: UUID | None = None,
    include_ranking_row: bool = True,
) -> tuple[UUID, UUID]:
    if owner_id is None:
        owner = await _create_active_user(
            db_session,
            f"interview-owner-{uuid4().hex}@example.com",
            "Senha123!",
            UserRole.ADMIN,
        )
        owner_id = owner.id
    job_id, candidate_id, _match_id = await _seed_scoring_case(
        db_session,
        owner_id,
        job_title=f"Vaga Entrevista {uuid4().hex[:6]}",
        candidate_email=f"interview-candidate-{uuid4().hex}@example.com",
        include_ranking_row=include_ranking_row,
    )
    return job_id, candidate_id


async def _create_interview(
    client: AsyncClient,
    headers: dict[str, str],
    job_id: UUID,
    candidate_id: UUID,
    *,
    start: datetime | None = None,
    create_google_event: bool = False,
) -> dict:
    start = start or datetime.now(UTC) + timedelta(days=7)
    response = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews",
        headers=headers,
        json={
            "title": "Entrevista RH",
            "interview_type": "hr",
            "interview_format": "online",
            "scheduled_start": start.isoformat(),
            "scheduled_end": (start + timedelta(hours=1)).isoformat(),
            "timezone": "America/Recife",
            "interviewer_name": "Maria RH",
            "interviewer_email": "maria.rh@example.com",
            "create_google_event": create_google_event,
        },
    )
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio
async def test_operational_interview_lifecycle_and_scorecard_link(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session, owner_id=recruiter_id)
    start = datetime.now(UTC) + timedelta(days=10)

    created = await _create_interview(client, headers, job_id, candidate_id, start=start, create_google_event=True)
    assert created["status"] == "scheduled"
    assert created["candidate_id"] == str(candidate_id)
    assert created["job_id"] == str(job_id)
    assert created["calendar_sync_status"] == "no_connection"

    listing = await client.get(f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews", headers=headers)
    assert listing.status_code == status.HTTP_200_OK, listing.text
    assert listing.json()["data"][0]["id"] == created["id"]

    conflict = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interviews",
        headers=headers,
        json={
            "title": "Conflito",
            "interview_type": "hr",
            "interview_format": "online",
            "scheduled_start": (start + timedelta(minutes=15)).isoformat(),
            "scheduled_end": (start + timedelta(hours=1, minutes=15)).isoformat(),
            "timezone": "America/Recife",
        },
    )
    assert conflict.status_code == status.HTTP_409_CONFLICT

    reschedule_start = start + timedelta(days=1)
    rescheduled = await client.patch(
        f"/api/v1/interviews/{created['id']}/reschedule",
        headers=headers,
        json={
            "scheduled_start": reschedule_start.isoformat(),
            "scheduled_end": (reschedule_start + timedelta(hours=1)).isoformat(),
            "timezone": "America/Recife",
        },
    )
    assert rescheduled.status_code == status.HTTP_200_OK, rescheduled.text
    assert rescheduled.json()["status"] == "rescheduled"

    completed = await client.post(
        f"/api/v1/interviews/{created['id']}/complete",
        headers=headers,
        json={"internal_notes": "Entrevista realizada."},
    )
    assert completed.status_code == status.HTTP_200_OK, completed.text
    assert completed.json()["status"] == "awaiting_feedback"

    scorecard = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
        json={
            "interview_id": created["id"],
            "final_recommendation": "yes",
            "items": [
                {
                    "competency_name": "Comunicação",
                    "rating": 4,
                    "evidence": "Resposta clara e objetiva.",
                    "display_order": 1,
                }
            ],
        },
    )
    assert scorecard.status_code == status.HTTP_201_CREATED, scorecard.text
    submit = await client.post(f"/api/v1/interview-scorecards/{scorecard.json()['id']}/submit", headers=headers)
    assert submit.status_code == status.HTTP_200_OK, submit.text

    refreshed = await client.get(f"/api/v1/agenda/interviews/{created['id']}", headers=headers)
    assert refreshed.status_code == status.HTTP_200_OK, refreshed.text
    assert refreshed.json()["status"] == "completed"

    summary = await client.get(f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/decision-summary", headers=headers)
    assert summary.status_code == status.HTTP_200_OK, summary.text
    summary_payload = summary.json()
    assert summary_payload["interview"]["status"] == "completed"
    assert summary_payload["interview_scorecard"]["status"] == "submitted"


@pytest.mark.asyncio
async def test_cancel_no_show_and_no_automatic_pipeline_or_score_change(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(
        db_session,
        owner_id=recruiter_id,
        include_ranking_row=True,
    )

    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    stage_before = pipeline.pipeline_stage
    score_count_before = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
            )
        )
        or 0
    )

    first = await _create_interview(
        client,
        headers,
        job_id,
        candidate_id,
        start=datetime.now(UTC) + timedelta(days=20),
    )
    cancelled = await client.post(
        f"/api/v1/interviews/{first['id']}/cancel",
        headers=headers,
        json={"cancel_reason": "Candidato pediu reagendamento."},
    )
    assert cancelled.status_code == status.HTTP_200_OK, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["cancel_reason"] == "Candidato pediu reagendamento."

    second = await _create_interview(
        client,
        headers,
        job_id,
        candidate_id,
        start=datetime.now(UTC) + timedelta(days=22),
    )
    no_show = await client.post(
        f"/api/v1/interviews/{second['id']}/no-show",
        headers=headers,
        json={"reason": "Candidato não compareceu."},
    )
    assert no_show.status_code == status.HTTP_200_OK, no_show.text
    assert no_show.json()["status"] == "no_show"

    await db_session.refresh(pipeline)
    score_count_after = int(
        await db_session.scalar(
            sa.select(sa.func.count(CandidateJobScoreModel.id)).where(
                CandidateJobScoreModel.candidate_id == candidate_id,
                CandidateJobScoreModel.job_id == job_id,
            )
        )
        or 0
    )
    assert pipeline.pipeline_stage == stage_before
    assert score_count_after == score_count_before


@pytest.mark.asyncio
async def test_agenda_write_rbac_blocks_viewer_and_manager(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_id, admin_headers = await _role_headers(client, db_session, UserRole.ADMIN)
    _viewer_id, viewer_headers = await _role_headers(client, db_session, UserRole.VIEWER)
    _manager_id, manager_headers = await _role_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_candidate_job(db_session, owner_id=admin_id)
    created = await _create_interview(client, admin_headers, job_id, candidate_id)

    payload = {
        "candidate_id": str(candidate_id),
        "job_id": str(job_id),
        "title": "Entrevista bloqueada",
        "interview_type": "hr",
        "interview_format": "online",
        "scheduled_start": (datetime.now(UTC) + timedelta(days=30)).isoformat(),
        "scheduled_end": (datetime.now(UTC) + timedelta(days=30, hours=1)).isoformat(),
        "timezone": "America/Recife",
    }

    viewer_create = await client.post("/api/v1/agenda/interviews", headers=viewer_headers, json=payload)
    assert viewer_create.status_code == status.HTTP_403_FORBIDDEN
    assert viewer_create.json()["detail"] == "Você não tem permissão para operar a agenda."

    manager_create = await client.post("/api/v1/agenda/interviews", headers=manager_headers, json=payload)
    assert manager_create.status_code == status.HTTP_403_FORBIDDEN

    for method, path, body in [
        ("patch", f"/api/v1/agenda/interviews/{created['id']}", {"title": "Editada"}),
        ("patch", f"/api/v1/agenda/interviews/{created['id']}/cancel", {"cancel_reason": "Sem permissão"}),
        ("post", f"/api/v1/interviews/{created['id']}/complete", {}),
        ("post", f"/api/v1/interviews/{created['id']}/no-show", {"reason": "Sem permissão"}),
    ]:
        response = await getattr(client, method)(path, headers=viewer_headers, json=body)
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_recruiter_scope_and_required_candidate_job_link(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    owner_id, owner_headers = await _recruiter_headers(client, db_session)
    _other_id, other_headers = await _recruiter_headers(client, db_session)
    job_id, candidate_id = await _seed_candidate_job(db_session, owner_id=owner_id)

    start = datetime.now(UTC) + timedelta(days=40)
    valid_payload = {
        "candidate_id": str(candidate_id),
        "job_id": str(job_id),
        "title": "Entrevista com vínculo",
        "interview_type": "hr",
        "interview_format": "online",
        "scheduled_start": start.isoformat(),
        "scheduled_end": (start + timedelta(hours=1)).isoformat(),
        "timezone": "America/Recife",
    }

    created = await client.post("/api/v1/agenda/interviews", headers=owner_headers, json=valid_payload)
    assert created.status_code == status.HTTP_201_CREATED, created.text

    denied = await client.post(
        "/api/v1/agenda/interviews",
        headers=other_headers,
        json={**valid_payload, "scheduled_start": (start + timedelta(days=1)).isoformat(), "scheduled_end": (start + timedelta(days=1, hours=1)).isoformat()},
    )
    assert denied.status_code == status.HTTP_403_FORBIDDEN
    assert denied.json()["detail"] == "Você não tem permissão para operar entrevistas deste candidato ou vaga."

    no_link = await client.post(
        "/api/v1/agenda/interviews",
        headers=owner_headers,
        json={key: value for key, value in valid_payload.items() if key != "job_id"},
    )
    assert no_link.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert no_link.json()["detail"] == "Selecione uma vaga vinculada ao candidato para agendar a entrevista."


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.HR])
async def test_admin_and_hr_can_operate_agenda(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    user_id, headers = await _role_headers(client, db_session, role)
    job_id, candidate_id = await _seed_candidate_job(db_session, owner_id=user_id)
    created = await _create_interview(
        client,
        headers,
        job_id,
        candidate_id,
        start=datetime.now(UTC) + timedelta(days=50),
    )

    completed = await client.post(
        f"/api/v1/interviews/{created['id']}/complete",
        headers=headers,
        json={"internal_notes": "Entrevista realizada."},
    )
    assert completed.status_code == status.HTTP_200_OK, completed.text
