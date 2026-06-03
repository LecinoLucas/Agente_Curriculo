"""CANDIDATE-AUTH-FIX — regression coverage for the candidate-portal login → /me flow.

These tests pin the exact contract the candidate-portal frontend relies on:
- POST /public/auth/login (the alias the frontend calls) sets the session cookie.
- GET /public/candidate-portal/me and /me/applications authenticate via that cookie.
- Missing/invalid cookies stay 401 (auth is never bypassed).

The httpx test client keeps a cookie jar across requests, mirroring the browser.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.security.password_service import hash_password

pytestmark = pytest.mark.asyncio

_EMAIL = "area.candidato@example.com"
_PASSWORD = "SenhaSegura123"


async def _create_candidate_with_password(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        email=_EMAIL,
        full_name="Área Candidato",
        password_hash=hash_password(_PASSWORD),
        created_by=uuid4(),
    )
    db_session.add(candidate)
    await db_session.commit()
    return candidate


async def _login(client: AsyncClient, email: str = _EMAIL, password: str = _PASSWORD):
    return await client.post(
        "/api/v1/public/auth/login",
        json={"email": email, "password": password},
    )


async def test_valid_login_sets_cookie_and_me_returns_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_candidate_with_password(db_session)

    login = await _login(client)
    assert login.status_code == status.HTTP_200_OK
    assert CANDIDATE_PORTAL_COOKIE_NAME in client.cookies

    me = await client.get("/api/v1/public/candidate-portal/me")
    assert me.status_code == status.HTTP_200_OK
    body = me.json()
    assert body["email"] == _EMAIL
    assert body["full_name"] == "Área Candidato"

    apps = await client.get("/api/v1/public/candidate-portal/me/applications")
    assert apps.status_code == status.HTTP_200_OK
    assert apps.json() == []


async def test_invalid_login_returns_401_and_no_cookie(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_candidate_with_password(db_session)

    login = await _login(client, password="senhaErrada")
    assert login.status_code == status.HTTP_401_UNAUTHORIZED
    assert CANDIDATE_PORTAL_COOKIE_NAME not in client.cookies


async def test_me_without_cookie_returns_401(client: AsyncClient):
    response = await client.get("/api/v1/public/candidate-portal/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


async def test_me_with_invalid_token_returns_401(client: AsyncClient):
    client.cookies.set(CANDIDATE_PORTAL_COOKIE_NAME, "token-invalido-que-nao-existe")
    response = await client.get("/api/v1/public/candidate-portal/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


async def test_me_applications_without_cookie_returns_401(client: AsyncClient):
    response = await client.get("/api/v1/public/candidate-portal/me/applications")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
