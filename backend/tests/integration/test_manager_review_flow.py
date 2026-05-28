"""Manager review flow — RBAC, review-requests endpoint, feedback gate satisfaction."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel

from .helpers import _auth_headers, _create_active_user, _seed_scoring_case


# ── helpers ──────────────────────────────────────────────────────────────────

async def _make_headers(client: AsyncClient, db: AsyncSession, role: UserRole, suffix: str = "") -> tuple[dict, UUID]:
    user = await _create_active_user(
        db,
        f"review-flow-{role.value}-{suffix or uuid4().hex[:6]}@example.com",
        "Senha123!",
        role,
    )
    headers = await _auth_headers(client, user.email, "Senha123!")
    return headers, user.id


async def _seed_job_candidate(db: AsyncSession, owner_id: UUID) -> tuple[UUID, UUID]:
    job_id, candidate_id, _ = await _seed_scoring_case(
        db,
        owner_id,
        job_title=f"Vaga revisão {uuid4().hex[:6]}",
        candidate_email=f"rev-cand-{uuid4().hex}@example.com",
        include_ranking_row=False,
    )
    return job_id, candidate_id


async def _assign_manager_to_job(db: AsyncSession, manager_id: UUID, candidate_id: UUID, job_id: UUID) -> None:
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        evaluator_id=manager_id,
        status="draft",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(scorecard)
    await db.commit()


async def _post_review_request(
    client: AsyncClient,
    headers: dict,
    job_id: UUID,
    candidate_id: UUID,
    *,
    message: str = "Por favor revise este candidato.",
    target_manager_id: UUID | None = None,
    priority: str | None = None,
) -> dict:
    body: dict = {"message": message}
    if target_manager_id:
        body["target_manager_id"] = str(target_manager_id)
    if priority:
        body["priority"] = priority
    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-manager-review",
        headers=headers,
        json=body,
    )
    assert resp.status_code == status.HTTP_200_OK, resp.text
    return resp.json()


async def _post_manager_feedback(
    client: AsyncClient,
    headers: dict,
    job_id: UUID,
    candidate_id: UUID,
    *,
    message: str = "Candidato adequado.",
    recommendation: str = "advance",
) -> dict:
    resp = await client.post(
        f"/api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/feedback",
        headers=headers,
        json={"message": message, "recommendation": recommendation},
    )
    assert resp.status_code == status.HTTP_200_OK, resp.text
    return resp.json()


# ── RBAC: /manager/review-requests ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_accesses_review_requests(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "admin")
    resp = await client.get("/api/v1/manager/review-requests", headers=admin_h)
    assert resp.status_code == status.HTTP_200_OK
    assert "requests" in resp.json()


@pytest.mark.asyncio
async def test_manager_accesses_review_requests(client: AsyncClient, db_session: AsyncSession) -> None:
    mgr_h, _ = await _make_headers(client, db_session, UserRole.MANAGER)
    resp = await client.get("/api/v1/manager/review-requests", headers=mgr_h)
    assert resp.status_code == status.HTTP_200_OK
    assert "requests" in resp.json()


@pytest.mark.asyncio
async def test_recruiter_cannot_access_review_requests(client: AsyncClient, db_session: AsyncSession) -> None:
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER)
    resp = await client.get("/api/v1/manager/review-requests", headers=rec_h)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_viewer_cannot_access_review_requests(client: AsyncClient, db_session: AsyncSession) -> None:
    v_h, _ = await _make_headers(client, db_session, UserRole.VIEWER)
    resp = await client.get("/api/v1/manager/review-requests", headers=v_h)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_candidate_cannot_access_review_requests(client: AsyncClient, db_session: AsyncSession) -> None:
    cand_h, _ = await _make_headers(client, db_session, UserRole.CANDIDATE)
    resp = await client.get("/api/v1/manager/review-requests", headers=cand_h)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


# ── Request-review endpoint ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_recruiter_requests_manager_review(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    comment = await _post_review_request(
        client, rec_h, job_id, candidate_id,
        message="Candidato promissor para posição de liderança.",
        priority="high",
    )

    assert comment["comment_type"] == "review_request"
    assert comment["author_role"] == "recruiter"


@pytest.mark.asyncio
async def test_request_manager_review_accepts_valid_target_manager_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "owner")
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER, "recruiter")
    _, manager_id = await _make_headers(client, db_session, UserRole.MANAGER, "target")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    comment = await _post_review_request(
        client,
        rec_h,
        job_id,
        candidate_id,
        target_manager_id=manager_id,
        priority="medium",
    )

    assert comment["target_manager_id"] == str(manager_id)
    assert comment["priority"] == "medium"


@pytest.mark.asyncio
async def test_request_manager_review_rejects_non_manager_target(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "owner")
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER, "recruiter")
    _, viewer_id = await _make_headers(client, db_session, UserRole.VIEWER, "viewer")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-manager-review",
        headers=rec_h,
        json={"message": "Preciso da revisão do gestor.", "target_manager_id": str(viewer_id)},
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert resp.json()["detail"] == "O destinatário informado não é um gestor."


@pytest.mark.asyncio
async def test_request_manager_review_requires_target_when_manager_exists(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "owner")
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER, "recruiter")
    await _make_headers(client, db_session, UserRole.MANAGER, "available")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    resp = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-manager-review",
        headers=rec_h,
        json={"message": "Preciso da revisão do gestor."},
    )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert resp.json()["detail"] == "Selecione o gestor responsável pela revisão."


@pytest.mark.asyncio
async def test_manager_sees_directed_review_request(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER)
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr_id, candidate_id, job_id)

    await _post_review_request(
        client, rec_h, job_id, candidate_id,
        message="Revise com atenção.",
        target_manager_id=mgr_id,
        priority="medium",
    )

    resp = await client.get("/api/v1/manager/review-requests", headers=mgr_h)
    assert resp.status_code == status.HTTP_200_OK
    items = resp.json()["requests"]
    assert len(items) == 1
    assert items[0]["candidate_id"] == str(candidate_id)
    assert items[0]["priority"] == "medium"
    assert items[0]["status"] == "pending"
    assert items[0]["is_directed_to_me"] is True
    assert items[0]["target_manager_id"] == str(mgr_id)


@pytest.mark.asyncio
async def test_directed_manager_can_view_collaboration_without_existing_scorecard(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "owner")
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER, "recruiter")
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER, "target")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    await _post_review_request(
        client,
        rec_h,
        job_id,
        candidate_id,
        message="Revise sem scorecard prévio.",
        target_manager_id=mgr_id,
        priority="high",
    )

    resp = await client.get(
        f"/api/v1/manager/jobs/{job_id}/candidates/{candidate_id}/collaboration",
        headers=mgr_h,
    )

    assert resp.status_code == status.HTTP_200_OK, resp.text
    comments = resp.json()["comments"]
    assert len(comments) == 1
    assert comments[0]["comment_type"] == "review_request"
    assert comments[0]["target_manager_id"] == str(mgr_id)


@pytest.mark.asyncio
async def test_manager_does_not_see_other_manager_directed_request(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER)
    mgr1_h, mgr1_id = await _make_headers(client, db_session, UserRole.MANAGER, "mgr1")
    mgr2_h, mgr2_id = await _make_headers(client, db_session, UserRole.MANAGER, "mgr2")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr1_id, candidate_id, job_id)

    # Directed explicitly to mgr1
    await _post_review_request(
        client, rec_h, job_id, candidate_id,
        target_manager_id=mgr1_id,
    )

    # mgr2 should NOT see it
    resp = await client.get("/api/v1/manager/review-requests", headers=mgr2_h)
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.json()["requests"]) == 0


@pytest.mark.asyncio
async def test_admin_sees_all_review_requests(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "admin")
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER, "recruiter")
    _, mgr1_id = await _make_headers(client, db_session, UserRole.MANAGER, "mgr1")
    _, mgr2_id = await _make_headers(client, db_session, UserRole.MANAGER, "mgr2")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    await _post_review_request(
        client,
        rec_h,
        job_id,
        candidate_id,
        message="Direcionado ao gestor 1",
        target_manager_id=mgr1_id,
    )
    await _post_review_request(
        client,
        rec_h,
        job_id,
        candidate_id,
        message="Direcionado ao gestor 2",
        target_manager_id=mgr2_id,
    )

    resp = await client.get("/api/v1/manager/review-requests", headers=admin_h)

    assert resp.status_code == status.HTTP_200_OK
    messages = [item["latest_message"] for item in resp.json()["requests"]]
    assert "Direcionado ao gestor 1" in messages
    assert "Direcionado ao gestor 2" in messages


# ── Feedback and gate satisfaction ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_manager_submits_feedback(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr_id, candidate_id, job_id)

    comment = await _post_manager_feedback(
        client, mgr_h, job_id, candidate_id,
        message="Candidato alinhado com a cultura da equipe.",
        recommendation="advance",
    )

    assert comment["comment_type"] == "manager_feedback"
    assert comment["author_role"] == "manager"
    assert comment["recommendation"] == "advance"


@pytest.mark.asyncio
async def test_directed_manager_submits_feedback_without_existing_scorecard(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN, "owner")
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER, "recruiter")
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER, "target")
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)

    await _post_review_request(
        client,
        rec_h,
        job_id,
        candidate_id,
        message="Pode responder sem scorecard prévio.",
        target_manager_id=mgr_id,
    )

    comment = await _post_manager_feedback(
        client,
        mgr_h,
        job_id,
        candidate_id,
        message="Feedback coerente sem scorecard anterior.",
        recommendation="advance",
    )

    assert comment["comment_type"] == "manager_feedback"
    assert comment["author_role"] == "manager"
    assert comment["recommendation"] == "advance"


@pytest.mark.asyncio
async def test_manager_feedback_satisfies_has_manager_feedback_gate(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Feedback via POST /manager/…/feedback creates author_role='manager', satisfying the gate."""
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr_id, candidate_id, job_id)

    await _post_manager_feedback(client, mgr_h, job_id, candidate_id)

    count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CollaborationCommentModel).where(
            CollaborationCommentModel.candidate_id == candidate_id,
            CollaborationCommentModel.job_id == job_id,
            CollaborationCommentModel.author_role == "manager",
            CollaborationCommentModel.comment_type == "manager_feedback",
        )
    )
    assert (count or 0) > 0


