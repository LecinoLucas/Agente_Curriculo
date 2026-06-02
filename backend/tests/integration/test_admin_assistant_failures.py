from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.assistant_failure_model import AssistantFailureModel
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.infrastructure.database.models.operational_master_model import LocationGroupModel
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _user_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> tuple[dict[str, str], UUID]:
    email = f"assistant-failure-{role.value}-{uuid4()}@example.com"
    user = await _create_active_user(db_session, email, "password123", role)
    return await _auth_headers(client, email, "password123"), user.id


async def _candidate(db_session: AsyncSession) -> CandidateModel:
    candidate = CandidateModel(full_name="Maria da Silva")
    db_session.add(candidate)
    await db_session.commit()
    await db_session.refresh(candidate)
    return candidate


async def _location(db_session: AsyncSession, name: str = "Peritoró") -> LocationGroupModel:
    location = LocationGroupModel(
        name=name,
        normalized_name=name.casefold(),
        state="MA",
        city=name,
        type="city",
    )
    db_session.add(location)
    await db_session.commit()
    await db_session.refresh(location)
    return location


async def _session(
    db_session: AsyncSession,
    *,
    candidate_id: UUID | None = None,
    application_id: UUID | None = None,
    current_state: str = "CHOOSE_LOCATION",
) -> ConversationSessionModel:
    now = datetime.now(UTC)
    session = ConversationSessionModel(
        candidate_id=candidate_id,
        application_id=application_id,
        channel="web",
        current_state=current_state,
        status="active",
        context_json={},
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(session)
    return session


async def _failure(
    db_session: AsyncSession,
    *,
    session_id: UUID,
    candidate_id: UUID | None = None,
    application_id: UUID | None = None,
    state: str = "CHOOSE_LOCATION",
    reason: str = "location_not_found",
    status: str = "open",
    classification: str | None = "location",
    raw_message: str = "Meu CPF é 529.982.247-25 e telefone 11999998888",
    sanitized_message: str = "Meu CPF é [cpf omitido] e telefone [número omitido]",
) -> AssistantFailureModel:
    failure = AssistantFailureModel(
        session_id=session_id,
        candidate_id=candidate_id,
        application_id=application_id,
        state=state,
        raw_message=raw_message,
        sanitized_message=sanitized_message,
        reason=reason,
        status=status,
        classification=classification,
        attempts_count=2,
    )
    db_session.add(failure)
    await db_session.commit()
    await db_session.refresh(failure)
    return failure


async def test_conversation_invalid_location_registers_failure_without_advancing(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _candidate(db_session)
    await _location(db_session, "Peritoró")

    create = await client.post(
        "/api/v1/conversations",
        json={"channel": "web", "candidate_id": str(candidate.id)},
    )
    assert create.status_code == 201
    session_id = create.json()["session_id"]

    identify = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "continuar"},
    )
    assert identify.status_code == 200
    assert identify.json()["current_state"] == "CHOOSE_LOCATION"

    invalid = await client.post(
        f"/api/v1/conversations/{session_id}/messages",
        json={"content": "Cidade Inexistente"},
    )
    assert invalid.status_code == 200
    assert invalid.json()["current_state"] == "CHOOSE_LOCATION"

    failure = await db_session.scalar(
        sa.select(AssistantFailureModel).where(
            AssistantFailureModel.session_id == UUID(session_id)
        )
    )
    assert failure is not None
    assert failure.reason == "location_not_found"
    assert failure.raw_message == "Cidade Inexistente"
    assert failure.sanitized_message == "Cidade Inexistente"

    for content in ("Outro Lugar", "Mais Um Lugar"):
        retry = await client.post(
            f"/api/v1/conversations/{session_id}/messages",
            json={"content": content},
        )
        assert retry.status_code == 200
        assert retry.json()["current_state"] == "CHOOSE_LOCATION"

    last_failure = await db_session.scalar(
        sa.select(AssistantFailureModel)
        .where(AssistantFailureModel.session_id == UUID(session_id))
        .order_by(AssistantFailureModel.created_at.desc())
        .limit(1)
    )
    assert last_failure is not None
    assert last_failure.reason == "location_not_found_attempt_limit"
    assert last_failure.attempts_count == 3


