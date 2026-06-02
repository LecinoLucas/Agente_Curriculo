from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _recruiter_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    email_prefix: str = "applications-recruiter",
) -> tuple[dict[str, str], UUID]:
    email = f"{email_prefix}-{uuid4()}@example.com"
    user = await _create_active_user(db_session, email, "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, email, "password123")
    return headers, user.id


async def _candidate(db_session: AsyncSession, created_by: UUID) -> CandidateModel:
    candidate = CandidateModel(
        full_name="Pessoa Candidata",
        email=f"candidate-{uuid4()}@example.com",
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _job(db_session: AsyncSession, created_by: UUID) -> JobModel:
    job = JobModel(
        title="Atendente",
        description="Atendimento ao cliente e rotinas operacionais.",
        location="Campinas, SP",
        created_by=created_by,
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)
    return job


async def _operational_scope(
    db_session: AsyncSession,
    *,
    group_code: str = "01",
    location_name: str = "Campinas",
    unit_code: str = "0101",
) -> tuple[LocationGroupModel, OperationalUnitModel]:
    group = OperationalGroupModel(
        code=group_code,
        name=f"Grupo {group_code}",
        normalized_name=f"grupo {group_code}",
    )
    location = LocationGroupModel(
        name=location_name,
        normalized_name=location_name.lower(),
        state="SP",
        city=location_name,
        type="city",
    )
    db_session.add_all([group, location])
    await db_session.flush()
    unit = OperationalUnitModel(
        group_id=group.id,
        location_group_id=location.id,
        code=unit_code,
        name=f"Posto {unit_code}",
        normalized_name=f"posto {unit_code}",
        type="gas_station",
    )
    db_session.add(unit)
    await db_session.commit()
    await db_session.refresh(location)
    await db_session.refresh(unit)
    return location, unit


async def test_create_application_with_candidate_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-create")
    candidate = await _candidate(db_session, user_id)

    response = await client.post(
        "/api/v1/applications",
        json={"candidate_id": str(candidate.id), "source": "staff"},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["candidate_id"] == str(candidate.id)
    assert body["job_id"] is None
    assert body["status"] == "started"
    assert "cpf" not in body


async def test_create_application_with_job_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-job")
    candidate = await _candidate(db_session, user_id)
    job = await _job(db_session, user_id)

    response = await client.post(
        "/api/v1/applications",
        json={"candidate_id": str(candidate.id), "job_id": str(job.id), "source": "web_portal"},
        headers=headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["job_id"] == str(job.id)


async def test_create_application_with_location(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-location")
    candidate = await _candidate(db_session, user_id)
    location, _unit = await _operational_scope(db_session)

    response = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "preferred_location_group_id": str(location.id),
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["preferred_location_group_id"] == str(location.id)


async def test_create_application_with_consistent_unit(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-unit")
    candidate = await _candidate(db_session, user_id)
    location, unit = await _operational_scope(db_session)

    response = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "preferred_location_group_id": str(location.id),
            "preferred_unit_id": str(unit.id),
        },
        headers=headers,
    )

    assert response.status_code == 201, response.text
    assert response.json()["preferred_unit_id"] == str(unit.id)


async def test_reject_application_unit_inconsistent_with_location(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-bad-unit")
    candidate = await _candidate(db_session, user_id)
    location, _unit = await _operational_scope(db_session, group_code="02", unit_code="0201")
    _other_location, other_unit = await _operational_scope(
        db_session,
        group_code="03",
        location_name="Sorocaba",
        unit_code="0301",
    )

    response = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "preferred_location_group_id": str(location.id),
            "preferred_unit_id": str(other_unit.id),
        },
        headers=headers,
    )

    assert response.status_code == 422


async def test_accepts_any_unit_requires_location_and_null_unit(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-any-unit")
    candidate = await _candidate(db_session, user_id)
    location, unit = await _operational_scope(db_session)

    without_location = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "accepts_any_unit_in_location": True,
        },
        headers=headers,
    )
    assert without_location.status_code == 422

    with_unit = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "preferred_location_group_id": str(location.id),
            "preferred_unit_id": str(unit.id),
            "accepts_any_unit_in_location": True,
        },
        headers=headers,
    )
    assert with_unit.status_code == 422

    valid = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "preferred_location_group_id": str(location.id),
            "accepts_any_unit_in_location": True,
        },
        headers=headers,
    )
    assert valid.status_code == 201, valid.text


async def test_prevent_duplicate_active_application_for_same_candidate_and_job(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-duplicate")
    candidate = await _candidate(db_session, user_id)
    job = await _job(db_session, user_id)
    payload = {"candidate_id": str(candidate.id), "job_id": str(job.id)}

    first = await client.post("/api/v1/applications", json=payload, headers=headers)
    assert first.status_code == 201, first.text

    second = await client.post("/api/v1/applications", json=payload, headers=headers)
    assert second.status_code == 409


async def test_list_applications_by_candidate_job_status_and_source(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-list")
    candidate = await _candidate(db_session, user_id)
    job = await _job(db_session, user_id)

    create = await client.post(
        "/api/v1/applications",
        json={
            "candidate_id": str(candidate.id),
            "job_id": str(job.id),
            "source": "web_portal",
            "status": "submitted",
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text

    response = await client.get(
        "/api/v1/applications"
        f"?candidate_id={candidate.id}&job_id={job.id}&status=submitted&source=web_portal",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["data"][0]["id"] == create.json()["id"]


async def test_update_application_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-update")
    candidate = await _candidate(db_session, user_id)
    create = await client.post(
        "/api/v1/applications",
        json={"candidate_id": str(candidate.id)},
        headers=headers,
    )
    assert create.status_code == 201, create.text

    update = await client.patch(
        f"/api/v1/applications/{create.json()['id']}",
        json={"status": "qualified"},
        headers=headers,
    )

    assert update.status_code == 200, update.text
    assert update.json()["status"] == "qualified"


async def test_create_and_list_candidate_location_preference(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, user_id = await _recruiter_headers(client, db_session, "app-pref")
    candidate = await _candidate(db_session, user_id)
    location, unit = await _operational_scope(db_session)

    create = await client.post(
        "/api/v1/applications/location-preferences",
        json={
            "candidate_id": str(candidate.id),
            "location_group_id": str(location.id),
            "operational_unit_id": str(unit.id),
            "desired_shift": "noite",
            "priority": 1,
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text

    response = await client.get(
        f"/api/v1/applications/location-preferences?candidate_id={candidate.id}",
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["data"][0]["id"] == create.json()["id"]
