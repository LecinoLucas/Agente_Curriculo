"""
Testes de segurança RBAC: endpoint de colaboração do manager.

Cobre achado R-M2 da auditoria de segurança Fase 1.
- GET /manager/jobs/{job_id}/candidates/{candidate_id}/collaboration
  deve retornar 403 para manager sem atribuição,
  independentemente de haver comentários ou não.
"""
from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.user_model import UserModel
from tests.integration.helpers import _create_active_user, _auth_headers


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _setup_job_and_candidate(db_session: AsyncSession):
    _system_user_id = uuid4()
    job = JobModel(title="Test Job", description="Desc", status="published", created_by=_system_user_id)
    candidate = CandidateModel(email=f"cand-{uuid4().hex[:8]}@collab.example.com", full_name="Collab Candidate", created_by=_system_user_id)
    db_session.add(job)
    db_session.add(candidate)
    await db_session.flush()
    return job, candidate


async def _create_manager(db_session: AsyncSession, suffix: str = "") -> UserModel:
    from src.infrastructure.security.password_service import hash_password
    from datetime import datetime, timezone

    manager = UserModel(
        id=uuid4(),
        email=f"manager{suffix}@collab.example.com",
        full_name=f"Manager {suffix}",
        role=UserRole.MANAGER.value,
        status="active",
        password_hash=hash_password("manager_pass"),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(manager)
    await db_session.flush()
    return manager


async def _assign_manager_scorecard(
    db_session: AsyncSession,
    manager_id,
    candidate_id,
    job_id,
) -> None:
    scorecard = InterviewScorecardModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        evaluator_id=manager_id,
        status="draft",
    )
    db_session.add(scorecard)
    await db_session.flush()


async def _add_collaboration_comment(
    db_session: AsyncSession,
    author_id,
    candidate_id,
    job_id,
    comment_type: str = "internal",
    target_manager_id=None,
) -> None:
    from datetime import datetime, timezone

    comment = CollaborationCommentModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        author_id=author_id,
        author_role="recruiter",
        comment_type=comment_type,
        message="Test collaboration comment",
        target_manager_id=target_manager_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(comment)
    await db_session.flush()


async def _manager_headers(
    client: AsyncClient, db_session: AsyncSession, manager: UserModel
) -> dict[str, str]:
    return await _auth_headers(client, manager.email, "manager_pass")


# ── R-M2: IDOR fix tests ──────────────────────────────────────────────────────


class TestManagerCollaborationAccess:
    """Manager sem atribuição deve receber 403, mesmo se houver comentários."""

    @pytest.mark.asyncio
    async def test_manager_without_assignment_gets_403_when_no_comments(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Manager sem scorecard/review_request recebe 403 mesmo sem comentários."""
        job, candidate = await _setup_job_and_candidate(db_session)
        manager = await _create_manager(db_session, "_no_assign_no_comments")
        await db_session.commit()

        headers = await _manager_headers(client, db_session, manager)
        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration",
            headers=headers,
        )
        assert r.status_code == 403, f"Esperado 403, recebeu {r.status_code}: {r.text}"

    @pytest.mark.asyncio
    async def test_manager_without_assignment_gets_403_even_with_existing_comments(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """
        Manager sem scorecard/review_request recebe 403 mesmo quando há comentários.
        Este é o IDOR corrigido: antes, havia comentários → a verificação era pulada.
        """
        job, candidate = await _setup_job_and_candidate(db_session)
        unassigned_manager = await _create_manager(db_session, "_no_assign_with_comments")
        recruiter = await _create_active_user(db_session, f"recruiter-{uuid4().hex[:6]}@collab.example.com", "pass123", UserRole.RECRUITER)
        await db_session.commit()

        # Adicionar um comentário real (feito por recruiter)
        await _add_collaboration_comment(db_session, recruiter.id, candidate.id, job.id)
        await db_session.commit()

        headers = await _manager_headers(client, db_session, unassigned_manager)
        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration",
            headers=headers,
        )
        # Após a correção do IDOR, manager sem atribuição deve receber 403
        assert r.status_code == 403, (
            f"Manager sem atribuição deve receber 403 mesmo com comentários. "
            f"Recebeu {r.status_code}: {r.text}"
        )

    @pytest.mark.asyncio
    async def test_manager_with_scorecard_can_access_collaboration(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Manager COM scorecard pode acessar colaboração (comportamento preservado)."""
        job, candidate = await _setup_job_and_candidate(db_session)
        assigned_manager = await _create_manager(db_session, "_assigned")
        await _assign_manager_scorecard(db_session, assigned_manager.id, candidate.id, job.id)
        await db_session.commit()

        headers = await _manager_headers(client, db_session, assigned_manager)
        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration",
            headers=headers,
        )
        assert r.status_code == 200, f"Manager atribuído deve ter acesso 200, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_manager_with_review_request_can_access_collaboration(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Manager com review_request direcionada pode acessar colaboração."""
        job, candidate = await _setup_job_and_candidate(db_session)
        manager = await _create_manager(db_session, "_review_req")
        recruiter = await _create_active_user(
            db_session, f"recruiter-rr-{uuid4().hex[:6]}@collab.example.com", "pass123", UserRole.RECRUITER
        )
        await db_session.commit()

        # Adicionar review_request direcionada para este manager
        await _add_collaboration_comment(
            db_session,
            recruiter.id,
            candidate.id,
            job.id,
            comment_type="review_request",
            target_manager_id=manager.id,
        )
        await db_session.commit()

        headers = await _manager_headers(client, db_session, manager)
        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration",
            headers=headers,
        )
        assert r.status_code == 200, f"Manager com review_request deve ter acesso, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_admin_can_access_any_manager_collaboration(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Admin acessa colaboração de qualquer candidato/vaga (bypass para oversight)."""
        job, candidate = await _setup_job_and_candidate(db_session)
        admin = await _create_active_user(
            db_session, f"admin-collab-{uuid4().hex[:6]}@collab.example.com", "admin_pass", UserRole.ADMIN
        )
        await db_session.commit()

        admin_headers = await _auth_headers(client, admin.email, "admin_pass")
        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration",
            headers=admin_headers,
        )
        assert r.status_code == 200, f"Admin deve ter acesso irrestrito, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_different_manager_without_scorecard_gets_403(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Manager A não pode acessar colaboração de candidato atribuído ao Manager B."""
        job, candidate = await _setup_job_and_candidate(db_session)
        manager_a = await _create_manager(db_session, "_a_with_assign")
        manager_b = await _create_manager(db_session, "_b_without_assign")

        # Apenas manager_a tem scorecard
        await _assign_manager_scorecard(db_session, manager_a.id, candidate.id, job.id)
        await db_session.commit()

        headers_b = await _manager_headers(client, db_session, manager_b)
        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration",
            headers=headers_b,
        )
        assert r.status_code == 403, (
            f"Manager B sem atribuição deve receber 403, recebeu {r.status_code}"
        )

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_access_manager_collaboration(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        """Requisição sem token retorna 401."""
        job, candidate = await _setup_job_and_candidate(db_session)
        await db_session.commit()

        r = await client.get(
            f"/api/v1/manager/jobs/{job.id}/candidates/{candidate.id}/collaboration"
        )
        assert r.status_code == 401