async def test_admin_failure_endpoints_never_return_raw_message(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    session = await _session(db_session)
    failure = await _failure(db_session, session_id=session.id)

    listed = await client.get("/api/v1/admin/assistant/failures", headers=headers)
    assert listed.status_code == 200
    body = listed.text
    assert "529.982.247-25" not in body
    assert "11999998888" not in body
    assert "raw_message" not in body
    assert "[cpf omitido]" in body
    assert "[número omitido]" in body

    detail = await client.get(
        f"/api/v1/admin/assistant/failures/{failure.id}",
        headers=headers,
    )
    assert detail.status_code == 200
    assert "529.982.247-25" not in detail.text
    assert "raw_message" not in detail.text


async def test_failure_list_filters_by_status_state_reason_and_classification(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.HR)
    session = await _session(db_session)
    wanted = await _failure(db_session, session_id=session.id)
    await _failure(
        db_session,
        session_id=session.id,
        state="CHOOSE_SHIFT",
        reason="shift_not_understood",
        status="resolved",
        classification="shift",
    )

    response = await client.get(
        "/api/v1/admin/assistant/failures"
        "?status=open&state=CHOOSE_LOCATION&reason=location_not_found&classification=location",
        headers=headers,
    )
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["data"]]
    assert ids == [str(wanted.id)]


async def test_failure_detail_writes_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _user_headers(client, db_session, UserRole.RECRUITER)
    session = await _session(db_session)
    failure = await _failure(db_session, session_id=session.id)

    response = await client.get(
        f"/api/v1/admin/assistant/failures/{failure.id}",
        headers=headers,
    )
    assert response.status_code == 200

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "admin.assistant.failure.read",
            AuditLogModel.user_id == actor_id,
        )
    )
    assert audit is not None
    assert audit.resource_type == "assistant_failure"


async def test_patch_updates_status_classification_and_audit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, actor_id = await _user_headers(client, db_session, UserRole.ADMIN)
    session = await _session(db_session)
    failure = await _failure(db_session, session_id=session.id, classification=None)

    response = await client.patch(
        f"/api/v1/admin/assistant/failures/{failure.id}",
        headers=headers,
        json={"status": "reviewed", "classification": "talk_to_hr"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "reviewed"
    assert data["classification"] == "talk_to_hr"
    assert data["reviewed_by"] == str(actor_id)
    assert data["reviewed_at"] is not None

    refreshed = await db_session.get(AssistantFailureModel, failure.id)
    assert refreshed is not None
    assert refreshed.reviewed_by == actor_id
    assert refreshed.reviewed_at is not None

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "admin.assistant.failure.update",
            AuditLogModel.user_id == actor_id,
        )
    )
    assert audit is not None


async def test_patch_rejects_forbidden_fields(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    session = await _session(db_session)
    failure = await _failure(db_session, session_id=session.id)

    response = await client.patch(
        f"/api/v1/admin/assistant/failures/{failure.id}",
        headers=headers,
        json={"raw_message": "novo valor", "status": "resolved"},
    )
    assert response.status_code == 422


async def test_viewer_cannot_access_failures(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.VIEWER)
    session = await _session(db_session)
    failure = await _failure(db_session, session_id=session.id)

    list_response = await client.get("/api/v1/admin/assistant/failures", headers=headers)
    detail_response = await client.get(
        f"/api/v1/admin/assistant/failures/{failure.id}",
        headers=headers,
    )
    patch_response = await client.patch(
        f"/api/v1/admin/assistant/failures/{failure.id}",
        headers=headers,
        json={"status": "ignored"},
    )
    assert list_response.status_code in (401, 403)
    assert detail_response.status_code in (401, 403)
    assert patch_response.status_code in (401, 403)


async def test_filters_has_candidate_and_has_application(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    candidate = await _candidate(db_session)
    application = CandidateApplicationModel(
        candidate_id=candidate.id,
        source="bot",
        status="started",
    )
    db_session.add(application)
    await db_session.commit()
    await db_session.refresh(application)
    session = await _session(
        db_session,
        candidate_id=candidate.id,
        application_id=application.id,
    )
    await _failure(
        db_session,
        session_id=session.id,
        candidate_id=candidate.id,
        application_id=application.id,
    )

    response = await client.get(
        "/api/v1/admin/assistant/failures?has_candidate=true&has_application=true",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["total"] >= 1
    assert all(item["candidate_id"] is not None for item in response.json()["data"])
    assert all(item["application"] is not None for item in response.json()["data"])
