from __future__ import annotations

from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    seed_assistant_configuration,
)
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.assistant_settings_model import (
    AssistantQuickReplyModel,
    AssistantSettingModel,
    AssistantStateContentModel,
)
from src.infrastructure.database.models.audit_model import AuditLogModel
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _user_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> tuple[dict[str, str], UUID]:
    email = f"assistant-patch-{role.value}-{uuid4()}@example.com"
    user = await _create_active_user(db_session, email, "password123", role)
    return await _auth_headers(client, email, "password123"), user.id


async def _seed(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    await db_session.commit()


async def _quick_reply_id(db_session: AsyncSession, state: str, value: str) -> UUID:
    qr = await db_session.scalar(
        sa.select(AssistantQuickReplyModel).where(
            AssistantQuickReplyModel.state == state,
            AssistantQuickReplyModel.value == value,
        )
    )
    assert qr is not None
    return qr.id


# ── State content PATCH ──────────────────────────────────────────────────────


async def test_admin_edits_editable_state_increments_version_and_audits(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, actor_id = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
        headers=headers,
        json={"prompt_text": "Qual turno combina com você?"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["prompt_text"] == "Qual turno combina com você?"
    assert data["version"] == 2  # seed version was 1

    refreshed = await db_session.scalar(
        sa.select(AssistantStateContentModel).where(
            AssistantStateContentModel.state == "CHOOSE_SHIFT"
        )
    )
    assert refreshed is not None
    assert refreshed.prompt_text == "Qual turno combina com você?"
    assert refreshed.version == 2

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "admin.assistant.state_content.update",
            AuditLogModel.user_id == actor_id,
        )
    )
    assert audit is not None
    assert audit.resource_type == "assistant_state_content"
    assert audit.before_state["prompt_text"] == "Qual turno você prefere?"
    assert audit.after_state["prompt_text"] == "Qual turno combina com você?"


async def test_allowed_placeholder_is_accepted(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_UNIT_OR_ANY",
        headers=headers,
        json={"prompt_text": "Você prefere um posto em {location_hint}?"},
    )

    assert response.status_code == 200
    assert response.json()["prompt_text"] == "Você prefere um posto em {location_hint}?"


async def test_unknown_placeholder_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
        headers=headers,
        json={"prompt_text": "Qual turno {desconhecido}?"},
    )

    assert response.status_code == 422


async def test_state_content_rejects_pii_text(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
        headers=headers,
        json={"prompt_text": "Me envie um e-mail para teste@example.com"},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("state", ["IDENTIFY", "VERIFY_OTP"])
async def test_sensitive_states_cannot_be_edited(
    client: AsyncClient,
    db_session: AsyncSession,
    state: str,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        f"/api/v1/admin/assistant/state-contents/{state}",
        headers=headers,
        json={"prompt_text": "Texto novo"},
    )

    assert response.status_code == 403


async def test_state_content_rejects_forbidden_fields(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    for payload in ({"state": "CHOOSE_FUNCTION"}, {"is_editable": True}, {"version": 9}):
        response = await client.patch(
            "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
            headers=headers,
            json=payload,
        )
        assert response.status_code == 422


@pytest.mark.parametrize("role", [UserRole.HR, UserRole.RECRUITER])
async def test_hr_and_recruiter_cannot_patch_state_content(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, role)

    response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
        headers=headers,
        json={"prompt_text": "Texto novo"},
    )

    assert response.status_code == 403


@pytest.mark.parametrize("role", [UserRole.VIEWER, UserRole.CANDIDATE])
async def test_viewer_and_candidate_cannot_patch_state_content(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, role)

    response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
        headers=headers,
        json={"prompt_text": "Texto novo"},
    )

    assert response.status_code in (401, 403)


# ── Quick reply PATCH ────────────────────────────────────────────────────────


