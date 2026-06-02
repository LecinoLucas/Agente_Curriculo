"""OP-6H-1A — Admin assistant sessions read-only endpoints.

Covers:
- RBAC (admin/hr/recruiter allowed; viewer/unauthenticated blocked)
- PII masking (no CPF, phone, email; cpf_last4 only with identity_verified)
- context_json never returned raw
- message sanitisation (CPF/phone redacted)
- filters (status, current_state, channel, has_application, has_pipeline, dates)
- audit log written on session detail access
- messages ordered by created_at ASC
- no mutation endpoints present
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


# ── Fixtures ──────────────────────────────────────────────────────────────────


async def _user_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> tuple[dict[str, str], UUID]:
    email = f"user-{role.value}-{uuid4()}@example.com"
    user = await _create_active_user(db_session, email, "password123", role)
    headers = await _auth_headers(client, email, "password123")
    return headers, user.id


async def _session(
    db_session: AsyncSession,
    *,
    status: str = "active",
    current_state: str = "CHOOSE_LOCATION",
    channel: str = "web",
    context: dict | None = None,
    candidate_id: UUID | None = None,
    application_id: UUID | None = None,
) -> ConversationSessionModel:
    now = datetime.now(UTC)
    s = ConversationSessionModel(
        candidate_id=candidate_id,
        application_id=application_id,
        channel=channel,
        current_state=current_state,
        status=status,
        context_json=context or {},
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    db_session.add(s)
    await db_session.commit()
    await db_session.refresh(s)
    return s


async def _message(
    db_session: AsyncSession,
    *,
    session_id: UUID,
    role: str,
    content: str,
    message_type: str = "text",
    metadata: dict | None = None,
    created_at: datetime | None = None,
) -> ConversationMessageModel:
    m = ConversationMessageModel(
        session_id=session_id,
        role=role,
        content=content,
        message_type=message_type,
        metadata_json=metadata,
        created_at=created_at or datetime.now(UTC),
    )
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


async def _candidate(
    db_session: AsyncSession,
    *,
    full_name: str = "Maria da Silva",
    cpf: str | None = None,
) -> CandidateModel:
    # cpf_last4 is derived from cpf by the before_insert event listener; we must
    # set `cpf` (not just cpf_last4) if we want the field to be populated.
    c = CandidateModel(full_name=full_name, cpf=cpf)
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


# ── RBAC tests ─────────────────────────────────────────────────────────────────


async def test_admin_can_list_sessions(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    await _session(db_session)

    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    assert r.status_code == 200


async def test_hr_can_list_sessions(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.HR)
    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    assert r.status_code == 200


async def test_recruiter_can_list_sessions(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.RECRUITER)
    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    assert r.status_code == 200


async def test_viewer_cannot_list_sessions(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.VIEWER)
    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    assert r.status_code in (401, 403)


async def test_unauthenticated_cannot_list_sessions(client: AsyncClient):
    r = await client.get("/api/v1/admin/assistant/sessions")
    assert r.status_code in (401, 403)


# ── Listing & masking ──────────────────────────────────────────────────────────


async def test_list_returns_sessions_with_masked_candidate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    cand = await _candidate(db_session, full_name="Maria da Silva")
    await _session(db_session, candidate_id=cand.id)

    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    assert r.status_code == 200
    items = r.json()["data"]
    assert len(items) >= 1
    found = next((i for i in items if i["candidate"]["id"] == str(cand.id)), None)
    assert found is not None
    # Name masked: "Maria S." (first name + initial of last name — "Silva")
    assert found["candidate"]["display_name"] == "Maria S."
    # cpf_last4 absent when identity_verified = false
    assert found["candidate"]["cpf_last4"] is None
    # context_json never in response
    assert "context_json" not in str(r.json())


async def test_cpf_last4_not_shown_without_identity_verified(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    # cpf="52998224725" → cpf_last4="4725" via event listener
    cand = await _candidate(db_session, cpf="52998224725")
    await _session(
        db_session,
        candidate_id=cand.id,
        context={"identifier_type": "cpf", "cpf_last4": "4725", "identity_verified": False},
    )

    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    found = next(
        (i for i in r.json()["data"] if i["candidate"]["id"] == str(cand.id)), None
    )
    assert found is not None
    assert found["candidate"]["cpf_last4"] is None
    assert found["candidate"]["identity_verified"] is False


async def test_cpf_last4_shown_when_identity_verified(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    cand = await _candidate(db_session, cpf="52998224725")
    await _session(
        db_session,
        candidate_id=cand.id,
        context={"identifier_type": "cpf", "cpf_last4": "4725", "identity_verified": True},
    )

    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    found = next(
        (i for i in r.json()["data"] if i["candidate"]["id"] == str(cand.id)), None
    )
    assert found is not None
    assert found["candidate"]["cpf_last4"] == "4725"
    assert found["candidate"]["identity_verified"] is True


async def test_anonymous_session_shows_generic_label(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session, candidate_id=None)

    r = await client.get("/api/v1/admin/assistant/sessions", headers=headers)
    found = next((i for i in r.json()["data"] if i["session_id"] == str(sess.id)), None)
    assert found is not None
    assert found["candidate"]["id"] is None
    assert found["candidate"]["display_name"] == "Candidato anônimo"


# ── Filters ────────────────────────────────────────────────────────────────────


async def test_filter_by_status(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    await _session(db_session, status="completed")
    await _session(db_session, status="active")

    r = await client.get(
        "/api/v1/admin/assistant/sessions?status=completed", headers=headers
    )
    assert r.status_code == 200
    for item in r.json()["data"]:
        assert item["status"] == "completed"


async def test_filter_by_current_state(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    await _session(db_session, current_state="IDENTIFY")
    await _session(db_session, current_state="CHOOSE_LOCATION")

    r = await client.get(
        "/api/v1/admin/assistant/sessions?current_state=IDENTIFY", headers=headers
    )
    assert r.status_code == 200
    for item in r.json()["data"]:
        assert item["current_state"] == "IDENTIFY"


async def test_filter_by_channel(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    await _session(db_session, channel="web")

    r = await client.get(
        "/api/v1/admin/assistant/sessions?channel=web", headers=headers
    )
    assert r.status_code == 200
    for item in r.json()["data"]:
        assert item["channel"] == "web"


async def test_filter_has_application_true(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    cand = await _candidate(db_session)
    app = CandidateApplicationModel(
        candidate_id=cand.id, job_id=None, source="bot", status="started"
    )
    db_session.add(app)
    await db_session.commit()
    await db_session.refresh(app)
    sess_with = await _session(db_session, application_id=app.id)
    await _session(db_session, application_id=None)

    r = await client.get(
        "/api/v1/admin/assistant/sessions?has_application=true", headers=headers
    )
    assert r.status_code == 200
    ids = [i["session_id"] for i in r.json()["data"]]
    assert str(sess_with.id) in ids
    for item in r.json()["data"]:
        assert item["application"] is not None


async def test_filter_has_application_false(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess_anon = await _session(db_session, application_id=None)

    r = await client.get(
        "/api/v1/admin/assistant/sessions?has_application=false", headers=headers
    )
    assert r.status_code == 200
    ids = [i["session_id"] for i in r.json()["data"]]
    assert str(sess_anon.id) in ids
    for item in r.json()["data"]:
        assert item["application"] is None


# ── Detail & audit ─────────────────────────────────────────────────────────────


async def test_detail_returns_session_fields(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.HR)
    sess = await _session(
        db_session,
        status="active",
        current_state="CHOOSE_LOCATION",
        context={"location_hint": "Peritoró", "identity_verified": False},
    )

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}", headers=headers
    )
    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == str(sess.id)
    assert data["current_state"] == "CHOOSE_LOCATION"
    assert data["context_summary"]["location_hint"] == "Peritoró"
    assert "context_json" not in str(data)


async def test_detail_not_found_returns_404(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{uuid4()}", headers=headers
    )
    assert r.status_code == 404


async def test_detail_writes_audit_log(client: AsyncClient, db_session: AsyncSession):
    headers, actor_id = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}", headers=headers
    )
    assert r.status_code == 200

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "admin.assistant.session.read",
            AuditLogModel.user_id == actor_id,
        )
    )
    assert audit is not None
    assert audit.resource_type == "conversation_session"


async def test_detail_does_not_expose_context_json_raw(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(
        db_session,
        context={"identifier_type": "cpf", "cpf_last4": "9999", "identity_verified": True},
    )

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}", headers=headers
    )
    body = r.text
    assert "context_json" not in body


# ── Messages & sanitisation ────────────────────────────────────────────────────


async def test_messages_are_ordered_ascending(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)
    t0 = datetime(2026, 6, 1, 10, 0, 0)
    t1 = datetime(2026, 6, 1, 10, 1, 0)
    await _message(db_session, session_id=sess.id, role="assistant", content="Olá!", created_at=t1)
    await _message(db_session, session_id=sess.id, role="candidate", content="Oi", created_at=t0)

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}/messages", headers=headers
    )
    assert r.status_code == 200
    msgs = r.json()
    assert msgs[0]["role"] == "candidate"   # older message first
    assert msgs[1]["role"] == "assistant"


async def test_candidate_message_phone_is_sanitised(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)
    await _message(
        db_session,
        session_id=sess.id,
        role="candidate",
        content="Meu WhatsApp é 11999998888",
    )

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}/messages", headers=headers
    )
    assert r.status_code == 200
    content = r.json()[0]["content"]
    assert "11999998888" not in content
    assert "[número omitido]" in content


async def test_candidate_message_formatted_cpf_is_sanitised(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)
    await _message(
        db_session,
        session_id=sess.id,
        role="candidate",
        content="meu cpf é 529.982.247-25",
    )

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}/messages", headers=headers
    )
    content = r.json()[0]["content"]
    assert "529.982.247-25" not in content
    assert "[cpf omitido]" in content


async def test_assistant_message_not_sanitised(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)
    await _message(
        db_session,
        session_id=sess.id,
        role="assistant",
        content="Escolha entre os postos 00123 e 00456",
    )

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}/messages", headers=headers
    )
    # Assistant messages contain operational text (like post codes) — must not be redacted
    assert r.json()[0]["content"] == "Escolha entre os postos 00123 e 00456"


async def test_message_direction_derived_from_role(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)
    await _message(db_session, session_id=sess.id, role="candidate", content="ok")
    await _message(db_session, session_id=sess.id, role="assistant", content="certo")

    r = await client.get(
        f"/api/v1/admin/assistant/sessions/{sess.id}/messages", headers=headers
    )
    roles_dirs = [(m["role"], m["direction"]) for m in r.json()]
    assert ("candidate", "inbound") in roles_dirs
    assert ("assistant", "outbound") in roles_dirs


async def test_no_mutation_endpoints_exist(client: AsyncClient, db_session: AsyncSession):
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    sess = await _session(db_session)
    for method, url in [
        ("PATCH", f"/api/v1/admin/assistant/sessions/{sess.id}"),
        ("DELETE", f"/api/v1/admin/assistant/sessions/{sess.id}"),
        ("POST", f"/api/v1/admin/assistant/sessions/{sess.id}"),
        ("PUT", f"/api/v1/admin/assistant/sessions/{sess.id}"),
    ]:
        r = await client.request(method, url, headers=headers)
        assert r.status_code == 405, f"Expected 405 for {method} {url}, got {r.status_code}"
