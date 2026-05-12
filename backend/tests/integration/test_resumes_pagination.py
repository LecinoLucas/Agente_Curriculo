import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

@pytest.mark.asyncio
async def test_resumes_pagination_format(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """
    Ensure GET /api/v1/resumes returns a paginated structure and not a pure array.
    """
    email = f"recruiter-{uuid4().hex[:6]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")

    response = await client.get("/api/v1/resumes", headers=headers)
    assert response.status_code == 200

    data = response.json()
    
    # Must not be a pure list
    assert isinstance(data, dict), f"Expected dict, got {type(data)}. Payload: {data}"

    # Must contain pagination fields
    assert "data" in data
    assert "page" in data
    assert "page_size" in data
    assert "total" in data
    assert "total_pages" in data

    assert isinstance(data["data"], list)
    assert data["page"] == 1
    assert data["page_size"] == 20

