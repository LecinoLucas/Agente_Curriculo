from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_provider_health_service import AIProviderHealthService
from src.infrastructure.database.models.ai_provider_health_model import AIProviderHealthModel


@pytest.mark.asyncio
async def test_record_rate_limited_persists_health_and_alerts_once(
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    warning = MagicMock()
    monkeypatch.setattr("src.application.services.ai_provider_health_service.logger.warning", warning)
    monkeypatch.setattr("src.application.services.ai_provider_health_service.settings.AI_RATE_LIMIT_ADMIN_ALERT_COOLDOWN_SECONDS", 900)

    service = AIProviderHealthService(db_session)
    cooldown_until = datetime.now(UTC) + timedelta(minutes=10)

    await service.record_rate_limited(
        provider="google",
        model_id="gemini-2.5-flash",
        retry_after_seconds=600,
        cooldown_until=cooldown_until,
        configured_key_count=2,
        available_key_count=0,
    )
    await service.record_rate_limited(
        provider="google",
        model_id="gemini-2.5-flash",
        retry_after_seconds=600,
        cooldown_until=cooldown_until,
        configured_key_count=2,
        available_key_count=0,
    )
    await db_session.commit()

    health = await db_session.scalar(sa.select(AIProviderHealthModel))

    assert health is not None
    assert health.status == "rate_limited"
    assert health.configured_key_count == 2
    assert health.available_key_count == 0
    assert health.last_error_type == "rate_limited"
    assert health.last_status_code == 429
    assert health.consecutive_rate_limit_count == 2
    assert warning.call_count == 1
    assert warning.call_args.args[0] == "ai_provider.rate_limited_admin_alert"
