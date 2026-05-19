"""P0.6 — Google sign-in for staff users.

The Google identity verifier is patched per-test to return a fake identity;
that lets us exercise the domain rule, role assignment, and inactive-user
paths without hitting Google.
"""
from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.domain.entities.user import UserRole, UserStatus
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.security.google_identity_verifier import GoogleIdentity

from .helpers import _auth_headers, _create_active_user


def _fake_identity(
    email: str = "alice@redemarajo.com.br",
    *,
    name: str = "Alice Silva",
    email_verified: bool = True,
    sub: str = "google-sub-123",
) -> GoogleIdentity:
    return GoogleIdentity(
        sub=sub,
        email=email,
        email_verified=email_verified,
        name=name,
        picture=None,
    )


def _patch_verifier(monkeypatch: pytest.MonkeyPatch, identity: GoogleIdentity) -> None:
    async def _fake_verify(self, id_token: str) -> GoogleIdentity:  # noqa: ARG002
        return identity

    monkeypatch.setattr(
        "src.application.services.staff_google_auth_service.GoogleIdentityVerifier.verify",
        _fake_verify,
    )


# ── happy path: new user ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_creates_new_user_as_viewer(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_verifier(monkeypatch, _fake_identity("alice@redemarajo.com.br", name="Alice"))

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-1"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["must_change_password"] is False

    user = await db_session.scalar(
        sa.select(UserModel).where(UserModel.email == "alice@redemarajo.com.br")
    )
    assert user is not None
    assert user.role == "viewer"
    assert user.status == "active"
    assert user.full_name == "Alice"


# ── existing user: role preserved ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_preserves_existing_user_role(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _create_active_user(
        db_session, "admin.bob@redemarajo.com.br", "password123", UserRole.ADMIN
    )
    _patch_verifier(
        monkeypatch, _fake_identity("admin.bob@redemarajo.com.br", name="Bob Admin")
    )

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-2"})
    assert r.status_code == 200, r.text

    user = await db_session.scalar(
        sa.select(UserModel).where(UserModel.email == "admin.bob@redemarajo.com.br")
    )
    # Role must NOT be downgraded to viewer.
    assert user.role == "admin"


# ── domain rule ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_rejects_unauthorized_domain(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_verifier(monkeypatch, _fake_identity("intruder@gmail.com"))

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-3"})
    assert r.status_code == 403, r.text
    body = r.json()
    assert body["detail"]["code"] == "google_domain_not_allowed"
    assert "redemarajo.com.br" in body["detail"]["message"]

    # No user should have been created.
    user = await db_session.scalar(
        sa.select(UserModel).where(UserModel.email == "intruder@gmail.com")
    )
    assert user is None


# ── email_verified must be true ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_rejects_unverified_email(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_verifier(
        monkeypatch,
        _fake_identity("carol@redemarajo.com.br", email_verified=False),
    )

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-4"})
    assert r.status_code == 401, r.text
    assert r.json()["detail"]["code"] == "google_email_not_verified"


# ── inactive user blocked ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_blocks_inactive_user(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await _create_active_user(
        db_session, "ex.dan@redemarajo.com.br", "password123", UserRole.RECRUITER
    )
    # Force inactive
    db_user = await db_session.scalar(
        sa.select(UserModel).where(UserModel.id == user.id)
    )
    db_user.status = UserStatus.INACTIVE.value
    await db_session.commit()

    _patch_verifier(monkeypatch, _fake_identity("ex.dan@redemarajo.com.br"))

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-5"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "user_inactive"


# ── disabled by settings ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_returns_503_when_disabled(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "GOOGLE_LOGIN_ENABLED", False)
    # verifier won't even be called; no need to patch.
    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-6"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "google_login_disabled"


# ── token validation failure ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_returns_401_when_token_invalid(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _raises(self, id_token: str):  # noqa: ARG001
        from src.infrastructure.security.google_identity_verifier import (
            GoogleIdentityVerificationError,
        )
        raise GoogleIdentityVerificationError("Token do Google inválido ou expirado.")

    monkeypatch.setattr(
        "src.application.services.staff_google_auth_service.GoogleIdentityVerifier.verify",
        _raises,
    )

    r = await client.post("/api/v1/auth/google", json={"id_token": "definitely-bad"})
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "google_token_invalid"


# ── case-insensitive domain match ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_callback_accepts_case_variant_email(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_verifier(monkeypatch, _fake_identity("Erika@REDEMARAJO.com.br"))

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-7"})
    assert r.status_code == 200, r.text


# ── VIEWER cannot mutate (RBAC) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_new_google_viewer_cannot_create_job(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A user created via Google sign-in lands on VIEWER role and must be
    rejected when calling staff-only mutation endpoints (POST /jobs)."""
    _patch_verifier(monkeypatch, _fake_identity("viewer.test@redemarajo.com.br"))
    auth = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-rbac"})
    assert auth.status_code == 200
    token = auth.json()["access_token"]

    r = await client.post(
        "/api/v1/jobs",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Test Job", "description": "x", "status": "draft"},
    )
    assert r.status_code == 403, r.text


# ── existing user keeps full_name (does not overwrite from Google) ──────────


@pytest.mark.asyncio
async def test_google_callback_does_not_overwrite_existing_name(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    existing = await _create_active_user(
        db_session, "fred@redemarajo.com.br", "password123", UserRole.RECRUITER
    )
    _patch_verifier(monkeypatch, _fake_identity("fred@redemarajo.com.br", name="New Name"))

    r = await client.post("/api/v1/auth/google", json={"id_token": "fake-token-8"})
    assert r.status_code == 200

    user = await db_session.scalar(sa.select(UserModel).where(UserModel.id == existing.id))
    # We only set name for newly-created users; existing accounts keep their data.
    assert user.full_name != "New Name"
