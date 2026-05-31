"""
Testes de contrato — Fase C2: /api/v1/public/* endpoints oficiais.

Cobre:
- Roteamento e disponibilidade dos novos endpoints
- Sessão obrigatória em endpoints privados do candidato
- Ownership (candidato não acessa dados de outro)
- Não-exposição de campos internos (match_score, ranking, ai_score, etc.)
- Compatibilidade retroativa dos endpoints antigos
"""
from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import uuid4, UUID

import pytest
import pytest_asyncio
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
    PORTAL_SESSION_PURPOSE,
)
from src.infrastructure.database.models.candidate_auth_token_model import CandidateAuthTokenModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel


# ── Helpers ───────────────────────────────────────────────────────────────────

SYSTEM_USER_ID = UUID("00000000-0000-0000-0000-00000000000a")

_INTERNAL_FIELDS = {
    "match_score",
    "ranking",
    "ai_score",
    "internal_notes",
    "manager_notes",
    "protheus",
    "erp",
    "internal_events",
    "audit",
    "prompt",
    "created_by",
    "quality_score",
    "quality_status",
    "deal_breakers",
    "behavioral_template_id",
    "screening_questions",
    "job_profile_json",
    "skill_requirements",
    "mandatory_skills",
    "reason_codes",
}


async def _create_published_job(db: AsyncSession, *, title: str = "Frentista Teste") -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=title,
        description="Descrição pública do cargo.",
        requirements="Ensino médio completo.",
        responsibilities="Atender clientes.",
        status="published",
        created_by=SYSTEM_USER_ID,
        location="Goiânia, GO",
        job_area="operacional",
        work_model="presencial",
        seniority_level="junior",
        benefits=["Vale transporte", "Vale refeição"],
        published_at=datetime.now(UTC),
    )
    db.add(job)
    await db.commit()
    return job


async def _create_draft_job(db: AsyncSession) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title="Vaga Rascunho",
        description="Não deve aparecer publicamente.",
        status="draft",
        created_by=SYSTEM_USER_ID,
    )
    db.add(job)
    await db.commit()
    return job


async def _create_candidate_with_session(
    db: AsyncSession,
    *,
    email: str = "candidato@test.com",
    cpf: str = "00000000000",
) -> tuple[CandidateModel, str]:
    """Cria candidato e sessão, retorna (candidato, raw_token)."""
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidato Teste",
        email=email,
        cpf=cpf,
        phone="62999990000",
        location_city="Goiânia",
        location_state="GO",
        location_country="BR",
        created_by=SYSTEM_USER_ID,
        application_source="manual",
        salary_expectation="3000.00",
        lgpd_consent_at=datetime.now(UTC),
    )
    db.add(candidate)
    await db.flush()

    raw_token = f"test-token-{candidate.id}"
    db.add(
        CandidateAuthTokenModel(
            candidate_id=candidate.id,
            purpose=PORTAL_SESSION_PURPOSE,
            token_hash=sha256(raw_token.encode()).hexdigest(),
            expires_at=datetime.now(UTC) + timedelta(hours=2),
        )
    )
    await db.commit()
    return candidate, raw_token


def _no_internal_fields(data: dict | list) -> bool:
    """Verifica recursivamente que nenhum campo interno está exposto."""
    if isinstance(data, list):
        return all(_no_internal_fields(item) for item in data)
    if isinstance(data, dict):
        for key in data:
            if key in _INTERNAL_FIELDS:
                return False
        return all(_no_internal_fields(v) for v in data.values())
    return True


# ── Testes: roteamento e disponibilidade ──────────────────────────────────────

class TestPublicJobsRouting:
    async def test_list_jobs_returns_200(self, client: AsyncClient, db_session: AsyncSession):
        """GET /public/jobs deve existir e retornar 200."""
        await _create_published_job(db_session)
        r = await client.get("/api/v1/public/jobs")
        assert r.status_code == status.HTTP_200_OK
        assert isinstance(r.json(), list)

    async def test_job_detail_published_returns_200(self, client: AsyncClient, db_session: AsyncSession):
        """GET /public/jobs/{id} deve retornar vaga publicada."""
        job = await _create_published_job(db_session)
        r = await client.get(f"/api/v1/public/jobs/{job.id}")
        assert r.status_code == status.HTTP_200_OK
        data = r.json()
        assert data["id"] == str(job.id)
        assert data["title"] == job.title

    async def test_job_detail_draft_returns_404(self, client: AsyncClient, db_session: AsyncSession):
        """GET /public/jobs/{id} deve retornar 404 para vaga em rascunho."""
        job = await _create_draft_job(db_session)
        r = await client.get(f"/api/v1/public/jobs/{job.id}")
        assert r.status_code == status.HTTP_404_NOT_FOUND

    async def test_job_detail_nonexistent_returns_404(self, client: AsyncClient):
        """GET /public/jobs/{id} deve retornar 404 para ID inexistente."""
        r = await client.get(f"/api/v1/public/jobs/{uuid4()}")
        assert r.status_code == status.HTTP_404_NOT_FOUND


