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
async def test_ai_usage_returns_aggregates(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    db_session.add_all(
        [
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                operation="resume_analysis",
                input_tokens=100,
                output_tokens=40,
                total_tokens=140,
                latency_ms=1200,
                status="success",
            ),
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                operation="resume_analysis",
                input_tokens=60,
                output_tokens=10,
                total_tokens=70,
                latency_ms=1800,
                status="failed",
                error_message="timeout",
            ),
            AIUsageLogModel(
                provider="anthropic",
                model="claude-sonnet-4-6",
                operation="job_profile",
                input_tokens=30,
                output_tokens=20,
                total_tokens=50,
                latency_ms=900,
                status="success",
            ),
        ]
    )
    await db_session.commit()

    response = await client.get("/api/v1/admin/health/ai-usage", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_calls"] == 3
    assert body["successful_calls"] == 2
    assert body["failed_calls"] == 1
    assert body["input_tokens"] == 190
    assert body["output_tokens"] == 70
    assert body["total_tokens"] == 260
    assert len(body["by_provider"]) == 2
    assert len(body["by_model"]) == 2


@pytest.mark.asyncio
async def test_ai_usage_works_without_records(
    client: AsyncClient,
    db_session: AsyncSession,
):
    headers = await _admin_headers(client, db_session)

    response = await client.get("/api/v1/admin/health/ai-usage", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total_calls"] == 0
    assert body["successful_calls"] == 0
    assert body["failed_calls"] == 0
    assert body["by_provider"] == []
    assert body["by_model"] == []
    assert body["daily_usage"] == []


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
