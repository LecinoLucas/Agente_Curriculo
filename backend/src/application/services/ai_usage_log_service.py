from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Callable
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.ai_pricing import estimate_ai_cost_usd
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class AIUsageLogPayload:
    provider: str
    model: str
    status: str
    operation: str | None = None
    analysis_id: UUID | None = None
    candidate_id: UUID | None = None
    job_id: UUID | None = None
    input_tokens: int | None = 0
    output_tokens: int | None = 0
    latency_ms: int | None = None
    error_message: str | None = None


def _normalize_error_message(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:2000]


def _build_model(payload: AIUsageLogPayload) -> AIUsageLogModel:
    input_tokens = int(payload.input_tokens or 0)
    output_tokens = int(payload.output_tokens or 0)
    total_tokens = input_tokens + output_tokens
    estimated_cost = estimate_ai_cost_usd(
        payload.model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )

    return AIUsageLogModel(
        provider=payload.provider,
        model=payload.model,
        operation=payload.operation,
        analysis_id=payload.analysis_id,
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        estimated_cost_usd=estimated_cost,
        latency_ms=payload.latency_ms,
        status=payload.status,
        error_message=_normalize_error_message(payload.error_message),
    )


async def persist_ai_usage_log(session: AsyncSession, payload: AIUsageLogPayload) -> AIUsageLogModel:
    row = _build_model(payload)
    session.add(row)
    await session.flush()
    return row


async def safe_persist_ai_usage_log(
    session_factory: async_sessionmaker | Callable[[], AsyncSession],
    payload: AIUsageLogPayload,
) -> None:
    try:
        session = session_factory()
        async with session as managed_session:
            await persist_ai_usage_log(managed_session, payload)
            await managed_session.commit()
    except Exception as exc:
        logger.warning(
            "ai_usage_log.persist_failed",
            provider=payload.provider,
            model=payload.model,
            operation=payload.operation,
            error=str(exc),
        )
