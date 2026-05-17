"""
Testes de segurança RBAC: endpoints de análise.

Cobre achados R-H2, R-M1 e R-M3 da auditoria de segurança Fase 1.
- POST /analyses → deve exigir RecruiterOrAdmin
- GET /analyses/{id}/result → deve exigir RecruiterOrAdmin
- POST /analyses/stuck → deve exigir AdminOnly
"""
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from tests.integration.helpers import _create_active_user, _auth_headers, _seed_scoring_case


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _login(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    return await _auth_headers(client, email, password)


async def _setup_user(
    db_session: AsyncSession,
    client: AsyncClient,
    role: UserRole,
    suffix: str = "",
) -> dict[str, str]:
    email = f"{role.value}{suffix}@rbac.example.com"
    password = "rbac_password123"
    await _create_active_user(db_session, email, password, role)
    return await _login(client, email, password)


# ── R-H2: POST /analyses must require RecruiterOrAdmin ───────────────────────


class TestRequestAnalysisRBAC:
    """POST /analyses deve ser restrito a RECRUITER e ADMIN."""

    @pytest.mark.asyncio
    async def test_admin_can_request_analysis(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.ADMIN, "_ra1")
        job_id, candidate_id, _ = await _seed_scoring_case(db_session, uuid4())
        r = await client.post(
            f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={job_id}",
            headers=headers,
        )
        # 404 (resume não existe) é ok — prova que passou no RBAC
        assert r.status_code in (202, 404, 409, 422), f"Esperado 202/404/409/422, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_recruiter_can_request_analysis(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.RECRUITER, "_ra2")
        r = await client.post(
            f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
            headers=headers,
        )
        assert r.status_code in (202, 404, 409, 422)

    @pytest.mark.asyncio
    async def test_viewer_cannot_request_analysis(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.VIEWER, "_ra3")
        r = await client.post(
            f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
            headers=headers,
        )
        assert r.status_code == 403, f"VIEWER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_manager_cannot_request_analysis(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.MANAGER, "_ra4")
        r = await client.post(
            f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
            headers=headers,
        )
        assert r.status_code == 403, f"MANAGER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_hr_cannot_request_analysis(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.HR, "_ra5")
        r = await client.post(
            f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
            headers=headers,
        )
        assert r.status_code == 403, f"HR deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_request_analysis(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        r = await client.post(
            f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
        )
        assert r.status_code == 401


# ── R-M1: GET /analyses/{id}/result must require RecruiterOrAdmin ─────────────


class TestGetAnalysisResultRBAC:
    """GET /analyses/{id}/result deve ser restrito a RECRUITER e ADMIN."""

    @pytest.mark.asyncio
    async def test_admin_can_get_analysis_result(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.ADMIN, "_gr1")
        r = await client.get(
            f"/api/v1/analyses/{uuid4()}/result",
            headers=headers,
        )
        # 404 (analysis não existe) é ok — prova que passou no RBAC
        assert r.status_code in (200, 404, 409), f"Esperado 200/404/409, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_recruiter_can_get_analysis_result(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.RECRUITER, "_gr2")
        r = await client.get(
            f"/api/v1/analyses/{uuid4()}/result",
            headers=headers,
        )
        assert r.status_code in (200, 404, 409)

    @pytest.mark.asyncio
    async def test_viewer_cannot_get_analysis_result(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.VIEWER, "_gr3")
        r = await client.get(
            f"/api/v1/analyses/{uuid4()}/result",
            headers=headers,
        )
        assert r.status_code == 403, f"VIEWER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_manager_cannot_get_analysis_result(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.MANAGER, "_gr4")
        r = await client.get(
            f"/api/v1/analyses/{uuid4()}/result",
            headers=headers,
        )
        assert r.status_code == 403, f"MANAGER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_get_analysis_result(
        self, client: AsyncClient
    ) -> None:
        r = await client.get(f"/api/v1/analyses/{uuid4()}/result")
        assert r.status_code == 401


# ── R-M3: POST /analyses/stuck must require AdminOnly ────────────────────────


class TestMarkStuckAnalysesRBAC:
    """POST /analyses/stuck deve ser restrito apenas ao ADMIN."""

    @pytest.mark.asyncio
    async def test_admin_can_call_stuck(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.ADMIN, "_st1")
        r = await client.post("/api/v1/analyses/stuck", headers=headers)
        assert r.status_code in (200, 500), f"ADMIN deve passar no RBAC, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_recruiter_cannot_call_stuck(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.RECRUITER, "_st2")
        r = await client.post("/api/v1/analyses/stuck", headers=headers)
        assert r.status_code == 403, f"RECRUITER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_viewer_cannot_call_stuck(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.VIEWER, "_st3")
        r = await client.post("/api/v1/analyses/stuck", headers=headers)
        assert r.status_code == 403, f"VIEWER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_manager_cannot_call_stuck(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.MANAGER, "_st4")
        r = await client.post("/api/v1/analyses/stuck", headers=headers)
        assert r.status_code == 403, f"MANAGER deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_hr_cannot_call_stuck(
        self, client: AsyncClient, db_session: AsyncSession
    ) -> None:
        headers = await _setup_user(db_session, client, UserRole.HR, "_st5")
        r = await client.post("/api/v1/analyses/stuck", headers=headers)
        assert r.status_code == 403, f"HR deve receber 403, recebeu {r.status_code}"

    @pytest.mark.asyncio
    async def test_unauthenticated_cannot_call_stuck(
        self, client: AsyncClient
    ) -> None:
        r = await client.post("/api/v1/analyses/stuck")
        assert r.status_code == 401
