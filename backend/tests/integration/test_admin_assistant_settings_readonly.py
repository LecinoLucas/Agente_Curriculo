from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.assistant_settings_catalog import (
    seed_assistant_configuration,
)
from src.domain.entities.user import UserRole
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _user_headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> tuple[dict[str, str], UUID]:
    email = f"assistant-settings-{role.value}-{uuid4()}@example.com"
    user = await _create_active_user(db_session, email, "password123", role)
    return await _auth_headers(client, email, "password123"), user.id


async def _seed_settings(db_session: AsyncSession) -> None:
    await seed_assistant_configuration(db_session)
    await db_session.commit()


async def test_states_returns_real_catalog_with_allowed_values_and_placeholders(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.get("/api/v1/admin/assistant/states", headers=headers)

    assert response.status_code == 200
    states = response.json()
    assert [item["state"] for item in states] == [
        "IDENTIFY",
        "VERIFY_OTP",
        "CHOOSE_LOCATION",
        "CHOOSE_UNIT_OR_ANY",
        "CHOOSE_FUNCTION",
        "CHOOSE_SHIFT",
        "SHOW_JOBS",
        "COLLECT_RESUME",
        "CONFIRM_APPLICATION",
        "DONE",
    ]

    by_state = {item["state"]: item for item in states}
    assert by_state["IDENTIFY"]["allowed_quick_reply_values"] == ["cpf", "whatsapp"]
    assert by_state["VERIFY_OTP"]["allowed_placeholders"] == [
        "attempts_remaining",
        "attempts_label",
    ]
    assert by_state["IDENTIFY"]["is_sensitive"] is True
    assert by_state["VERIFY_OTP"]["is_sensitive"] is True
    assert by_state["IDENTIFY"]["is_editable"] is False
    assert by_state["VERIFY_OTP"]["is_editable"] is False
    assert by_state["CHOOSE_SHIFT"]["is_editable"] is True


async def test_state_contents_lists_seeded_content_and_filters(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.HR)

    listed = await client.get("/api/v1/admin/assistant/state-contents", headers=headers)
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 10
    assert "context_json" not in listed.text

    filtered = await client.get(
        "/api/v1/admin/assistant/state-contents"
        "?state=CHOOSE_SHIFT&is_active=true&is_editable=true",
        headers=headers,
    )
    assert filtered.status_code == 200
    assert [item["state"] for item in filtered.json()] == ["CHOOSE_SHIFT"]
    assert filtered.json()[0]["prompt_text"] == "Qual turno você prefere?"


async def test_state_content_detail_returns_single_state(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.RECRUITER)

    response = await client.get(
        "/api/v1/admin/assistant/state-contents/CONFIRM_APPLICATION",
        headers=headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["state"] == "CONFIRM_APPLICATION"
    assert data["prompt_text"] == "Confirma que deseja seguir com essas informações?"
    assert data["is_editable"] is True


async def test_quick_replies_filters_by_state(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.get(
        "/api/v1/admin/assistant/quick-replies?state=CHOOSE_SHIFT",
        headers=headers,
    )

    assert response.status_code == 200
    items = response.json()
    assert [item["value"] for item in items] == [
        "morning",
        "afternoon",
        "night",
        "any",
    ]
    assert all(item["state"] == "CHOOSE_SHIFT" for item in items)


async def test_settings_masks_sensitive_values(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    response = await client.get("/api/v1/admin/assistant/settings", headers=headers)

    assert response.status_code == 200
    settings = {item["key"]: item for item in response.json()}
    assert settings["channels_enabled"]["is_sensitive"] is True
    assert settings["channels_enabled"]["value_json"] is None
    assert settings["default_max_attempts"]["is_sensitive"] is True
    assert settings["default_max_attempts"]["value_json"] is None
    assert settings["welcome_message"]["is_sensitive"] is False
    assert isinstance(settings["welcome_message"]["value_json"], str)
    assert "whatsapp" not in str(settings["channels_enabled"]["value_json"]).lower()


@pytest.mark.parametrize("role", [UserRole.VIEWER, UserRole.CANDIDATE])
async def test_viewer_and_candidate_are_blocked(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, role)

    response = await client.get("/api/v1/admin/assistant/settings", headers=headers)

    assert response.status_code in (401, 403)


async def test_mutable_settings_endpoints_are_not_available(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _seed_settings(db_session)
    headers, _ = await _user_headers(client, db_session, UserRole.ADMIN)

    post_response = await client.post(
        "/api/v1/admin/assistant/state-contents",
        headers=headers,
        json={"state": "CHOOSE_SHIFT"},
    )
    patch_response = await client.patch(
        "/api/v1/admin/assistant/state-contents/CHOOSE_SHIFT",
        headers=headers,
        json={"prompt_text": "Novo texto"},
    )
    delete_response = await client.delete(
        "/api/v1/admin/assistant/settings/channels_enabled",
        headers=headers,
    )

    assert post_response.status_code == 405
    assert patch_response.status_code == 405
    assert delete_response.status_code in (404, 405)
