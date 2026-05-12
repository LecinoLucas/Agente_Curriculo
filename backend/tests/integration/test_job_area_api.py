import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.job_area_model import JobAreaModel
from src.infrastructure.database.models.job_model import JobModel
from tests.integration.helpers import _create_active_user, _auth_headers

pytestmark = pytest.mark.asyncio

async def _get_admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(
        db_session,
        "admin-area@test.com",
        "password123",
        UserRole.ADMIN,
    )
    return await _auth_headers(client, "admin-area@test.com", "password123")

async def test_create_area_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    response = await client.post(
        "/api/v1/job-areas",
        json={
            "name": "Tecnologia",
            "description": "Área de tecnologia"
        },
        headers=headers
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Tecnologia"
    assert data["normalized_name"] == "tecnologia"

async def test_create_area_duplicate_returns_409(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    # Create first
    await client.post(
        "/api/v1/job-areas",
        json={"name": "Tecnologia"},
        headers=headers
    )
    
    # Try duplicate
    response = await client.post(
        "/api/v1/job-areas",
        json={"name": "Tecnologia"},
        headers=headers
    )
    assert response.status_code == 409

async def test_list_areas(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    # Create some areas
    await client.post("/api/v1/job-areas", json={"name": "Tecnologia"}, headers=headers)
    await client.post("/api/v1/job-areas", json={"name": "Financeiro"}, headers=headers)
    
    response = await client.get("/api/v1/job-areas", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 2
    assert len(data["data"]) >= 2

async def test_search_area_by_name(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    await client.post("/api/v1/job-areas", json={"name": "Tecnologia"}, headers=headers)
    await client.post("/api/v1/job-areas", json={"name": "Financeiro"}, headers=headers)
    
    response = await client.get("/api/v1/job-areas?search=Tecno", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["data"][0]["name"] == "Tecnologia"

async def test_deactivate_area(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    resp = await client.post("/api/v1/job-areas", json={"name": "Tecnologia"}, headers=headers)
    area_id = resp.json()["id"]
    
    response = await client.patch(f"/api/v1/job-areas/{area_id}/deactivate", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False

async def test_activate_area(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    resp = await client.post("/api/v1/job-areas", json={"name": "Tecnologia"}, headers=headers)
    area_id = resp.json()["id"]
    
    # Deactivate first
    await client.patch(f"/api/v1/job-areas/{area_id}/deactivate", headers=headers)
    
    # Activate
    response = await client.patch(f"/api/v1/job-areas/{area_id}/activate", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is True

async def test_delete_area_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    resp = await client.post("/api/v1/job-areas", json={"name": "Financeiro"}, headers=headers)
    area_id = resp.json()["id"]
    
    response = await client.delete(f"/api/v1/job-areas/{area_id}", headers=headers)
    assert response.status_code == 204
    
    list_resp = await client.get("/api/v1/job-areas", headers=headers)
    data = list_resp.json()["data"]
    assert not any(area["id"] == area_id for area in data)

async def test_delete_area_nonexistent_returns_404(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    import uuid
    fake_id = uuid.uuid4()
    response = await client.delete(f"/api/v1/job-areas/{fake_id}", headers=headers)
    assert response.status_code == 404

async def test_delete_area_in_use_returns_409(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    await client.post("/api/v1/job-areas", json={"name": "Tecnologia"}, headers=headers)
    
    result = await db_session.execute(sa.text("SELECT id FROM users WHERE email = 'admin-area@test.com'"))
    user_id = result.scalar()
    import uuid
    user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    
    job = JobModel(
        title="Vaga Teste",
        description="Desc",
        status="draft",
        created_by=user_uuid,
        job_area="Tecnologia"
    )
    db_session.add(job)
    await db_session.commit()
    
    area_resp = await client.get("/api/v1/job-areas?search=Tecnologia", headers=headers)
    area_id = area_resp.json()["data"][0]["id"]
    
    response = await client.delete(f"/api/v1/job-areas/{area_id}", headers=headers)
    assert response.status_code == 409
    assert "esta área está sendo usada" in response.json()["error"]["message"].lower()

async def test_delete_area_no_permission_returns_403(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "user-area@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "user-area@test.com", "password123")
    
    import uuid
    fake_id = uuid.uuid4()
    response = await client.delete(f"/api/v1/job-areas/{fake_id}", headers=headers)
    assert response.status_code == 403

async def test_deactivate_area_in_use_allowed(client: AsyncClient, db_session: AsyncSession):
    headers = await _get_admin_headers(client, db_session)
    
    await client.post("/api/v1/job-areas", json={"name": "Logística"}, headers=headers)
    
    result = await db_session.execute(sa.text("SELECT id FROM users WHERE email = 'admin-area@test.com'"))
    user_id = result.scalar()
    import uuid
    user_uuid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id
    
    job = JobModel(
        title="Vaga Logística",
        description="Desc",
        status="draft",
        created_by=user_uuid,
        job_area="Logística"
    )
    db_session.add(job)
    await db_session.commit()
    
    area_resp = await client.get("/api/v1/job-areas?search=Logística", headers=headers)
    area_id = area_resp.json()["data"][0]["id"]
    
    response = await client.patch(f"/api/v1/job-areas/{area_id}/deactivate", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False
