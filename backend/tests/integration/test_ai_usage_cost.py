"""Integration tests for cost computation on the AI usage admin endpoint.

Covers the contract:
- `(provider, model_id)` configured ⇒ row persisted with `estimated_cost_usd` > 0
  and the aggregator returns a positive total.
- Unknown model ⇒ row persisted with `estimated_cost_usd = NULL` and, when all
  rows are NULL, the aggregator returns NULL (UI shows "Custo não configurado").
- Mixed rows ⇒ aggregator sums only the priced rows.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_usage_log_service import (
    AIUsageLogPayload,
    persist_ai_usage_log,
)
from src.domain.entities.user import UserRole

from .helpers import _auth_headers, _create_active_user


async def _admin_headers(client: AsyncClient, db_session: AsyncSession) -> dict[str, str]:
    await _create_active_user(db_session, "billing-admin@test.com", "password123", UserRole.ADMIN)
    return await _auth_headers(client, "billing-admin@test.com", "password123")


@pytest.mark.asyncio
async def test_persist_records_cost_for_configured_model(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    row = await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-2.5-flash",
            status="success",
            operation="resume_analysis",
            input_tokens=100_000,
            output_tokens=50_000,
            latency_ms=900,
        ),
    )
    await db_session.commit()

    assert row.estimated_cost_usd is not None
    # 100k input * 0.30/1M + 50k output * 2.50/1M = 0.03 + 0.125 = 0.155
    assert Decimal(row.estimated_cost_usd) == Decimal("0.155")


@pytest.mark.asyncio
async def test_persist_records_null_for_unknown_model(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    row = await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-99-unobtanium",
            status="success",
            input_tokens=1000,
            output_tokens=500,
        ),
    )
    await db_session.commit()
    assert row.estimated_cost_usd is None


@pytest.mark.asyncio
async def test_ai_usage_aggregator_returns_total_cost(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-2.5-flash",
            status="success",
            operation="resume_analysis",
            input_tokens=1_000_000,
            output_tokens=0,
        ),
    )
    await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-2.5-flash",
            status="success",
            operation="resume_analysis",
            input_tokens=0,
            output_tokens=1_000_000,
        ),
    )
    await db_session.commit()

    headers = await _admin_headers(client, db_session)
    response = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_calls"] == 2
    # 0.30 (input) + 2.50 (output) = 2.80
    assert body["summary"]["estimated_cost_usd"] is not None
    assert Decimal(str(body["summary"]["estimated_cost_usd"])) == Decimal("2.80")


@pytest.mark.asyncio
async def test_ai_usage_aggregator_returns_null_when_all_costs_missing(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """All rows from an unconfigured model ⇒ aggregator returns null
    (UI continues showing 'Custo não configurado')."""
    await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-99-unobtanium",
            status="success",
            input_tokens=10_000,
            output_tokens=5_000,
        ),
    )
    await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-99-unobtanium",
            status="success",
            input_tokens=10_000,
            output_tokens=5_000,
        ),
    )
    await db_session.commit()

    headers = await _admin_headers(client, db_session)
    response = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_calls"] == 2
    assert body["summary"]["estimated_cost_usd"] is None


@pytest.mark.asyncio
async def test_pricing_catalog_lists_configured_models(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers = await _admin_headers(client, db_session)
    response = await client.get("/api/v1/admin/health/ai-usage/pricing", headers=headers)
    assert response.status_code == 200
    body = response.json()
    items = body["items"]
    gemini = next(
        (i for i in items if i["provider"] == "google" and i["model"] == "gemini-2.5-flash"),
        None,
    )
    assert gemini is not None
    assert gemini["status"] == "configured"
    assert Decimal(str(gemini["input_per_1m_tokens"])) == Decimal("0.30")
    assert Decimal(str(gemini["output_per_1m_tokens"])) == Decimal("2.50")
    assert gemini["source"]
    assert gemini["last_reviewed_at"]


@pytest.mark.asyncio
async def test_pricing_catalog_flags_unobserved_provider_model_as_not_configured(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """An (provider, model) pair seen in usage logs but not in AI_MODEL_PRICING
    must show up as status=not_configured so admins know what to add."""
    from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
    db_session.add(
        AIUsageLogModel(
            provider="openai",
            model="gpt-99-unknown",
            status="success",
            input_tokens=100,
            output_tokens=50,
            total_tokens=150,
        )
    )
    await db_session.commit()

    headers = await _admin_headers(client, db_session)
    response = await client.get("/api/v1/admin/health/ai-usage/pricing", headers=headers)
    body = response.json()
    missing = [
        i for i in body["items"]
        if i["provider"] == "openai" and i["model"] == "gpt-99-unknown"
    ]
    assert len(missing) == 1
    assert missing[0]["status"] == "not_configured"
    assert missing[0]["input_per_1m_tokens"] is None
    assert missing[0]["output_per_1m_tokens"] is None


@pytest.mark.asyncio
async def test_backfill_recomputes_costs_for_legacy_null_rows(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Rows inserted before pricing was configured (estimated_cost_usd=NULL) get
    a recomputed cost as long as (provider, model) is priced now."""
    from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel

    db_session.add_all(
        [
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                status="success",
                input_tokens=1_000_000,
                output_tokens=0,
                total_tokens=1_000_000,
            ),
            AIUsageLogModel(
                provider="google",
                model="gemini-2.5-flash",
                status="success",
                input_tokens=0,
                output_tokens=1_000_000,
                total_tokens=1_000_000,
            ),
            AIUsageLogModel(
                provider="openai",
                model="gpt-99-unknown",
                status="success",
                input_tokens=9999,
                output_tokens=9999,
                total_tokens=19998,
            ),
        ]
    )
    await db_session.commit()

    headers = await _admin_headers(client, db_session)
    response = await client.post(
        "/api/v1/admin/health/ai-usage/backfill-costs", headers=headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total_null_rows"] == 3
    assert body["updated"] == 2
    assert body["skipped_unpriced"] == 1

    # After backfill, the aggregator returns a positive estimated_cost_usd
    summary = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)
    assert summary.status_code == 200
    s = summary.json()
    assert s["summary"]["estimated_cost_usd"] is not None
    assert Decimal(str(s["summary"]["estimated_cost_usd"])) == Decimal("2.80")


