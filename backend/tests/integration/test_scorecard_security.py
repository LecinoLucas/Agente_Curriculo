"""
Fase 31S — Testes de segurança para interview scorecards.

Cobre:
- Manager vê apenas o próprio scorecard (evaluator_id = current_user.id)
- Manager com review_request NÃO acessa scorecard de outro avaliador
- Manager sem scorecard próprio nem review_request → 403
- Recruiter/admin acessa qualquer scorecard
- Viewer bloqueado (403)
- Isolamento cross-manager: manager A não vê scorecard de manager B
"""

from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel

from tests.integration.helpers import _auth_headers, _create_active_user, _seed_scoring_case


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _seed_pipeline(db_session: AsyncSession, created_by_id: UUID) -> tuple[UUID, UUID]:
    """Seed a minimal candidate+job pipeline. Returns (job_id, candidate_id)."""
    job_id, candidate_id, _ = await _seed_scoring_case(
        db_session,
        created_by_id,
        job_title=f"Vaga Seg {uuid4().hex[:6]}",
        candidate_email=f"cand-sec-{uuid4().hex[:6]}@test.com",
    )
    return job_id, candidate_id


async def _manager_user(db_session: AsyncSession) -> tuple[dict, UUID, str]:
    """Create a manager and return (auth_headers_placeholder, user_id, email, password)."""
    email = f"manager-{uuid4().hex[:6]}@test.com"
    password = "Senha123!"
    user = await _create_active_user(db_session, email, password, UserRole.MANAGER)
    return user.id, email, password


async def _recruiter_user(db_session: AsyncSession) -> tuple[UUID, str, str]:
    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    password = "Senha123!"
    user = await _create_active_user(db_session, email, password, UserRole.RECRUITER)
    return user.id, email, password


async def _create_scorecard_in_db(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    evaluator_id: UUID,
) -> InterviewScorecardModel:
    pipeline_id = await db_session.scalar(
        sa.select(CandidateJobPipelineModel.candidate_job_pipeline_id).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    scorecard = InterviewScorecardModel(
        candidate_id=candidate_id,
        job_id=job_id,
        pipeline_id=pipeline_id,
        evaluator_id=evaluator_id,
        status="draft",
    )
    db_session.add(scorecard)
    await db_session.flush()
    await db_session.commit()
    return scorecard


async def _create_review_request(
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    author_id: UUID,
    target_manager_id: UUID,
) -> None:
    comment = CollaborationCommentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        author_id=author_id,
        author_role="recruiter",
        comment_type="review_request",
        visibility="internal",
        target_manager_id=target_manager_id,
        message="Por favor, avalie este candidato.",
    )
    db_session.add(comment)
    await db_session.commit()


# ---------------------------------------------------------------------------
# 1. Manager vê o próprio scorecard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_manager_can_read_own_scorecard(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_id, admin_email, admin_pass = await _recruiter_user(db_session)
    manager_id, mgr_email, mgr_pass = await _manager_user(db_session)

    job_id, candidate_id = await _seed_pipeline(db_session, admin_id)

    await _create_scorecard_in_db(
        db_session, candidate_id=candidate_id, job_id=job_id, evaluator_id=manager_id
    )

    headers = await _auth_headers(client, mgr_email, mgr_pass)
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["scorecard"] is not None
    assert data["scorecard"]["evaluator_id"] == str(manager_id)


# ---------------------------------------------------------------------------
# 2. Manager com review_request NÃO vê scorecard de outro avaliador
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_manager_with_review_request_cannot_see_other_evaluators_scorecard(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, rec_email, rec_pass = await _recruiter_user(db_session)
    manager_a_id, mgr_a_email, mgr_a_pass = await _manager_user(db_session)
    manager_b_id, mgr_b_email, mgr_b_pass = await _manager_user(db_session)

    job_id, candidate_id = await _seed_pipeline(db_session, recruiter_id)

    # Manager A creates the scorecard
    await _create_scorecard_in_db(
        db_session, candidate_id=candidate_id, job_id=job_id, evaluator_id=manager_a_id
    )

    # Recruiter sends a review_request to manager B (no own scorecard)
    await _create_review_request(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        author_id=recruiter_id,
        target_manager_id=manager_b_id,
    )

    # Manager B: passes _assert_manager_candidate_access but must NOT see manager A's scorecard
    headers_b = await _auth_headers(client, mgr_b_email, mgr_b_pass)
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers_b,
    )

    assert resp.status_code == 200
    data = resp.json()
    # scorecard must be None — manager B has no own scorecard
    assert data["scorecard"] is None


