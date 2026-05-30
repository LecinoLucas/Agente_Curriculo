"""
Integration tests for:
  POST /api/v1/candidaturas/manual
  POST /api/v1/candidaturas/import
"""
from __future__ import annotations

import io
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.helpers import _create_active_user, _auth_headers
from src.domain.entities.user import UserRole


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
async def admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"admin_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.ADMIN)
    return await _auth_headers(client, email, "secret123")


@pytest.fixture
async def hr_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"hr_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.HR)
    return await _auth_headers(client, email, "secret123")


@pytest.fixture
async def recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"recruiter_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.RECRUITER)
    return await _auth_headers(client, email, "secret123")


@pytest.fixture
async def viewer_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"viewer_{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "secret123", UserRole.VIEWER)
    return await _auth_headers(client, email, "secret123")


def _csv(rows: list[str]) -> bytes:
    header = "nome,email,telefone,vaga,observacao\n"
    return (header + "\n".join(rows)).encode("utf-8")


def _csv_file(content: bytes, name: str = "candidatos.csv") -> tuple:
    return ("file", (name, io.BytesIO(content), "text/csv"))


# ── Manual endpoint ───────────────────────────────────────────────────────────


async def test_manual_admin_creates_candidate(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Ana Teste", "email": "ana_manual@test.com"},
        headers=admin_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["full_name"] == "Ana Teste"
    assert body["email"] == "ana_manual@test.com"
    assert body["job_linked"] is False


async def test_manual_hr_creates_candidate(
    client: AsyncClient, hr_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Carlos RH", "phone": "11999990002"},
        headers=hr_headers,
    )
    assert resp.status_code == 201


async def test_manual_recruiter_creates_candidate(
    client: AsyncClient, recruiter_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Maria Rec", "email": "maria_rec@test.com"},
        headers=recruiter_headers,
    )
    assert resp.status_code == 201


async def test_manual_viewer_gets_403(
    client: AsyncClient, viewer_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Bloqueado", "email": "blocked@test.com"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


async def test_manual_invalid_missing_contact_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Sem Contato"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_manual_missing_name_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={"email": "namedless@test.com"},
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_manual_duplicate_email_returns_duplicate_warning(
    client: AsyncClient, admin_headers: dict
) -> None:
    email = f"dup_{uuid4().hex[:6]}@test.com"
    # Cria a primeira vez
    r1 = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Primeiro", "email": email},
        headers=admin_headers,
    )
    assert r1.status_code == 201

    # Tenta criar novamente com o mesmo email
    r2 = await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Segundo", "email": email},
        headers=admin_headers,
    )
    assert r2.status_code == 201
    body = r2.json()
    assert body["duplicate_warning"] is not None
    assert "já existe" in body["duplicate_warning"].lower()


async def test_manual_with_job_id_invalid_returns_404(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={
            "full_name": "Com Vaga",
            "email": f"comvaga_{uuid4().hex[:6]}@test.com",
            "job_id": str(uuid4()),
        },
        headers=admin_headers,
    )
    assert resp.status_code == 404


async def test_manual_with_job_id_published_links(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict,
    published_job,
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/manual",
        json={
            "full_name": "Vinculado",
            "email": f"vinculado_{uuid4().hex[:6]}@test.com",
            "job_id": str(published_job.id),
        },
        headers=admin_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["job_linked"] is True
    assert body["job_id"] == str(published_job.id)


# ── Import endpoint ───────────────────────────────────────────────────────────


async def test_import_valid_csv_creates_candidates(
    client: AsyncClient, admin_headers: dict
) -> None:
    u1 = uuid4().hex[:8]
    u2 = uuid4().hex[:8]
    content = _csv([
        f"João {u1},{u1}@test.com,,()",
        f"Maria {u2},{u2}@test.com,,",
    ])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 2
    assert body["duplicates"] == 0
    assert body["errors"] == []


async def test_import_viewer_gets_403(
    client: AsyncClient, viewer_headers: dict
) -> None:
    content = _csv(["João Test,joao_viewer@test.com,,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=viewer_headers,
    )
    assert resp.status_code == 403


async def test_import_empty_file_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(b"")],
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_import_invalid_format_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[("file", ("test.txt", io.BytesIO(b"hello"), "text/plain"))],
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_import_csv_with_invalid_email_reports_per_row_error(
    client: AsyncClient, admin_headers: dict
) -> None:
    u = uuid4().hex[:8]
    content = _csv([
        f"Válido {u},{u}@test.com,,",
        "Inválido,not-an-email,,",
    ])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1
    assert len(body["errors"]) == 1
    assert body["errors"][0]["row"] == 3


async def test_import_duplicate_email_reports_duplicate(
    client: AsyncClient, admin_headers: dict
) -> None:
    email = f"dup_import_{uuid4().hex[:6]}@test.com"
    # Cria o candidato previamente
    await client.post(
        "/api/v1/candidaturas/manual",
        json={"full_name": "Pré-existente", "email": email},
        headers=admin_headers,
    )

    content = _csv([f"Duplicado,{email},,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["duplicates"] == 1
    assert body["created"] == 0


async def test_import_row_without_contact_reports_error(
    client: AsyncClient, admin_headers: dict
) -> None:
    content = _csv(["Sem Contato,,,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 0
    assert len(body["errors"]) == 1


async def test_import_missing_required_column_returns_422(
    client: AsyncClient, admin_headers: dict
) -> None:
    # CSV sem coluna 'nome'
    content = b"email,telefone\ntest@test.com,11999\n"
    resp = await client.post(
        "/api/v1/candidaturas/import",
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 422
    assert "nome" in resp.json()["detail"].lower()


async def test_import_with_valid_job_links_candidates(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict,
    published_job,
) -> None:
    u = uuid4().hex[:8]
    content = _csv([f"Com Vaga {u},{u}@test.com,,"])
    resp = await client.post(
        "/api/v1/candidaturas/import",
        data={"default_job_id": str(published_job.id)},
        files=[_csv_file(content)],
        headers=admin_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 1
    assert body["linked"] == 1