@pytest.mark.asyncio
async def test_backfill_is_idempotent(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Running backfill twice must not double-count or change priced rows."""
    from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel

    db_session.add(
        AIUsageLogModel(
            provider="google",
            model="gemini-2.5-flash",
            status="success",
            input_tokens=1_000_000,
            output_tokens=0,
            total_tokens=1_000_000,
        )
    )
    await db_session.commit()

    headers = await _admin_headers(client, db_session)
    first = await client.post(
        "/api/v1/admin/health/ai-usage/backfill-costs", headers=headers
    )
    second = await client.post(
        "/api/v1/admin/health/ai-usage/backfill-costs", headers=headers
    )
    assert first.json()["updated"] == 1
    assert second.json()["updated"] == 0
    assert second.json()["total_null_rows"] == 0


@pytest.mark.asyncio
async def test_backfill_requires_admin(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Non-admin users get 403 on backfill."""
    await _create_active_user(db_session, "recruiter-rl@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "recruiter-rl@test.com", "password123")
    response = await client.post(
        "/api/v1/admin/health/ai-usage/backfill-costs", headers=headers
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_ai_usage_aggregator_skips_null_rows_when_partial(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Mixed configured + unconfigured ⇒ aggregator sums only configured rows."""
    await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-2.5-flash",
            status="success",
            input_tokens=1_000_000,
            output_tokens=0,
        ),
    )
    await persist_ai_usage_log(
        db_session,
        AIUsageLogPayload(
            provider="google",
            model="gemini-99-unobtanium",  # unpriced
            status="success",
            input_tokens=999_999_999,
            output_tokens=999_999_999,
        ),
    )
    await db_session.commit()

    headers = await _admin_headers(client, db_session)
    response = await client.get("/api/v1/admin/health/ai-usage-center", headers=headers)
    body = response.json()
    assert body["summary"]["total_calls"] == 2
    # Only the gemini-2.5-flash row contributes (0.30); the unconfigured row is skipped.
    assert body["summary"]["estimated_cost_usd"] is not None
    assert Decimal(str(body["summary"]["estimated_cost_usd"])) == Decimal("0.30")