@pytest.mark.asyncio
async def test_feedback_does_not_move_pipeline(client: AsyncClient, db_session: AsyncSession) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr_id, candidate_id, job_id)

    pipeline_before = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    stage_before = pipeline_before.pipeline_stage if pipeline_before else None

    await _post_manager_feedback(client, mgr_h, job_id, candidate_id, recommendation="advance")

    if pipeline_before:
        await db_session.refresh(pipeline_before)
        assert pipeline_before.pipeline_stage == stage_before


@pytest.mark.asyncio
async def test_feedback_does_not_create_hiring_decision(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    from src.infrastructure.database.models.hiring_decision_model import CandidateJobHiringDecisionModel

    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr_id, candidate_id, job_id)

    await _post_manager_feedback(client, mgr_h, job_id, candidate_id, recommendation="advance")

    decision_count = await db_session.scalar(
        sa.select(sa.func.count()).select_from(CandidateJobHiringDecisionModel).where(
            CandidateJobHiringDecisionModel.candidate_id == candidate_id,
            CandidateJobHiringDecisionModel.job_id == job_id,
        )
    )
    assert (decision_count or 0) == 0


@pytest.mark.asyncio
async def test_review_request_status_becomes_answered_after_feedback(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_h, admin_id = await _make_headers(client, db_session, UserRole.ADMIN)
    rec_h, _ = await _make_headers(client, db_session, UserRole.RECRUITER)
    mgr_h, mgr_id = await _make_headers(client, db_session, UserRole.MANAGER)
    job_id, candidate_id = await _seed_job_candidate(db_session, admin_id)
    await _assign_manager_to_job(db_session, mgr_id, candidate_id, job_id)

    await _post_review_request(client, rec_h, job_id, candidate_id, target_manager_id=mgr_id)

    resp_before = await client.get("/api/v1/manager/review-requests", headers=mgr_h)
    assert resp_before.json()["requests"][0]["status"] == "pending"

    await _post_manager_feedback(client, mgr_h, job_id, candidate_id)

    resp_after = await client.get("/api/v1/manager/review-requests", headers=mgr_h)
    assert resp_after.json()["requests"][0]["status"] == "answered"


# ── Security: manager cannot access documents / ERP ──────────────────────────

@pytest.mark.asyncio
async def test_manager_cannot_access_documents_endpoint(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    mgr_h, _ = await _make_headers(client, db_session, UserRole.MANAGER)
    candidate_id = uuid4()
    resp = await client.get(
        f"/api/v1/candidates/{candidate_id}/documents",
        headers=mgr_h,
    )
    assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)


@pytest.mark.asyncio
async def test_manager_cannot_access_pre_admission(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    mgr_h, _ = await _make_headers(client, db_session, UserRole.MANAGER)
    candidate_id = uuid4()
    resp = await client.get(
        f"/api/v1/candidates/{candidate_id}/pre-admission",
        headers=mgr_h,
    )
    assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)