async def test_admin_edits_quick_reply_label_and_audits(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, actor_id = await _user_headers(client, db_session, UserRole.ADMIN)
    qr_id = await _quick_reply_id(db_session, "CHOOSE_SHIFT", "morning")

    response = await client.patch(
        f"/api/v1/admin/assistant/quick-replies/{qr_id}",
        headers=headers,
        json={"label": "De manhã", "sort_order": 1, "is_active": True},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["label"] == "De manhã"
    assert data["value"] == "morning"  # value never changes

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "admin.assistant.quick_reply.update",
            AuditLogModel.user_id == actor_id,
        )
    )
    assert audit is not None
    assert audit.before_state["label"] == "Manhã"
    assert audit.after_state["label"] == "De manhã"


async def test_quick_reply_value_cannot_be_changed(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    qr_id = await _quick_reply_id(db_session, "CHOOSE_SHIFT", "morning")

    response = await client.patch(
        f"/api/v1/admin/assistant/quick-replies/{qr_id}",
        headers=headers,
        json={"value": "night"},
    )

    assert response.status_code == 422
    refreshed = await db_session.get(AssistantQuickReplyModel, qr_id)
    assert refreshed is not None
    assert refreshed.value == "morning"


async def test_quick_reply_label_with_pii_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    qr_id = await _quick_reply_id(db_session, "CHOOSE_SHIFT", "morning")

    response = await client.patch(
        f"/api/v1/admin/assistant/quick-replies/{qr_id}",
        headers=headers,
        json={"label": "Ligue 11 99999-8888"},
    )

    assert response.status_code == 422


async def test_quick_reply_of_sensitive_state_cannot_be_edited(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)
    qr_id = await _quick_reply_id(db_session, "IDENTIFY", "cpf")

    response = await client.patch(
        f"/api/v1/admin/assistant/quick-replies/{qr_id}",
        headers=headers,
        json={"label": "Outro rótulo"},
    )

    assert response.status_code == 403


# ── Settings PATCH ───────────────────────────────────────────────────────────


async def test_admin_edits_non_sensitive_setting_and_audits(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, actor_id = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/settings/welcome_message",
        headers=headers,
        json={"value_json": "Bem-vindo! Vamos começar?"},
    )

    assert response.status_code == 200
    assert response.json()["value_json"] == "Bem-vindo! Vamos começar?"

    refreshed = await db_session.get(AssistantSettingModel, "welcome_message")
    assert refreshed is not None
    assert refreshed.value_json == "Bem-vindo! Vamos começar?"
    assert refreshed.updated_by == actor_id

    audit = await db_session.scalar(
        sa.select(AuditLogModel).where(
            AuditLogModel.action == "admin.assistant.setting.update",
            AuditLogModel.user_id == actor_id,
        )
    )
    assert audit is not None


async def test_sensitive_setting_cannot_be_changed(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/settings/session_expiration_minutes",
        headers=headers,
        json={"value_json": 120},
    )

    assert response.status_code == 403
    refreshed = await db_session.get(AssistantSettingModel, "session_expiration_minutes")
    assert refreshed is not None
    assert refreshed.value_json == 60


async def test_channels_enabled_with_whatsapp_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/settings/channels_enabled",
        headers=headers,
        json={"value_json": ["web", "whatsapp"]},
    )

    assert response.status_code == 422


async def test_default_max_attempts_out_of_range_is_rejected(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/settings/default_max_attempts",
        headers=headers,
        json={"value_json": 9},
    )

    assert response.status_code == 422


async def test_assistant_enabled_cannot_be_disabled(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.patch(
        "/api/v1/admin/assistant/settings/assistant_enabled",
        headers=headers,
        json={"value_json": False},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("role", [UserRole.HR, UserRole.RECRUITER, UserRole.VIEWER])
async def test_non_admin_cannot_patch_settings(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
):
    await _seed(db_session)
    headers, _ = await _user_headers(client, db_session, role)

    response = await client.patch(
        "/api/v1/admin/assistant/settings/welcome_message",
        headers=headers,
        json={"value_json": "Texto novo"},
    )

    assert response.status_code in (401, 403)
