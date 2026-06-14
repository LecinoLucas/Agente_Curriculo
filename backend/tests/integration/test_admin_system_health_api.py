from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel, PromptTemplateModel

from .helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "admin-health@test.com", "password123", UserRole.ADMIN)
    return await _auth_headers(client, "admin-health@test.com", "password123")


async def _recruiter_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "recruiter-health@test.com", "password123", UserRole.RECRUITER)
    return await _auth_headers(client, "recruiter-health@test.com", "password123")


@pytest.mark.asyncio
async def test_admin_can_access_health_overview(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/overview", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["environment"] == settings.APP_ENV
    assert body["backend"]["status"] == "ok"
    assert "uptime_seconds" in body


@pytest.mark.asyncio
async def test_non_admin_receives_403_on_health_overview(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _recruiter_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/overview", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_database_health_returns_ok(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/database", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "pool_info" in body
    assert "DATABASE_URL" not in response.text


@pytest.mark.asyncio
async def test_legacy_ai_usage_endpoint_removed(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/ai-usage", headers=headers)

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_ai_usage_center_returns_grouped_operational_payload(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    db_session.add_all(
        [
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                operation="job_ai_draft",
                input_tokens=200,
                output_tokens=50,
                total_tokens=250,
                latency_ms=1400,
                status="success",
                estimated_cost_usd=Decimal("0.120000"),
            ),
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                operation=None,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                latency_ms=None,
                status="rate_limited",
                error_message="429 rate limit. Bearer secret-token",
                estimated_cost_usd=None,
            ),
            AIUsageLogModel(
                provider="anthropic",
                model="claude-sonnet-4-6",
                operation="resume_analysis",
                input_tokens=80,
                output_tokens=20,
                total_tokens=100,
                latency_ms=2100,
                status="weird_status",
                error_message="api_key=abc123 prompt completo do candidato",
                estimated_cost_usd=Decimal("0.045000"),
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_calls"] == 3
    assert body["summary"]["success_calls"] == 1
    assert body["summary"]["rate_limited_calls"] == 1
    assert body["summary"]["unknown_calls"] == 1
    assert body["summary"]["total_tokens"] == 350
    assert body["summary"]["estimated_cost_usd"] == 0.165
    assert len(body["by_operation"]) == 3
    assert body["by_operation"][0]["operation"] == "job_ai_draft"
    assert body["gaps"]["unknown_operation_count"] == 1
    assert body["gaps"]["missing_token_count"] == 1
    assert body["gaps"]["missing_cost_count"] == 1
    assert body["gaps"]["unknown_status_count"] == 1
    assert "ai_assistant_without_dedicated_operation_logs" in body["gaps"]["warnings"]
    assert len(body["by_model"]) == 2
    assert body["recent_events"][0]["safe_error_message"] is not None
    assert "Bearer secret-token" not in response.text
    assert "api_key=abc123" not in response.text


@pytest.mark.asyncio
async def test_ai_usage_center_is_admin_only(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _recruiter_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_ai_usage_center_works_without_records(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_calls"] == 0
    assert body["by_operation"] == []
    assert body["by_model"] == []
    assert body["recent_events"] == []


@pytest.mark.asyncio
async def test_health_endpoints_do_not_expose_api_keys(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = await _admin_headers(client, db_session)
    # GOOGLE_API_KEY foi rotacionado para GOOGLE_API_KEY_1..5 (key rotation).
    monkeypatch.setattr(settings, "GOOGLE_API_KEY_1", "super-secret-google-key")

    response = await client.get("/api/v1/admin/health/overview", headers=headers)

    assert response.status_code == 200
    assert "super-secret-google-key" not in response.text
    assert response.json()["ai_provider"]["configured_provider"] == settings.AI_PROVIDER


@pytest.mark.asyncio
async def test_admin_can_access_ai_provider_health_without_sensitive_data(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = await _admin_headers(client, db_session)
    monkeypatch.setattr(settings, "GOOGLE_API_KEY_1", "super-secret-google-key")
    db_session.add(
        AIProviderHealthModel(
            provider="google",
            model_id="gemini-2.5-flash",
            status="rate_limited",
            configured_key_count=2,
            available_key_count=0,
            cooldown_until=datetime.now(UTC) + timedelta(minutes=5),
            last_error_type="rate_limited",
            last_status_code=429,
            last_error_at=datetime.now(UTC),
            consecutive_rate_limit_count=3,
        )
    )
    await db_session.commit()

    response = await client.get("/api/v1/admin/ai-provider-health", headers=headers)

    assert response.status_code == 200
    assert "super-secret-google-key" not in response.text
    body = response.json()
    assert body[0]["provider"] == "google"
    assert body[0]["status"] == "rate_limited"
    assert body[0]["last_error_type"] == "rate_limited"
    assert "api_key" not in response.text.lower()
    assert "prompt" not in response.text.lower()


@pytest.mark.asyncio
async def test_non_admin_cannot_access_ai_provider_health(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _recruiter_headers(client, db_session)

    response = await client.get("/api/v1/admin/ai-provider-health", headers=headers)

    assert response.status_code == 403
