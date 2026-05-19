"""Integration tests for AI daily-limit override admin endpoints (P0.2C)."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_limit_override_service import (
    AILimitOverrideService,
)
from src.core.settings import settings
from src.domain.entities.user import UserRole

from .helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "ai-limit-admin@test.com", "password123", UserRole.ADMIN)
    return await _auth_headers(client, "ai-limit-admin@test.com", "password123")


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(
        db_session, "ai-limit-recruiter@test.com", "password123", UserRole.RECRUITER
    )
    return await _auth_headers(client, "ai-limit-recruiter@test.com", "password123")


def _future(seconds: int = 3600) -> str:
    return (datetime.now(UTC) + timedelta(seconds=seconds)).isoformat()


# ── RBAC ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_recruiter_cannot_create_override(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": 2000,
            "expires_at": _future(),
            "reason": "Pico de demanda",
        },
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_cannot_list_usage(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _recruiter_headers(client, db_session)
    r = await client.get("/api/v1/admin/ai-limits/usage", headers=headers)
    assert r.status_code == 403


# ── creation happy path ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_admin_creates_global_override(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 500,
            "expires_at": _future(),
            "reason": "Migração em massa autorizada pelo cliente",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["scope"] == "global"
    assert body["scope_id"] is None
    assert body["old_limit"] == settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL
    assert body["new_limit"] == settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 500
    assert body["revoked_at"] is None


@pytest.mark.asyncio
async def test_admin_creates_user_override(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    target = await _create_active_user(db_session, "target-user@test.com", "x", UserRole.RECRUITER)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "user",
            "scope_id": str(target.id),
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER + 100,
            "expires_at": _future(),
            "reason": "Aumento temporário aprovado pelo gestor",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["scope"] == "user"
    assert r.json()["scope_id"] == str(target.id)


# ── validation ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_empty_reason_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 100,
            "expires_at": _future(),
            "reason": "",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_past_expires_at_rejected(client: AsyncClient, db_session: AsyncSession) -> None:
    headers = await _admin_headers(client, db_session)
    past = (datetime.now(UTC) - timedelta(seconds=10)).isoformat()
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 100,
            "expires_at": past,
            "reason": "Janela passada",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_expires_at_beyond_max_days_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    too_far = (
        datetime.now(UTC) + timedelta(days=settings.AI_LIMIT_OVERRIDE_MAX_DAYS + 1)
    ).isoformat()
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 100,
            "expires_at": too_far,
            "reason": "Ultrapassa janela",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_user_scope_requires_scope_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "user",
            "scope_id": None,
            "new_limit": 999,
            "expires_at": _future(),
            "reason": "Sem scope_id",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_global_scope_rejects_scope_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": str(uuid4()),
            "new_limit": 999,
            "expires_at": _future(),
            "reason": "Global com scope_id",
        },
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_new_limit_must_be_greater_than_current(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    r = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL,
            "expires_at": _future(),
            "reason": "Mesmo limite",
        },
    )
    assert r.status_code == 422


# ── resolution priority ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_user_override_beats_job_and_global(
    db_session: AsyncSession,
) -> None:
    """Service-level: user override wins over job override which wins over global."""
    admin = await _create_active_user(db_session, "p-admin@test.com", "x", UserRole.ADMIN)
    user = await _create_active_user(db_session, "scoped@test.com", "x", UserRole.RECRUITER)
    job_id = uuid4()

    svc = AILimitOverrideService(db_session)
    expires = datetime.now(UTC) + timedelta(hours=1)

    from src.application.services.ai_limit_override_service import CreateOverrideCommand

    await svc.create_override(
        CreateOverrideCommand(
            scope="global",
            scope_id=None,
            new_limit=settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 1,
            expires_at=expires,
            reason="g",
            actor_id=admin.id,
        )
    )
    await svc.create_override(
        CreateOverrideCommand(
            scope="job",
            scope_id=job_id,
            new_limit=settings.AI_ANALYSIS_DAILY_LIMIT_PER_JOB + 2,
            expires_at=expires,
            reason="j",
            actor_id=admin.id,
        )
    )
    await svc.create_override(
        CreateOverrideCommand(
            scope="user",
            scope_id=user.id,
            new_limit=settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER + 3,
            expires_at=expires,
            reason="u",
            actor_id=admin.id,
        )
    )

    resolution = await svc.resolve_effective_limit(user_id=user.id, job_id=job_id)
    assert resolution["scope"] == "user"
    assert resolution["source"] == "override"
    assert resolution["limit"] == settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER + 3


@pytest.mark.asyncio
async def test_expired_override_is_ignored(db_session: AsyncSession) -> None:
    admin = await _create_active_user(db_session, "exp-admin@test.com", "x", UserRole.ADMIN)
    svc = AILimitOverrideService(db_session)

    # Insert directly with an expired timestamp (bypassing validation that
    # would reject expires_at in the past).
    from src.infrastructure.database.models.ai_daily_limit_override_model import (
        AIDailyLimitOverrideModel,
    )

    db_session.add(
        AIDailyLimitOverrideModel(
            scope="global",
            scope_id=None,
            limit_type="analysis_request",
            old_limit=settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL,
            new_limit=settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 99,
            reason="expired",
            expires_at=datetime.now(UTC) - timedelta(seconds=10),
            created_by=admin.id,
        )
    )
    await db_session.commit()

    resolution = await svc.resolve_effective_limit(user_id=None, job_id=None)
    assert resolution["source"] == "default"
    assert resolution["limit"] == settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL


@pytest.mark.asyncio
async def test_revoking_override_removes_effect(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    create = await client.post(
        "/api/v1/admin/ai-limits/overrides",
        headers=headers,
        json={
            "scope": "global",
            "scope_id": None,
            "new_limit": settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL + 50,
            "expires_at": _future(),
            "reason": "test revoke",
        },
    )
    override_id = create.json()["id"]

    revoke = await client.delete(
        f"/api/v1/admin/ai-limits/overrides/{override_id}", headers=headers
    )
    assert revoke.status_code == 200
    assert revoke.json()["revoked_at"] is not None

    usage = await client.get("/api/v1/admin/ai-limits/usage", headers=headers)
    body = usage.json()
    assert body["global_usage"]["limit_source"] == "default"
    assert body["global_usage"]["effective_limit"] == settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL


@pytest.mark.asyncio
async def test_default_used_when_no_override(db_session: AsyncSession) -> None:
    svc = AILimitOverrideService(db_session)
    resolution = await svc.resolve_effective_limit(user_id=uuid4(), job_id=None)
    assert resolution["source"] == "default"
    assert resolution["scope"] == "user"
    assert resolution["limit"] == settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER


# ── usage endpoint smoke ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_usage_endpoint_returns_defaults_when_empty(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    headers = await _admin_headers(client, db_session)
    r = await client.get("/api/v1/admin/ai-limits/usage", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["defaults"]["per_user"] == settings.AI_ANALYSIS_DAILY_LIMIT_PER_USER
    assert body["defaults"]["per_job"] == settings.AI_ANALYSIS_DAILY_LIMIT_PER_JOB
    assert body["defaults"]["global"] == settings.AI_ANALYSIS_DAILY_LIMIT_GLOBAL
    assert body["global_usage"]["used_today"] == 0
    assert body["active_overrides"] == []
