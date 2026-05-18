"""RBAC dos endpoints de /api/v1/skills (Fase 30D).

Regras de produto consolidadas após auditoria 30C:
- GET    /skills              → InternalUser  (todos roles internos consultam o catálogo)
- POST   /skills              → RecruiterOrAdmin (criar skill on-the-fly durante montagem de vaga)
- PATCH  /skills/{id}         → AdminOnly (admin é dono do catálogo global)
- PATCH  /skills/{id}/deactivate, /activate, /archive, /restore → AdminOnly
- DELETE /skills/{id}         → NÃO EXISTE. Soft delete via deactivate/archive.

Schema atual (skill_catalog_schemas.py):
- response.aliases é list[SkillAliasResponse] = lista de objetos {id, alias, normalized_alias}
- archive exige reason (min_length=1) → ausência vira 422
- duplicidade por name/normalized_name → 409 (validada em test_skill_catalog_api.py)
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _create_active_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _login_as(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    role: UserRole,
    email_prefix: str,
) -> dict[str, str]:
    email = f"{email_prefix}-{role.value}@test.com"
    await _create_active_user(db_session, email, "password123", role)
    return await _auth_headers(client, email, "password123")


async def _create_skill_as_admin(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    name: str,
    aliases: list[str] | None = None,
) -> dict:
    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix=f"admin-seed-{name}")
    response = await client.post(
        "/api/v1/skills",
        json={"name": name, "category": "programming_language", "aliases": aliases or []},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


# ── GET /skills — InternalUser (todos roles internos) ───────────────────────


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role",
    [UserRole.ADMIN, UserRole.RECRUITER, UserRole.VIEWER, UserRole.HR, UserRole.MANAGER],
)
async def test_internal_roles_can_list_skills(
    client: AsyncClient, db_session: AsyncSession, role: UserRole
):
    headers = await _login_as(client, db_session, role=role, email_prefix="list")
    response = await client.get("/api/v1/skills", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert "data" in body and "total" in body


@pytest.mark.asyncio
async def test_unauthenticated_cannot_list_skills(client: AsyncClient):
    response = await client.get("/api/v1/skills")
    assert response.status_code == 401


# ── POST /skills — RecruiterOrAdmin (fluxo on-the-fly em vaga) ──────────────


@pytest.mark.asyncio
async def test_admin_can_create_skill(client: AsyncClient, db_session: AsyncSession):
    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="post")
    response = await client.post(
        "/api/v1/skills",
        json={"name": "Python", "category": "programming_language", "aliases": ["py"]},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["normalized_name"] == "python"
    # aliases é lista de objetos {id, alias, normalized_alias}
    assert isinstance(body["aliases"], list)
    assert all(isinstance(a, dict) and "alias" in a for a in body["aliases"])
    assert [a["normalized_alias"] for a in body["aliases"]] == ["py"]


@pytest.mark.asyncio
async def test_recruiter_can_create_skill_for_job_flow(
    client: AsyncClient, db_session: AsyncSession
):
    """Recruiter precisa criar skill nova durante montagem de vaga (CreateSkillModal)."""
    headers = await _login_as(client, db_session, role=UserRole.RECRUITER, email_prefix="post")
    response = await client.post(
        "/api/v1/skills",
        json={"name": "FastAPI", "category": "framework"},
        headers=headers,
    )
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role", [UserRole.HR, UserRole.MANAGER, UserRole.VIEWER]
)
async def test_non_admin_non_recruiter_cannot_create_skill(
    client: AsyncClient, db_session: AsyncSession, role: UserRole
):
    headers = await _login_as(client, db_session, role=role, email_prefix="post")
    response = await client.post(
        "/api/v1/skills",
        json={"name": "Whatever", "category": "framework"},
        headers=headers,
    )
    assert response.status_code == 403


# ── PATCH /skills/{id} — AdminOnly (manutenção do catálogo global) ──────────


@pytest.mark.asyncio
async def test_admin_can_update_skill(client: AsyncClient, db_session: AsyncSession):
    created = await _create_skill_as_admin(client, db_session, name="Rust")

    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="upd")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}",
        json={"description": "systems language"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["description"] == "systems language"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "role", [UserRole.RECRUITER, UserRole.HR, UserRole.MANAGER, UserRole.VIEWER]
)
async def test_non_admin_cannot_update_skill(
    client: AsyncClient, db_session: AsyncSession, role: UserRole
):
    created = await _create_skill_as_admin(client, db_session, name=f"Skill-{role.value}")

    headers = await _login_as(client, db_session, role=role, email_prefix="upd")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}",
        json={"description": "tentativa indevida"},
        headers=headers,
    )
    assert response.status_code == 403


# ── PATCH /deactivate — AdminOnly ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_deactivate_skill(client: AsyncClient, db_session: AsyncSession):
    created = await _create_skill_as_admin(client, db_session, name="Deact")

    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="deact")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/deactivate", headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is False


@pytest.mark.asyncio
async def test_recruiter_cannot_deactivate_skill(
    client: AsyncClient, db_session: AsyncSession
):
    created = await _create_skill_as_admin(client, db_session, name="Deact-r")

    headers = await _login_as(client, db_session, role=UserRole.RECRUITER, email_prefix="deact")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/deactivate", headers=headers
    )
    assert response.status_code == 403


# ── PATCH /activate — AdminOnly ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_activate_skill(client: AsyncClient, db_session: AsyncSession):
    created = await _create_skill_as_admin(client, db_session, name="Act")
    admin_headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="act-pre")
    # Primeiro desativa para depois reativar
    deact = await client.patch(
        f"/api/v1/skills/{created['id']}/deactivate", headers=admin_headers
    )
    assert deact.status_code == 200

    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="act")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/activate", headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["is_active"] is True


@pytest.mark.asyncio
async def test_recruiter_cannot_activate_skill(
    client: AsyncClient, db_session: AsyncSession
):
    created = await _create_skill_as_admin(client, db_session, name="Act-r")

    headers = await _login_as(client, db_session, role=UserRole.RECRUITER, email_prefix="act")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/activate", headers=headers
    )
    assert response.status_code == 403


# ── PATCH /archive — AdminOnly + reason obrigatório ─────────────────────────


@pytest.mark.asyncio
async def test_admin_can_archive_skill_with_reason(
    client: AsyncClient, db_session: AsyncSession
):
    """Máquina de estados: desativar antes de arquivar (regra do service)."""
    created = await _create_skill_as_admin(client, db_session, name="Arch")

    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="arch")
    deact = await client.patch(
        f"/api/v1/skills/{created['id']}/deactivate", headers=headers
    )
    assert deact.status_code == 200, deact.text

    response = await client.patch(
        f"/api/v1/skills/{created['id']}/archive",
        json={"reason": "obsolete", "note": "Substituída por outra skill"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["archive_reason"] == "obsolete"


@pytest.mark.asyncio
async def test_archive_without_reason_returns_422(
    client: AsyncClient, db_session: AsyncSession
):
    """ArchiveSkillRequest.reason é obrigatório (min_length=1)."""
    created = await _create_skill_as_admin(client, db_session, name="Arch-noreason")

    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="arch-no")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/archive",
        json={},
        headers=headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_recruiter_cannot_archive_skill(
    client: AsyncClient, db_session: AsyncSession
):
    created = await _create_skill_as_admin(client, db_session, name="Arch-r")

    headers = await _login_as(client, db_session, role=UserRole.RECRUITER, email_prefix="arch")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/archive",
        json={"reason": "obsolete"},
        headers=headers,
    )
    assert response.status_code == 403


# ── PATCH /restore — AdminOnly ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_can_restore_skill(client: AsyncClient, db_session: AsyncSession):
    created = await _create_skill_as_admin(client, db_session, name="Restore")
    admin_headers = await _login_as(
        client, db_session, role=UserRole.ADMIN, email_prefix="restore-pre"
    )
    # Máquina de estados: deactivate → archive → restore
    deact = await client.patch(
        f"/api/v1/skills/{created['id']}/deactivate", headers=admin_headers
    )
    assert deact.status_code == 200
    arch = await client.patch(
        f"/api/v1/skills/{created['id']}/archive",
        json={"reason": "obsolete"},
        headers=admin_headers,
    )
    assert arch.status_code == 200, arch.text

    headers = await _login_as(client, db_session, role=UserRole.ADMIN, email_prefix="restore")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/restore", headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["archived_at"] is None


@pytest.mark.asyncio
async def test_recruiter_cannot_restore_skill(
    client: AsyncClient, db_session: AsyncSession
):
    created = await _create_skill_as_admin(client, db_session, name="Restore-r")

    headers = await _login_as(client, db_session, role=UserRole.RECRUITER, email_prefix="restore")
    response = await client.patch(
        f"/api/v1/skills/{created['id']}/restore", headers=headers
    )
    assert response.status_code == 403
