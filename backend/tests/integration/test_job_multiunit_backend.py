from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


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
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _job_payload(**overrides) -> dict:
    payload = {
        "title": f"Backend Engineer {uuid4().hex[:6]}",
        "description": (
            "Build and maintain backend APIs for high-volume hiring workflows, "
            "owning integrations, observability, automated tests, and production reliability."
        ),
        "requirements": (
            "Strong backend experience with Python, FastAPI, PostgreSQL, API design, "
            "testing, and production troubleshooting."
        ),
        "seniority_level": "senior",
        "minimum_education_level": "bachelor",
        "minimum_years_experience": "3.0",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "brl",
        "job_area": "technology",
        "responsibilities": (
            "Design backend services, maintain integrations, review code, improve observability, "
            "and support production incidents with clear ownership."
        ),
        "experience_context": "Experience delivering backend systems in production environments.",
        "behavioral_requirements": ["Ownership", "Clear communication"],
        "selection_flow_type": "simple",
    }
    payload.update(overrides)
    return payload


async def _create_operational_scope(
    db_session: AsyncSession,
    *,
    suffix: str | None = None,
) -> tuple[OperationalGroupModel, LocationGroupModel, OperationalUnitModel]:
    suffix = suffix or uuid4().hex[:8]
    group = OperationalGroupModel(
        code=f"GRP-{suffix}",
        name=f"Grupo {suffix}",
        normalized_name=f"grupo-{suffix}".lower(),
        is_active=True,
    )
    location = LocationGroupModel(
        name=f"Localidade {suffix}",
        normalized_name=f"localidade-{suffix}".lower(),
        state="SP",
        city="Campinas",
        type="city",
        is_active=True,
    )
    db_session.add_all([group, location])
    await db_session.flush()

    unit = OperationalUnitModel(
        group_id=group.id,
        location_group_id=location.id,
        code=f"UNIT-{suffix}",
        name=f"Unidade {suffix}",
        normalized_name=f"unidade-{suffix}".lower(),
        type="gas_station",
        city="Campinas",
        state="SP",
        is_active=True,
    )
    db_session.add(unit)
    await db_session.commit()
    return group, location, unit


async def _add_publishable_skills(
    client: AsyncClient, headers: dict[str, str], job_id: str
) -> None:
    for skill_name in (f"Python OP2 {uuid4().hex[:8]}", f"FastAPI OP2 {uuid4().hex[:8]}"):
        response = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={"skill_name": skill_name, "priority_level": "priority"},
            headers=headers,
        )
        assert response.status_code == 201, response.text


@pytest.fixture
async def recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    email = f"recruiter-op2-{uuid4().hex[:8]}@test.com"
    await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    return await _auth_headers(client, email, "password123")


@pytest.mark.asyncio
async def test_create_legacy_job_without_operational_scope_and_publish(
    client: AsyncClient,
    recruiter_headers: dict[str, str],
):
    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(location="Brasil remoto"),
        headers=recruiter_headers,
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["location"] == "Brasil remoto"
    assert body["operational_group_id"] is None
    assert body["location_group_id"] is None
    assert body["allocation_mode"] is None
    assert body["operational_unit_ids"] == []
    assert body["job_units"] == []

    await _add_publishable_skills(client, recruiter_headers, body["id"])
    publish = await client.patch(f"/api/v1/jobs/{body['id']}/publish", headers=recruiter_headers)
    assert publish.status_code == 200, publish.text
    assert publish.json()["status"] == "published"
    assert publish.json()["location"] == "Brasil remoto"


@pytest.mark.asyncio
async def test_create_corporate_job_with_group_and_location(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict[str, str],
):
    group, location, _unit = await _create_operational_scope(db_session)

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            operational_group_id=str(group.id),
            location_group_id=str(location.id),
            allocation_mode="corporate",
        ),
        headers=recruiter_headers,
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["operational_group_id"] == str(group.id)
    assert body["location_group_id"] == str(location.id)
    assert body["allocation_mode"] == "corporate"
    assert body["job_units"] == []
    assert body["location"] == "Brasil"


@pytest.mark.asyncio
async def test_create_operational_job_with_one_unit(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict[str, str],
):
    group, location, unit = await _create_operational_scope(db_session)

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            operational_group_id=str(group.id),
            location_group_id=str(location.id),
            allocation_mode="operational",
            operational_unit_ids=[str(unit.id)],
        ),
        headers=recruiter_headers,
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["operational_unit_ids"] == [str(unit.id)]
    assert len(body["job_units"]) == 1
    assert body["job_units"][0]["operational_unit_id"] == str(unit.id)
    assert body["job_units"][0]["is_active"] is True


