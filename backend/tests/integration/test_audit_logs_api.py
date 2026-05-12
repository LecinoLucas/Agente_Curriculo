from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.audit_model import AuditLogModel

from .helpers import _auth_headers, _create_active_user


async def _insert_audit_log(
    session: AsyncSession,
    *,
    action: str,
    resource_type: str,
    timestamp: datetime,
    user_id,
    metadata: dict | None = None,
) -> AuditLogModel:
    log = AuditLogModel(
        id=uuid4(),
        timestamp=timestamp,
        action=action,
        resource_type=resource_type,
        resource_id=uuid4(),
        user_id=user_id,
        request_id=uuid4(),
        metadata_=metadata or {},
    )
    session.add(log)
    await session.commit()
    return log


@pytest.mark.asyncio
async def test_admin_lists_audit_logs_successfully(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(db_session, "audit-admin@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "audit-admin@test.com", "password123")

    created = await _insert_audit_log(
        db_session,
        action="archive_candidate",
        resource_type="candidate",
        timestamp=datetime(2026, 5, 10, 12, 0, tzinfo=UTC),
        user_id=admin.id,
        metadata={"candidate_name": "Maria", "correlation_id": "corr-123"},
    )

    response = await client.get("/api/v1/admin/audit-logs", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["page"] == 1
    assert payload["page_size"] == 20
    item = payload["data"][0]
    assert item["id"] == str(created.id)
    assert item["action"] == "archive_candidate"
    assert item["entity_type"] == "candidate"
    assert item["user_id"] == str(admin.id)
    assert item["user_name"] == admin.full_name
    assert item["user_email"] == admin.email
    assert item["metadata"]["candidate_name"] == "Maria"
    assert item["correlation_id"] == "corr-123"


@pytest.mark.asyncio
async def test_non_admin_receives_403_when_listing_audit_logs(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(db_session, "audit-recruiter@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "audit-recruiter@test.com", "password123")

    response = await client.get("/api/v1/admin/audit-logs", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_filter_by_action_works(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(db_session, "filter-action@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "filter-action@test.com", "password123")
    await _insert_audit_log(
        db_session,
        action="archive_job",
        resource_type="job",
        timestamp=datetime(2026, 5, 10, 10, 0, tzinfo=UTC),
        user_id=admin.id,
    )
    await _insert_audit_log(
        db_session,
        action="restore_job",
        resource_type="job",
        timestamp=datetime(2026, 5, 10, 11, 0, tzinfo=UTC),
        user_id=admin.id,
    )

    response = await client.get("/api/v1/admin/audit-logs?action=archive_job", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["data"][0]["action"] == "archive_job"


@pytest.mark.asyncio
async def test_filter_by_entity_type_works(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(db_session, "filter-entity@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "filter-entity@test.com", "password123")
    await _insert_audit_log(
        db_session,
        action="archive_candidate",
        resource_type="candidate",
        timestamp=datetime(2026, 5, 10, 10, 0, tzinfo=UTC),
        user_id=admin.id,
    )
    await _insert_audit_log(
        db_session,
        action="archive_job",
        resource_type="job",
        timestamp=datetime(2026, 5, 10, 11, 0, tzinfo=UTC),
        user_id=admin.id,
    )

    response = await client.get("/api/v1/admin/audit-logs?entity_type=candidate", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["data"][0]["entity_type"] == "candidate"


@pytest.mark.asyncio
async def test_filter_by_date_range_works(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(db_session, "filter-date@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "filter-date@test.com", "password123")
    await _insert_audit_log(
        db_session,
        action="archive_job",
        resource_type="job",
        timestamp=datetime(2026, 5, 9, 23, 59, tzinfo=UTC),
        user_id=admin.id,
    )
    expected = await _insert_audit_log(
        db_session,
        action="restore_candidate",
        resource_type="candidate",
        timestamp=datetime(2026, 5, 10, 8, 0, tzinfo=UTC),
        user_id=admin.id,
    )

    response = await client.get(
        "/api/v1/admin/audit-logs?date_from=2026-05-10&date_to=2026-05-10",
        headers=headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["data"][0]["id"] == str(expected.id)


@pytest.mark.asyncio
async def test_pagination_works(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(db_session, "pagination@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "pagination@test.com", "password123")
    for hour in range(3):
        await _insert_audit_log(
            db_session,
            action=f"custom_action_{hour}",
            resource_type="job",
            timestamp=datetime(2026, 5, 10, hour, 0, tzinfo=UTC),
            user_id=admin.id,
        )

    response = await client.get("/api/v1/admin/audit-logs?page=2&page_size=1", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 3
    assert payload["page"] == 2
    assert payload["page_size"] == 1
    assert payload["total_pages"] == 3
    assert len(payload["data"]) == 1


@pytest.mark.asyncio
async def test_ordering_is_created_at_desc(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(db_session, "ordering@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "ordering@test.com", "password123")
    older = await _insert_audit_log(
        db_session,
        action="older_event",
        resource_type="job",
        timestamp=datetime(2026, 5, 10, 8, 0, tzinfo=UTC),
        user_id=admin.id,
    )
    newer = await _insert_audit_log(
        db_session,
        action="newer_event",
        resource_type="job",
        timestamp=datetime(2026, 5, 10, 9, 0, tzinfo=UTC),
        user_id=admin.id,
    )

    response = await client.get("/api/v1/admin/audit-logs", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload["data"][:2]] == [str(newer.id), str(older.id)]


@pytest.mark.asyncio
async def test_search_does_not_break_when_metadata_is_empty(
    client: AsyncClient,
    db_session: AsyncSession,
):
    admin = await _create_active_user(db_session, "search-empty-metadata@test.com", "password123", UserRole.ADMIN)
    headers = await _auth_headers(client, "search-empty-metadata@test.com", "password123")
    await _insert_audit_log(
        db_session,
        action="archive_candidate",
        resource_type="candidate",
        timestamp=datetime(2026, 5, 10, 12, 0, tzinfo=UTC),
        user_id=admin.id,
        metadata={},
    )

    response = await client.get("/api/v1/admin/audit-logs?search=sem-resultado", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["data"] == []
