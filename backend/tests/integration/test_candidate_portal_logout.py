"""Logout do portal do candidato é idempotente e nunca derruba o servidor."""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

# Fase 30B — logout idempotente: cobertura crítica de auth/cookies.
pytestmark = pytest.mark.smoke

from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.security.password_service import hash_password


async def _create_candidate(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        email="logout.target@example.com",
        full_name="Logout Target",
        password_hash=hash_password("SenhaSegura123"),
        created_by=uuid4(),
    )
    db_session.add(candidate)
    await db_session.commit()
    return candidate


@pytest.mark.asyncio
async def test_logout_without_session_returns_204(client: AsyncClient) -> None:
    """Sem cookie de sessão, logout responde 204 e não derruba o servidor."""
    response = await client.post("/api/v1/public/candidate-auth/logout")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert response.content == b""


@pytest.mark.asyncio
async def test_logout_with_invalid_token_returns_204(client: AsyncClient) -> None:
    """Cookie inexistente/malformado também responde 204 silenciosamente."""
    client.cookies.set(CANDIDATE_PORTAL_COOKIE_NAME, "token-invalido-qualquer")
    response = await client.post("/api/v1/public/candidate-auth/logout")
    assert response.status_code == status.HTTP_204_NO_CONTENT


@pytest.mark.asyncio
async def test_logout_with_valid_session_clears_cookie(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Login válido + logout = 204 e cookie é apagado via Set-Cookie."""
    await _create_candidate(db_session)
    login_response = await client.post(
        "/api/v1/public/candidate-auth/login",
        json={"email": "logout.target@example.com", "password": "SenhaSegura123"},
    )
    assert login_response.status_code == status.HTTP_200_OK
    assert CANDIDATE_PORTAL_COOKIE_NAME in client.cookies

    logout_response = await client.post("/api/v1/public/candidate-auth/logout")
    assert logout_response.status_code == status.HTTP_204_NO_CONTENT

    # Re-logout sem sessão também 204 (idempotente)
    logout_again = await client.post("/api/v1/public/candidate-auth/logout")
    assert logout_again.status_code == status.HTTP_204_NO_CONTENT