# ---------------------------------------------------------------------------
# 3. Manager sem scorecard próprio nem review_request → 403
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_manager_without_access_gets_403(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, _, _ = await _recruiter_user(db_session)
    stranger_id, stranger_email, stranger_pass = await _manager_user(db_session)

    job_id, candidate_id = await _seed_pipeline(db_session, recruiter_id)

    headers = await _auth_headers(client, stranger_email, stranger_pass)
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
    )

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 4. Recruiter vê qualquer scorecard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_recruiter_can_read_any_scorecard(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, rec_email, rec_pass = await _recruiter_user(db_session)
    manager_id, _, _ = await _manager_user(db_session)

    job_id, candidate_id = await _seed_pipeline(db_session, recruiter_id)

    await _create_scorecard_in_db(
        db_session, candidate_id=candidate_id, job_id=job_id, evaluator_id=manager_id
    )

    headers = await _auth_headers(client, rec_email, rec_pass)
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
    )

    assert resp.status_code == 200
    assert resp.json()["scorecard"]["evaluator_id"] == str(manager_id)


# ---------------------------------------------------------------------------
# 5. Viewer bloqueado (403)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_viewer_cannot_access_scorecard(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, _, _ = await _recruiter_user(db_session)
    viewer_email = f"viewer-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, viewer_email, "Senha123!", UserRole.VIEWER)

    job_id, candidate_id = await _seed_pipeline(db_session, recruiter_id)

    headers = await _auth_headers(client, viewer_email, "Senha123!")
    resp = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers,
    )

    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 6. Isolamento cross-manager: dois gestores, cada um vê apenas o próprio
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cross_manager_scorecard_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, rec_email, rec_pass = await _recruiter_user(db_session)
    manager_a_id, mgr_a_email, mgr_a_pass = await _manager_user(db_session)
    manager_b_id, mgr_b_email, mgr_b_pass = await _manager_user(db_session)

    job_id, candidate_id = await _seed_pipeline(db_session, recruiter_id)

    # Manager A creates an initial scorecard.
    await _create_scorecard_in_db(
        db_session, candidate_id=candidate_id, job_id=job_id, evaluator_id=manager_a_id
    )

    # Give both managers review_requests so they pass the access gate
    await _create_review_request(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        author_id=recruiter_id,
        target_manager_id=manager_a_id,
    )
    await _create_review_request(
        db_session,
        candidate_id=candidate_id,
        job_id=job_id,
        author_id=recruiter_id,
        target_manager_id=manager_b_id,
    )

    # Manager A sees own scorecard
    headers_a = await _auth_headers(client, mgr_a_email, mgr_a_pass)
    resp_a = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers_a,
    )
    assert resp_a.status_code == 200
    assert resp_a.json()["scorecard"]["evaluator_id"] == str(manager_a_id)

    # Manager B initially sees no own scorecard even though they have access via review_request.
    headers_b = await _auth_headers(client, mgr_b_email, mgr_b_pass)
    resp_b = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers_b,
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["scorecard"] is None

    # Manager B can still create and read their own scorecard in the same context.
    create_b = await client.post(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers_b,
        json={"items": [{"competency_name": "Liderança", "display_order": 1}]},
    )
    assert create_b.status_code == 201, create_b.text
    assert create_b.json()["evaluator_id"] == str(manager_b_id)

    resp_b_after = await client.get(
        f"/api/v1/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
        headers=headers_b,
    )
    assert resp_b_after.status_code == 200
    assert resp_b_after.json()["scorecard"]["evaluator_id"] == str(manager_b_id)
