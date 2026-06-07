from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Callable, Literal
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from src.core.ai_pricing import estimate_ai_cost
from src.core.settings import settings
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


Period = Literal["today", "7d", "30d"]


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
    estimated_cost = estimate_ai_cost(
        payload.provider,
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


class AIUsageService:
    """Read-only usage summary plus safe usage recording.

    This service intentionally stores and returns only aggregate/operational
    metadata. It does not persist prompts, raw responses, resumes, OCR payloads
    or embeddings.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record_usage(self, payload: AIUsageLogPayload) -> AIUsageLogModel:
        return await persist_ai_usage_log(self._session, payload)

    async def get_usage_summary(self, period: Period = "today") -> dict[str, Any]:
        rows = await self._list_rows(period=period)
        by_feature: dict[str, dict[str, Any]] = {}

        totals = {
            "requests": len(rows),
            "input_tokens": sum(int(row.input_tokens or 0) for row in rows),
            "output_tokens": sum(int(row.output_tokens or 0) for row in rows),
            "total_tokens": sum(int(row.total_tokens or 0) for row in rows),
            "errors": sum(1 for row in rows if row.status != "success"),
        }

        for row in rows:
            feature = row.operation or "unknown"
            bucket = by_feature.setdefault(
                feature,
                {
                    "feature": feature,
                    "requests": 0,
                    "total_tokens": 0,
                    "errors": 0,
                },
            )
            bucket["requests"] += 1
            bucket["total_tokens"] += int(row.total_tokens or 0)
            if row.status != "success":
                bucket["errors"] += 1

        recent = [
            {
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "feature": row.operation or "unknown",
                "provider": row.provider,
                "model": row.model,
                "total_tokens": int(row.total_tokens or 0),
                "status": row.status,
            }
            for row in sorted(rows, key=lambda item: item.created_at or datetime.min.replace(tzinfo=UTC), reverse=True)[:20]
        ]

        warnings: list[str] = []
        gemini_key_configured = _gemini_api_key_configured()

        if not gemini_key_configured:
            warnings.append("gemini_api_key_not_configured")
        if not settings.RAG_SYNTHESIS_ENABLED:
            warnings.append("rag_synthesis_disabled")
        if settings.PROTHEUS_REAL_SEND_ENABLED or settings.ERP_ALLOW_REAL_SEND:
            warnings.append("protheus_real_send_enabled")

        return {
            "ok": True,
            "period": period,
            "status": {
                "assistant_enabled": True,
                "free_text_enabled": False,
                "rag_synthesis_enabled": settings.RAG_SYNTHESIS_ENABLED,
                "gemini_embedding_enabled": settings.RAG_GEMINI_EMBEDDING_ENABLED,
                "protheus_real_send_enabled": settings.PROTHEUS_REAL_SEND_ENABLED,
                "gemini_api_key_configured": gemini_key_configured,
            },
            "totals": totals,
            "by_feature": sorted(by_feature.values(), key=lambda item: item["feature"]),
            "recent": recent,
            "warnings": warnings,
        }

    async def _list_rows(self, period: Period) -> list[AIUsageLogModel]:
        start = _period_start(period)
        result = await self._session.execute(
            sa.select(AIUsageLogModel)
            .where(AIUsageLogModel.created_at >= start)
            .order_by(AIUsageLogModel.created_at.desc())
        )
        return list(result.scalars().all())


def _period_start(period: Period) -> datetime:
    now = datetime.now(UTC)
    if period == "7d":
        return now - timedelta(days=7)
    if period == "30d":
        return now - timedelta(days=30)
    return datetime.combine(now.date(), time.min, tzinfo=UTC)


def _gemini_api_key_configured() -> bool:
    return any(
        key.strip()
        for key in (
            settings.GOOGLE_API_KEY_1,
            settings.GOOGLE_API_KEY_2,
            settings.GOOGLE_API_KEY_3,
            settings.GOOGLE_API_KEY_4,
            settings.GOOGLE_API_KEY_5,
        )
    )
