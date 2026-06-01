from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
    email_prefix: str,
) -> dict[str, str]:
    email = f"{email_prefix}-{uuid4()}@example.com"
    await _create_active_user(db_session, email, "password123", role)
    return await _auth_headers(client, email, "password123")


async def _create_group(client: AsyncClient, headers: dict[str, str], code: str = "01") -> dict:
    response = await client.post(
        "/api/v1/operational-groups",
        json={"code": code, "name": f"Grupo {code}", "description": "Grupo teste"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_location_group(
    client: AsyncClient,
    headers: dict[str, str],
    name: str = "Campinas",
    type: str = "city",
) -> dict:
    response = await client.post(
        "/api/v1/location-groups",
        json={"name": name, "state": "sp", "city": name, "type": type},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def _create_unit(
    client: AsyncClient,
    headers: dict[str, str],
    group_id: str,
    location_group_id: str,
    code: str = "3601",
    type: str = "gas_station",
) -> dict:
    response = await client.post(
        "/api/v1/operational-units",
        json={
            "group_id": group_id,
            "location_group_id": location_group_id,
            "code": code,
            "name": f"Posto {code}",
            "public_name": f"Posto Público {code}",
            "type": type,
            "reference_point": "Ao lado da rodovia",
            "address": "Rua Operacional, 100",
            "city": "Campinas",
            "state": "sp",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


async def test_operational_group_crud_and_filters(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "op-admin")
    recruiter_headers = await _headers(client, db_session, UserRole.RECRUITER, "op-recruiter")

    group = await _create_group(client, admin_headers, code="01")
    assert group["code"] == "01"
    assert group["normalized_name"] == "grupo 01"
    assert group["is_active"] is True

    duplicate = await client.post(
        "/api/v1/operational-groups",
        json={"code": "01", "name": "Outro grupo"},
        headers=admin_headers,
    )
    assert duplicate.status_code == 409

    update = await client.patch(
        f"/api/v1/operational-groups/{group['id']}",
        json={"name": "Grupo Escritório", "is_active": False},
        headers=admin_headers,
    )
    assert update.status_code == 200
    assert update.json()["normalized_name"] == "grupo escritorio"
    assert update.json()["is_active"] is False

    inactive_list = await client.get(
        "/api/v1/operational-groups?active=false&search=escritorio",
        headers=recruiter_headers,
    )
    assert inactive_list.status_code == 200
    data = inactive_list.json()
    assert data["total"] == 1
    assert data["data"][0]["id"] == group["id"]


async def test_operational_group_patch_clears_nullable_description(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "op-clear-admin")

    group = await _create_group(client, admin_headers, code="10")
    assert group["description"] == "Grupo teste"

    response = await client.patch(
        f"/api/v1/operational-groups/{group['id']}",
        json={"description": None},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["description"] is None

    required_clear = await client.patch(
        f"/api/v1/operational-groups/{group['id']}",
        json={"name": None},
        headers=admin_headers,
    )
    assert required_clear.status_code == 422


async def test_location_group_crud_and_filters(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "loc-admin")
    hr_headers = await _headers(client, db_session, UserRole.HR, "loc-hr")

    location = await _create_location_group(client, admin_headers, name="Centro", type="district")
    assert location["state"] == "SP"
    assert location["normalized_name"] == "centro"

    duplicate = await client.post(
        "/api/v1/location-groups",
        json={"name": "Centro", "state": "SP", "type": "district"},
        headers=admin_headers,
    )
    assert duplicate.status_code == 409

    update = await client.patch(
        f"/api/v1/location-groups/{location['id']}",
        json={"type": "other", "city": "Campinas", "is_active": False},
        headers=admin_headers,
    )
    assert update.status_code == 200
    assert update.json()["type"] == "other"
    assert update.json()["is_active"] is False

    response = await client.get(
        "/api/v1/location-groups?active=false&type=other&search=campinas",
        headers=hr_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["data"][0]["id"] == location["id"]


async def test_location_group_patch_clears_nullable_city(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "loc-clear-admin")
    location = await _create_location_group(client, admin_headers, name="Paulínia")
    assert location["city"] == "Paulínia"

    response = await client.patch(
        f"/api/v1/location-groups/{location['id']}",
        json={"city": None},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["city"] is None

    required_clear = await client.patch(
        f"/api/v1/location-groups/{location['id']}",
        json={"state": None},
        headers=admin_headers,
    )
    assert required_clear.status_code == 422


async def test_operational_unit_crud_and_filters(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "unit-admin")
    recruiter_headers = await _headers(client, db_session, UserRole.RECRUITER, "unit-recruiter")
    group = await _create_group(client, admin_headers, code="02")
    location = await _create_location_group(client, admin_headers, name="Sorocaba")

    unit = await _create_unit(
        client,
        admin_headers,
        group_id=group["id"],
        location_group_id=location["id"],
        code="3601",
    )
    assert unit["code"] == "3601"
    assert unit["state"] == "SP"
    assert unit["normalized_name"] == "posto 3601"

    duplicate = await client.post(
        "/api/v1/operational-units",
        json={
            "group_id": group["id"],
            "location_group_id": location["id"],
            "code": "3601",
            "name": "Posto Duplicado",
        },
        headers=admin_headers,
    )
    assert duplicate.status_code == 409

    update = await client.patch(
        f"/api/v1/operational-units/{unit['id']}",
        json={"public_name": "Posto Rodovia", "is_active": False},
        headers=admin_headers,
    )
    assert update.status_code == 200
    assert update.json()["public_name"] == "Posto Rodovia"
    assert update.json()["is_active"] is False

    response = await client.get(
        (
            "/api/v1/operational-units"
            f"?active=false&group_id={group['id']}&location_group_id={location['id']}"
            "&type=gas_station&search=rodovia"
        ),
        headers=recruiter_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["data"][0]["id"] == unit["id"]


async def test_operational_unit_patch_clears_nullable_fields(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "unit-clear-admin")
    group = await _create_group(client, admin_headers, code="11")
    location = await _create_location_group(client, admin_headers, name="Limeira")
    unit = await _create_unit(
        client,
        admin_headers,
        group_id=group["id"],
        location_group_id=location["id"],
        code="4601",
    )

    response = await client.patch(
        f"/api/v1/operational-units/{unit['id']}",
        json={
            "public_name": None,
            "reference_point": None,
            "address": None,
            "city": None,
            "state": None,
        },
        headers=admin_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["public_name"] is None
    assert data["reference_point"] is None
    assert data["address"] is None
    assert data["city"] is None
    assert data["state"] is None

    required_clear = await client.patch(
        f"/api/v1/operational-units/{unit['id']}",
        json={"group_id": None, "name": None, "type": None},
        headers=admin_headers,
    )
    assert required_clear.status_code == 422


async def test_operational_unit_requires_existing_group_and_location_group(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    admin_headers = await _headers(client, db_session, UserRole.ADMIN, "parent-admin")
    location = await _create_location_group(client, admin_headers, name="Jundiaí")

    missing_group = await client.post(
        "/api/v1/operational-units",
        json={
            "group_id": str(uuid4()),
            "location_group_id": location["id"],
            "code": "4301",
            "name": "Posto 4301",
        },
        headers=admin_headers,
    )
    assert missing_group.status_code == 404

    group = await _create_group(client, admin_headers, code="03")
    missing_location = await client.post(
        "/api/v1/operational-units",
        json={
            "group_id": group["id"],
            "location_group_id": str(uuid4()),
            "code": "4301",
            "name": "Posto 4301",
        },
        headers=admin_headers,
    )
    assert missing_location.status_code == 404


async def test_operational_master_write_permissions_block_viewer_and_recruiter(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    viewer_headers = await _headers(client, db_session, UserRole.VIEWER, "op-viewer")
    recruiter_headers = await _headers(
        client,
        db_session,
        UserRole.RECRUITER,
        "op-writer-recruiter",
    )

    viewer_create = await client.post(
        "/api/v1/operational-groups",
        json={"code": "99", "name": "Sem permissão"},
        headers=viewer_headers,
    )
    assert viewer_create.status_code == 403

    recruiter_create = await client.post(
        "/api/v1/location-groups",
        json={"name": "Sem permissão", "state": "SP"},
        headers=recruiter_headers,
    )
    assert recruiter_create.status_code == 403


async def test_viewer_cannot_list_operational_master(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    viewer_headers = await _headers(client, db_session, UserRole.VIEWER, "op-viewer-list")

    response = await client.get("/api/v1/operational-groups", headers=viewer_headers)
    assert response.status_code == 403