@pytest.mark.asyncio
async def test_create_operational_job_with_multiple_units(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict[str, str],
):
    group, location, unit_a = await _create_operational_scope(
        db_session, suffix=f"a{uuid4().hex[:6]}"
    )
    _group_b, _location_b, unit_b = await _create_operational_scope(
        db_session,
        suffix=f"b{uuid4().hex[:6]}",
    )

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            operational_group_id=str(group.id),
            location_group_id=str(location.id),
            allocation_mode="operational",
            job_units=[
                {"operational_unit_id": str(unit_a.id), "openings_count": 2, "priority": 1},
                {"operational_unit_id": str(unit_b.id), "openings_count": 3, "priority": 2},
            ],
        ),
        headers=recruiter_headers,
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert set(body["operational_unit_ids"]) == {str(unit_a.id), str(unit_b.id)}
    units_by_id = {item["operational_unit_id"]: item for item in body["job_units"]}
    assert units_by_id[str(unit_a.id)]["openings_count"] == 2
    assert units_by_id[str(unit_b.id)]["priority"] == 2


@pytest.mark.asyncio
async def test_update_job_units_replaces_previous_links(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict[str, str],
):
    group, location, unit_a = await _create_operational_scope(
        db_session, suffix=f"a{uuid4().hex[:6]}"
    )
    _group_b, _location_b, unit_b = await _create_operational_scope(
        db_session,
        suffix=f"b{uuid4().hex[:6]}",
    )
    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            operational_group_id=str(group.id),
            location_group_id=str(location.id),
            allocation_mode="operational",
            operational_unit_ids=[str(unit_a.id)],
        ),
        headers=recruiter_headers,
    )
    assert create.status_code == 201, create.text
    job_id = create.json()["id"]

    update = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"job_units": [{"operational_unit_id": str(unit_b.id), "openings_count": 4}]},
        headers=recruiter_headers,
    )
    assert update.status_code == 200, update.text
    body = update.json()
    assert body["operational_unit_ids"] == [str(unit_b.id)]
    assert body["job_units"][0]["openings_count"] == 4


@pytest.mark.asyncio
async def test_list_jobs_filters_by_operational_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    recruiter_headers: dict[str, str],
):
    group_a, location_a, unit_a = await _create_operational_scope(
        db_session,
        suffix=f"a{uuid4().hex[:6]}",
    )
    group_b, location_b, unit_b = await _create_operational_scope(
        db_session,
        suffix=f"b{uuid4().hex[:6]}",
    )

    job_a = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            title="Vaga Operacional A",
            operational_group_id=str(group_a.id),
            location_group_id=str(location_a.id),
            allocation_mode="operational",
            operational_unit_ids=[str(unit_a.id)],
        ),
        headers=recruiter_headers,
    )
    assert job_a.status_code == 201, job_a.text
    job_b = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            title="Vaga Operacional B",
            operational_group_id=str(group_b.id),
            location_group_id=str(location_b.id),
            allocation_mode="operational",
            operational_unit_ids=[str(unit_b.id)],
        ),
        headers=recruiter_headers,
    )
    assert job_b.status_code == 201, job_b.text
    job_a_id = job_a.json()["id"]
    job_b_id = job_b.json()["id"]

    by_group = await client.get(
        f"/api/v1/jobs?operational_group_id={group_a.id}",
        headers=recruiter_headers,
    )
    assert by_group.status_code == 200
    assert {item["id"] for item in by_group.json()["data"]} == {job_a_id}

    by_location = await client.get(
        f"/api/v1/jobs?location_group_id={location_b.id}",
        headers=recruiter_headers,
    )
    assert by_location.status_code == 200
    assert {item["id"] for item in by_location.json()["data"]} == {job_b_id}

    by_unit = await client.get(
        f"/api/v1/jobs?operational_unit_id={unit_a.id}",
        headers=recruiter_headers,
    )
    assert by_unit.status_code == 200
    assert {item["id"] for item in by_unit.json()["data"]} == {job_a_id}

    by_allocation = await client.get(
        "/api/v1/jobs?allocation_mode=operational",
        headers=recruiter_headers,
    )
    assert by_allocation.status_code == 200
    filtered_ids = {item["id"] for item in by_allocation.json()["data"]}
    assert {job_a_id, job_b_id}.issubset(filtered_ids)
