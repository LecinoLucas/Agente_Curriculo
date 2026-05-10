from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole

from .helpers import _auth_headers, _create_active_user


@pytest.mark.asyncio
async def test_request_analysis_returns_404_when_resume_version_does_not_exist(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"analysis-contract-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    response = await client.post(
        f"/api/v1/analyses?resume_version_id={uuid4()}&job_id={uuid4()}",
        headers=headers,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Versão de currículo não encontrada"