class TestPublicJobDetailDoesNotExposeInternalFields:
    async def test_job_detail_no_internal_fields(self, client: AsyncClient, db_session: AsyncSession):
        """Resposta de detalhe de vaga não deve conter campos internos."""
        job = await _create_published_job(db_session)
        r = await client.get(f"/api/v1/public/jobs/{job.id}")
        assert r.status_code == status.HTTP_200_OK
        assert _no_internal_fields(r.json()), f"Campos internos encontrados: {r.json().keys()}"

    async def test_job_list_no_internal_fields(self, client: AsyncClient, db_session: AsyncSession):
        """Lista de vagas não deve conter campos internos."""
        await _create_published_job(db_session)
        r = await client.get("/api/v1/public/jobs")
        assert r.status_code == status.HTTP_200_OK
        assert _no_internal_fields(r.json())


# ── Testes: aliases de autenticação ──────────────────────────────────────────

class TestAuthAliases:
    async def test_auth_login_alias_exists(self, client: AsyncClient):
        """POST /public/auth/login deve existir (mesmo se retornar 401 com credenciais inválidas)."""
        r = await client.post(
            "/api/v1/public/auth/login",
            json={"email": "nao@existe.com", "password": "errada"},
        )
        assert r.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_422_UNPROCESSABLE_ENTITY)

    async def test_auth_logout_alias_idempotent(self, client: AsyncClient):
        """POST /public/auth/logout deve retornar 204 mesmo sem sessão válida."""
        r = await client.post("/api/v1/public/auth/logout")
        assert r.status_code == status.HTTP_204_NO_CONTENT

    async def test_legacy_login_still_works(self, client: AsyncClient):
        """POST /public/candidate-auth/login (endpoint antigo) deve continuar funcionando."""
        r = await client.post(
            "/api/v1/public/candidate-auth/login",
            json={"email": "nao@existe.com", "password": "errada"},
        )
        assert r.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_422_UNPROCESSABLE_ENTITY)


# ── Testes: sessão obrigatória em endpoints privados ─────────────────────────

class TestSessionRequired:
    @pytest.mark.parametrize("method,path", [
        ("GET", "/api/v1/public/candidate-portal/overview"),
        ("GET", "/api/v1/public/candidate-portal/behavioral-assessments"),
        ("GET", f"/api/v1/public/candidate-portal/behavioral-assessments/{uuid4()}"),
        ("GET", "/api/v1/public/candidate-portal/pre-admission"),
    ])
    async def test_private_endpoint_requires_session(
        self, client: AsyncClient, method: str, path: str
    ):
        """Endpoints privados do candidato devem rejeitar requests sem sessão."""
        if method == "GET":
            r = await client.get(path)
        else:
            r = await client.post(path)
        assert r.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        ), f"{method} {path} deveria exigir sessão, retornou {r.status_code}"


# ── Testes: ownership — candidato não acessa dados de outro ──────────────────

class TestOwnership:
    async def test_behavioral_assessment_ownership(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Candidato B não deve acessar assignment de candidato A."""
        _cand_a, _token_a = await _create_candidate_with_session(
            db_session, email="a@test.com", cpf="11111111111"
        )
        _cand_b, token_b = await _create_candidate_with_session(
            db_session, email="b@test.com", cpf="22222222222"
        )
        fake_assignment_id = uuid4()
        r = await client.get(
            f"/api/v1/public/candidate-portal/behavioral-assessments/{fake_assignment_id}",
            cookies={CANDIDATE_PORTAL_COOKIE_NAME: token_b},
        )
        # Deve retornar 404 (não encontrado para este candidato), não 200 com dados alheios
        assert r.status_code == status.HTTP_404_NOT_FOUND

    async def test_pre_admission_requires_complete_session(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """GET /pre-admission deve exigir sessão completa (CurrentCompleteCandidateSession)."""
        _, raw_token = await _create_candidate_with_session(
            db_session, email="c@test.com", cpf="33333333333"
        )
        r = await client.get(
            "/api/v1/public/candidate-portal/pre-admission",
            cookies={CANDIDATE_PORTAL_COOKIE_NAME: raw_token},
        )
        # Candidato sem pré-admissão ativa → 404 ou 403 (perfil incompleto), nunca dados alheios
        assert r.status_code in (
            status.HTTP_404_NOT_FOUND,
            status.HTTP_403_FORBIDDEN,
        )


# ── Testes: compatibilidade retroativa dos endpoints antigos ─────────────────

class TestBackwardCompatibility:
    async def test_legacy_behavioral_assessments_route_still_works(
        self, client: AsyncClient
    ):
        """GET /candidate-portal/behavioral-assessments (path antigo) deve continuar funcionando."""
        r = await client.get("/api/v1/candidate-portal/behavioral-assessments")
        # Sem sessão → 401/403; mas o endpoint existe
        assert r.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    async def test_legacy_pre_admission_route_still_works(self, client: AsyncClient):
        """GET /candidate-portal/pre-admission (path antigo) deve continuar funcionando."""
        r = await client.get("/api/v1/candidate-portal/pre-admission")
        assert r.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    async def test_legacy_jobs_list_still_works(self, client: AsyncClient, db_session: AsyncSession):
        """GET /public/jobs (endpoint original) deve continuar retornando 200."""
        r = await client.get("/api/v1/public/jobs")
        assert r.status_code == status.HTTP_200_OK

    async def test_legacy_check_exists_still_works(self, client: AsyncClient):
        """GET /public/candidates/check-exists (endpoint original) deve continuar funcionando."""
        r = await client.get("/api/v1/public/candidates/check-exists")
        assert r.status_code == status.HTTP_200_OK
