import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _get_recruiter_headers(
    client: AsyncClient,
    db_session: AsyncSession,
) -> dict[str, str]:
    email = f"recruiter-candidate-archive-{uuid4().hex[:8]}@test.com"
    await _create_active_user(
        db_session,
        email,
        "password123",
        UserRole.RECRUITER,
    )
    return await _auth_headers(
        client,
        email,
        "password123",
    )


async def test_archive_restore_candidate_and_filter_listings(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _get_recruiter_headers(client, db_session)

    created = await client.post(
        "/api/v1/candidates",
        json={
            "full_name": "Candidate Archive Flow",
            "email": "candidate-archive-flow@test.com",
        },
        headers=headers,
    )
    assert created.status_code == 201
    candidate_id = created.json()["id"]

    archive_response = await client.patch(
        f"/api/v1/candidates/{candidate_id}/archive",
        json={"reason": "data_cleanup", "note": "Validacao de arquivamento"},
        headers=headers,
    )
    assert archive_response.status_code == 200
    archived = archive_response.json()
    assert archived["archived_at"] is not None
    assert archived["archive_reason"] == "data_cleanup"
    assert archived["archive_reason_note"] == "Validacao de arquivamento"

    active_list = await client.get("/api/v1/candidates?page=1&page_size=20", headers=headers)
    assert active_list.status_code == 200
    active_ids = {item["id"] for item in active_list.json()["data"]}
    assert candidate_id not in active_ids

    archived_list = await client.get(
        "/api/v1/candidates?page=1&page_size=20&archived=true",
        headers=headers,
    )
    assert archived_list.status_code == 200
    archived_ids = {item["id"] for item in archived_list.json()["data"]}
    assert candidate_id in archived_ids

    archived_summaries = await client.get(
        "/api/v1/candidates/summaries?page=1&page_size=20&archived=true",
        headers=headers,
    )
    assert archived_summaries.status_code == 200
    archived_summary_ids = {item["id"] for item in archived_summaries.json()["data"]}
    assert candidate_id in archived_summary_ids

    restore_response = await client.patch(
        f"/api/v1/candidates/{candidate_id}/restore",
        headers=headers,
    )
    assert restore_response.status_code == 200
    restored = restore_response.json()
    assert restored["archived_at"] is None
    assert restored["archive_reason"] is None
    assert restored["archive_reason_note"] is None

    restored_active_list = await client.get(
        "/api/v1/candidates?page=1&page_size=20",
        headers=headers,
    )
    restored_active_ids = {item["id"] for item in restored_active_list.json()["data"]}
    assert candidate_id in restored_active_ids


async def test_archive_candidate_requires_reason(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _get_recruiter_headers(client, db_session)

    created = await client.post(
        "/api/v1/candidates",
        json={
            "full_name": "Candidate Without Archive Reason",
            "email": "candidate-archive-reason@test.com",
        },
        headers=headers,
    )
    assert created.status_code == 201
    candidate_id = created.json()["id"]

    response = await client.patch(
        f"/api/v1/candidates/{candidate_id}/archive",
        json={"reason": " "},
        headers=headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Informe o motivo do arquivamento."
