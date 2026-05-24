from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_provider_credential_service import AIProviderCredentialService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.ai_provider_credential_model import AIProviderCredentialModel
from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel

from .helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "admin-ai-creds@test.com", "password123", UserRole.ADMIN)
    return await _auth_headers(client, "admin-ai-creds@test.com", "password123")


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "recruiter-ai-creds@test.com", "password123", UserRole.RECRUITER)
    return await _auth_headers(client, "recruiter-ai-creds@test.com", "password123")


@pytest.mark.asyncio
async def test_admin_creates_encrypted_ai_provider_credential(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    raw_key = "AIzaSECRET1234567890ABCD"

    response = await client.post(
        "/api/v1/admin/ai-provider-credentials",
        headers=headers,
        json={
            "provider": "gemini",
            "model_id": "gemini-2.5-flash",
            "label": "Gemini principal",
            "api_key": raw_key,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["provider"] == "google"
    assert body["key_last4"] == "ABCD"
    assert body["masked_key"] == "****...ABCD"
    assert raw_key not in response.text
    assert "encrypted_api_key" not in response.text

    credential = await db_session.scalar(sa.select(AIProviderCredentialModel))
    assert credential is not None
    assert credential.encrypted_api_key != raw_key
    assert raw_key not in credential.encrypted_api_key


@pytest.mark.asyncio
async def test_admin_lists_only_masked_ai_provider_credentials(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    await client.post(
        "/api/v1/admin/ai-provider-credentials",
        headers=headers,
        json={
            "provider": "anthropic",
            "label": "Claude principal",
            "api_key": "sk-ant-secret-WXYZ",
        },
    )

    response = await client.get("/api/v1/admin/ai-provider-credentials", headers=headers)

    assert response.status_code == 200
    assert "sk-ant-secret-WXYZ" not in response.text
    assert "encrypted_api_key" not in response.text
    body = response.json()
    assert body[0]["masked_key"] == "****...WXYZ"
    assert body[0]["key_last4"] == "WXYZ"
    assert "api_key" not in body[0]
    assert "encrypted_api_key" not in body[0]


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_ai_provider_credentials(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _recruiter_headers(client, db_session)

    response = await client.get("/api/v1/admin/ai-provider-credentials", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_rotate_disable_enable_do_not_return_secret_and_update_status(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    create_response = await client.post(
        "/api/v1/admin/ai-provider-credentials",
        headers=headers,
        json={
            "provider": "google",
            "model_id": "gemini-test",
            "label": "Gemini rotacionavel",
            "api_key": "first-secret-1111",
        },
    )
    credential_id = create_response.json()["id"]

    rotate_response = await client.patch(
        f"/api/v1/admin/ai-provider-credentials/{credential_id}/rotate",
        headers=headers,
        json={"api_key": "second-secret-2222"},
    )

    assert rotate_response.status_code == 200
    assert rotate_response.json()["key_last4"] == "2222"
    assert rotate_response.json()["masked_key"] == "****...2222"
    assert "second-secret-2222" not in rotate_response.text
    assert "encrypted_api_key" not in rotate_response.text

    disable_response = await client.patch(
        f"/api/v1/admin/ai-provider-credentials/{credential_id}/disable",
        headers=headers,
    )
    assert disable_response.status_code == 200
    assert disable_response.json()["status"] == "disabled"

    enable_response = await client.patch(
        f"/api/v1/admin/ai-provider-credentials/{credential_id}/enable",
        headers=headers,
    )
    assert enable_response.status_code == 200
    assert enable_response.json()["status"] == "active"


@pytest.mark.asyncio
async def test_audit_log_for_admin_actions_never_contains_api_key(
    client: AsyncClient,
    db_session: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    headers = await _admin_headers(client, db_session)
    raw_key = "audit-secret-ABCD"

    with caplog.at_level("INFO"):
        response = await client.post(
            "/api/v1/admin/ai-provider-credentials",
            headers=headers,
            json={
                "provider": "anthropic",
                "label": "Claude auditavel",
                "api_key": raw_key,
            },
        )
        credential_id = response.json()["id"]
        await client.patch(
            f"/api/v1/admin/ai-provider-credentials/{credential_id}/rotate",
            headers=headers,
            json={"api_key": "rotated-secret-WXYZ"},
        )

    rows = (
        await db_session.execute(
            sa.select(AuditLogModel).where(AuditLogModel.resource_type == "ai_provider_credential")
        )
    ).scalars().all()

    assert {row.action for row in rows} >= {
        "ai_provider_credential.created",
        "ai_provider_credential.rotated",
    }
    serialized = repr(
        [
            {
                "metadata": row.metadata_,
                "before_state": row.before_state,
                "after_state": row.after_state,
            }
            for row in rows
        ]
    )
    assert raw_key not in serialized
    assert "rotated-secret-WXYZ" not in serialized
    assert "encrypted_api_key" not in serialized
    assert "api_key" not in serialized
    assert raw_key not in caplog.text
    assert "rotated-secret-WXYZ" not in caplog.text
    assert "encrypted_api_key" not in caplog.text


@pytest.mark.asyncio
async def test_get_available_credentials_ignores_disabled_and_cooldown(
    db_session: AsyncSession,
) -> None:
    service = AIProviderCredentialService(db_session)
    active = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="active-key",
        raw_api_key="active-secret-1111",
        actor=None,
    )
    disabled = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="disabled-key",
        raw_api_key="disabled-secret-2222",
        actor=None,
    )
    limited = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="limited-key",
        raw_api_key="limited-secret-3333",
        actor=None,
    )
    await service.disable_credential(disabled.id, actor=None)
    await service.mark_rate_limited(
        limited.id,
        cooldown_until=datetime.now(UTC) + timedelta(minutes=10),
        error_type="rate_limited",
    )
    await db_session.commit()

    available = await service.get_available_credentials(provider="google", model_id="gemini-test")

    assert [item.id for item in available] == [active.id]
    assert available[0].api_key == "active-secret-1111"


@pytest.mark.asyncio
async def test_get_available_credentials_ignores_invalid_and_active_future_cooldown(
    db_session: AsyncSession,
) -> None:
    service = AIProviderCredentialService(db_session)
    active = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="active-key",
        raw_api_key="active-secret-1111",
        actor=None,
    )
    invalid = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="invalid-key",
        raw_api_key="invalid-secret-2222",
        actor=None,
    )
    future_cooldown = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="future-cooldown-key",
        raw_api_key="cooldown-secret-3333",
        actor=None,
    )
    await service.mark_invalid(invalid.id, error_type="invalid_api_key")
    future_cooldown.cooldown_until = datetime.now(UTC) + timedelta(minutes=10)
    await db_session.commit()

    available = await service.get_available_credentials(provider="google", model_id="gemini-test")

    assert [item.id for item in available] == [active.id]


@pytest.mark.asyncio
async def test_mark_rate_limited_updates_provider_health_without_duplicate(
    db_session: AsyncSession,
) -> None:
    service = AIProviderCredentialService(db_session)
    credential = await service.create_credential(
        provider="google",
        model_id="gemini-test",
        label="limited-key",
        raw_api_key="limited-secret-3333",
        actor=None,
    )
    await service.mark_rate_limited(
        credential.id,
        cooldown_until=datetime.now(UTC) + timedelta(minutes=10),
        error_type="rate_limited",
    )
    await service.mark_rate_limited(
        credential.id,
        cooldown_until=datetime.now(UTC) + timedelta(minutes=10),
        error_type="rate_limited",
    )
    await db_session.commit()

    rows = (await db_session.execute(sa.select(AIProviderHealthModel))).scalars().all()
    assert len(rows) == 1
    assert rows[0].provider == "google"
    assert rows[0].model_id == "gemini-test"
    assert rows[0].status == "rate_limited"
    assert rows[0].configured_key_count == 1
    assert rows[0].available_key_count == 0
    assert rows[0].consecutive_rate_limit_count == 2
