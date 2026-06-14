from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
import asyncio
import time as time_module
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.ai_pricing import AI_MODEL_PRICING, estimate_ai_cost
from src.core.app_metadata import APP_VERSION, PROCESS_STARTED_MONOTONIC
from src.core.log_sanitizer import sanitize_log_text
from src.core.settings import settings
from src.infrastructure.ai.gemini_adapter import get_gemini_key_health
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.database.connection import engine
from src.infrastructure.database.models.ai_usage_log_model import AIUsageLogModel
from src.infrastructure.database.models.analysis_model import AIModelModel, AnalysisModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.queue.celery_app import celery_app


@dataclass(slots=True)
class AIUsageQuery:
    date_from: date | None = None
    date_to: date | None = None
    provider: str | None = None
    model: str | None = None


def _status_rank(status: str) -> int:
    if status == "down":
        return 0
    if status in {"degraded", "unknown"}:
        return 1
    return 2


def _to_window(query: AIUsageQuery) -> tuple[datetime | None, datetime | None]:
    start = (
        datetime.combine(query.date_from, time.min, tzinfo=UTC)
        if query.date_from is not None
        else None
    )
    end = (
        datetime.combine(query.date_to + timedelta(days=1), time.min, tzinfo=UTC)
        if query.date_to is not None
        else None
    )
    return start, end


class SystemHealthService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_overview(self) -> dict[str, Any]:
        database = await self._get_database_ping()
        redis = await self._get_redis_health()
        ai_provider = self._get_ai_provider_health()

        last_analysis_at = await self._session.scalar(sa.select(sa.func.max(AnalysisModel.created_at)))
        pending_analyses = await self._count_analyses({"pending"})
        processing_analyses = await self._count_analyses({"processing"})
        failed_analyses_24h = await self._count_failed_analyses_since(datetime.now(UTC) - timedelta(hours=24))

        status = "ok"
        if database["status"] != "ok":
            status = "down"
        elif any(_status_rank(item["status"]) < _status_rank("ok") for item in (redis, ai_provider)):
            status = "degraded"

        return {
            "status": status,
            "environment": settings.APP_ENV,
            "version": APP_VERSION,
            "uptime_seconds": max(0, int(time_module.monotonic() - PROCESS_STARTED_MONOTONIC)),
            "backend": {"status": "ok"},
            "database": database,
            "redis": redis,
            "ai_provider": ai_provider,
            "last_analysis_at": last_analysis_at,
            "pending_analyses": pending_analyses,
            "processing_analyses": processing_analyses,
            "failed_analyses_24h": failed_analyses_24h,
        }

    async def get_ai_usage_center(self, query: AIUsageQuery) -> dict[str, Any]:
        rows = await self._list_ai_usage_rows(query)
        pricing_catalog = await self.get_pricing_catalog()

        summary = self._usage_center_bucket({})
        by_operation: dict[str, dict[str, Any]] = {}
        by_model: dict[str, dict[str, Any]] = {}

        unknown_operation_count = 0
        missing_token_count = 0
        missing_cost_count = 0
        unknown_status_count = 0

        for row in rows:
            operation = row.operation or "unknown"
            normalized_status = self._normalize_ai_usage_status(row.status)
            if row.operation is None:
                unknown_operation_count += 1
            if int(row.total_tokens or 0) <= 0:
                missing_token_count += 1
            if row.estimated_cost_usd is None:
                missing_cost_count += 1
            if normalized_status == "unknown":
                unknown_status_count += 1

            self._accumulate_usage_center_bucket(summary, row, normalized_status)

            operation_bucket = by_operation.setdefault(
                operation,
                self._usage_center_bucket({"operation": operation, "models": {}}),
            )
            self._accumulate_usage_center_bucket(operation_bucket, row, normalized_status)

            model_key = f"{row.provider}:{row.model}"
            model_bucket = by_model.setdefault(
                model_key,
                self._usage_center_model_bucket({"provider": row.provider, "model": row.model}),
            )
            self._accumulate_usage_center_model_bucket(model_bucket, row, normalized_status)

            nested_model_bucket = operation_bucket["models"].setdefault(
                model_key,
                self._usage_center_model_bucket({"provider": row.provider, "model": row.model}),
            )
            self._accumulate_usage_center_model_bucket(nested_model_bucket, row, normalized_status)

        warnings: list[str] = []
        if unknown_operation_count > 0:
            warnings.append("unknown_operation_present")
        if missing_token_count > 0:
            warnings.append("missing_or_zero_tokens_present")
        if missing_cost_count > 0:
            warnings.append("missing_cost_present")
        if unknown_status_count > 0:
            warnings.append("unknown_status_present")
        if not any((row.operation or "") == "ai_assistant" for row in rows):
            warnings.append("ai_assistant_without_dedicated_operation_logs")

        recent_events = [
            {
                "created_at": row.created_at,
                "operation": row.operation or "unknown",
                "provider": row.provider,
                "model": row.model,
                "status": row.status,
                "normalized_status": self._normalize_ai_usage_status(row.status),
                "tokens": int(row.total_tokens or 0),
                "estimated_cost_usd": row.estimated_cost_usd,
                "duration_ms": row.latency_ms,
                "safe_error_message": self._safe_ai_usage_error_message(row.error_message),
            }
            for row in sorted(
                rows,
                key=lambda item: item.created_at or datetime.min.replace(tzinfo=UTC),
                reverse=True,
            )[:20]
        ]

        finalized_summary_bucket = self._finalize_usage_center_bucket(summary)
        finalized_summary = {
            "total_calls": finalized_summary_bucket["calls"],
            "success_calls": finalized_summary_bucket["success_calls"],
            "failed_calls": finalized_summary_bucket["failed_calls"],
            "rate_limited_calls": finalized_summary_bucket["rate_limited_calls"],
            "blocked_calls": finalized_summary_bucket["blocked_calls"],
            "unknown_calls": finalized_summary_bucket["unknown_calls"],
            "total_input_tokens": finalized_summary_bucket["input_tokens"],
            "total_output_tokens": finalized_summary_bucket["output_tokens"],
            "total_tokens": finalized_summary_bucket["total_tokens"],
            "estimated_cost_usd": finalized_summary_bucket["estimated_cost_usd"],
            "avg_duration_ms": finalized_summary_bucket["avg_duration_ms"],
        }
        finalized_operations = []
        for operation in sorted(by_operation.keys()):
            bucket = dict(by_operation[operation])
            nested_models = [
                self._finalize_usage_center_model_bucket(model_bucket)
                for model_bucket in sorted(
                    bucket["models"].values(),
                    key=lambda item: (
                        -(item["estimated_cost_usd"] or Decimal("0")),
                        -item["total_tokens"],
                        item["provider"],
                        item["model"],
                    ),
                )
            ]
            bucket["models"] = nested_models
            finalized_operations.append(self._finalize_usage_center_bucket(bucket))

        finalized_models = [
            self._finalize_usage_center_model_bucket(by_model[key])
            for key in sorted(
                by_model.keys(),
                key=lambda item: (
                    -(by_model[item]["estimated_cost_usd"] or Decimal("0")),
                    -by_model[item]["total_tokens"],
                    by_model[item]["provider"],
                    by_model[item]["model"],
                ),
            )
        ]

        observed_pricing_items = sorted(
            pricing_catalog["items"],
            key=lambda item: (item["status"] != "configured", item["provider"], item["model"]),
        )

        return {
            "period": {
                "from": query.date_from,
                "to": query.date_to,
            },
            "summary": finalized_summary,
            "by_operation": finalized_operations,
            "by_model": finalized_models,
            "recent_events": recent_events,
            "pricing": {
                "source": "internal_static",
                "updated_at": None,
                "models": observed_pricing_items,
            },
            "gaps": {
                "unknown_operation_count": unknown_operation_count,
                "missing_token_count": missing_token_count,
                "missing_cost_count": missing_cost_count,
                "unknown_status_count": unknown_status_count,
                "warnings": warnings,
            },
        }

    async def get_queues(self) -> dict[str, Any]:
        redis = await self._get_redis_health()
        celery = await self._get_celery_health()
        now = datetime.now(UTC)

        return {
            "redis": redis,
            "celery": celery,
            "pending_analyses": await self._count_analyses({"pending"}),
            "processing_analyses": await self._count_analyses({"processing"}),
            "stale_processing": await self._count_stale_processing(now),
            "failed_last_24h": await self._count_failed_analyses_since(now - timedelta(hours=24)),
            "retries_pending": await self._count_analyses({"retry_scheduled"}),
        }

    async def get_database(self) -> dict[str, Any]:
        database = await self._get_database_ping()
        counts = await asyncio.gather(
            self._count_rows(CandidateModel),
            self._count_rows(JobModel),
            self._count_rows(AnalysisModel),
        )

        analysis_rows = await self._session.execute(
            sa.select(AnalysisModel.status, sa.func.count())
            .group_by(AnalysisModel.status)
            .order_by(AnalysisModel.status.asc())
        )
        database_time = await self._session.scalar(sa.select(sa.func.current_timestamp()))

        return {
            "status": database["status"],
            "latency_ms": database["latency_ms"],
            "total_candidates": counts[0],
            "total_jobs": counts[1],
            "total_analyses": counts[2],
            "analyses_by_status": [
                {"status": status, "count": count}
                for status, count in analysis_rows.all()
            ],
            "database_time": database_time,
            "pool_info": self._get_pool_info(),
        }

    async def get_errors(self) -> dict[str, Any]:
        since = datetime.now(UTC) - timedelta(hours=24)
        failed_analyses_24h = await self._count_failed_analyses_since(since)
        ai_rows = await self._list_ai_usage_rows(AIUsageQuery(date_from=since.date()))
        provider_failures: dict[str, int] = defaultdict(int)
        for row in ai_rows:
            if row.status != "success":
                provider_failures[row.provider] += 1

        recent_analyses_rows = await self._session.execute(
            sa.select(
                AnalysisModel.id,
                AnalysisModel.status,
                AnalysisModel.failure_reason,
                AnalysisModel.failed_at,
                AnalysisModel.provider_error_type,
                AnalysisModel.provider_status_code,
                AIModelModel.provider,
                AIModelModel.model_id,
            )
            .join(AIModelModel, AIModelModel.id == AnalysisModel.ai_model_id)
            .where(AnalysisModel.status == "failed")
            .order_by(AnalysisModel.failed_at.desc().nullslast(), AnalysisModel.created_at.desc())
            .limit(10)
        )

        recent_ai_failures_rows = await self._session.execute(
            sa.select(AIUsageLogModel)
            .where(AIUsageLogModel.status != "success")
            .order_by(AIUsageLogModel.created_at.desc())
            .limit(10)
        )

        recent_failures: list[dict[str, Any]] = [
            {
                "source": "analysis",
                "analysis_id": analysis_id,
                "provider": provider,
                "model": model_id,
                "operation": "resume_analysis",
                "error_message": failure_reason,
                "provider_error_type": provider_error_type,
                "provider_status_code": provider_status_code,
                "created_at": failed_at,
            }
            for analysis_id, _status, failure_reason, failed_at, provider_error_type, provider_status_code, provider, model_id in recent_analyses_rows.all()
        ]

        recent_failures.extend(
            {
                "source": "ai_usage",
                "analysis_id": row.analysis_id,
                "provider": row.provider,
                "model": row.model,
                "operation": row.operation,
                "error_message": row.error_message,
                "provider_error_type": None,
                "provider_status_code": None,
                "created_at": row.created_at,
            }
            for row in recent_ai_failures_rows.scalars().all()
        )
        recent_failures.sort(
            key=lambda item: item["created_at"] or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )

        return {
            "failed_analyses_24h": failed_analyses_24h,
            "ai_errors_by_provider": [
                {"provider": provider, "failed_calls": count}
                for provider, count in sorted(provider_failures.items())
            ],
            "recent_failures": recent_failures[:20],
            "worker_status": await self._get_celery_health(),
        }

    async def _get_database_ping(self) -> dict[str, Any]:
        started = time_module.perf_counter()
        try:
            await self._session.execute(sa.select(1))
            latency_ms = int((time_module.perf_counter() - started) * 1000)
            return {"status": "ok", "latency_ms": latency_ms}
        except Exception:
            return {"status": "down", "latency_ms": None}

    async def _get_redis_health(self) -> dict[str, Any]:
        started = time_module.perf_counter()
        redis = None
        try:
            redis = await get_redis()
            ping = getattr(redis, "ping", None)
            if ping is None:
                latency_ms = int((time_module.perf_counter() - started) * 1000)
                return {"status": "ok", "latency_ms": latency_ms}
            result = await ping()
            latency_ms = int((time_module.perf_counter() - started) * 1000)
            return {
                "status": "ok" if result is True else "degraded",
                "latency_ms": latency_ms,
            }
        except Exception:
            return {"status": "down", "latency_ms": None}
        finally:
            if redis is not None and hasattr(redis, "aclose"):
                try:
                    await redis.aclose()
                except Exception:
                    pass

    def _get_ai_provider_health(self) -> dict[str, Any]:
        configured_provider = settings.AI_PROVIDER
        if settings.ENABLE_DEV_MOCK:
            return {
                "configured_provider": configured_provider,
                "status": "ok",
            }

        if configured_provider == "google":
            key_health = get_gemini_key_health()
            if key_health["configured_key_count"] == 0:
                status = "down"
            elif key_health["available_key_count"] == 0:
                status = "degraded"
            elif key_health["cooldown_key_count"] > 0:
                status = "degraded"
            else:
                status = "ok"
            return {
                "configured_provider": configured_provider,
                "status": status,
                **key_health,
            }
        elif configured_provider == "anthropic":
            status = "ok" if bool(settings.ANTHROPIC_API_KEY) else "down"
        else:
            status = "down"

        return {
            "configured_provider": configured_provider,
            "status": status,
        }

    async def _count_rows(self, model: type[Any]) -> int:
        return int(await self._session.scalar(sa.select(sa.func.count()).select_from(model)) or 0)

    async def _count_analyses(self, statuses: set[str]) -> int:
        return int(
            await self._session.scalar(
                sa.select(sa.func.count())
                .select_from(AnalysisModel)
                .where(AnalysisModel.status.in_(sorted(statuses)))
            )
            or 0
        )

    async def _count_failed_analyses_since(self, since: datetime) -> int:
        return int(
            await self._session.scalar(
                sa.select(sa.func.count())
                .select_from(AnalysisModel)
                .where(
                    AnalysisModel.status == "failed",
                    sa.func.coalesce(AnalysisModel.failed_at, AnalysisModel.updated_at, AnalysisModel.created_at) >= since,
                )
            )
            or 0
        )

    async def _count_stale_processing(self, now: datetime) -> int:
        return int(
            await self._session.scalar(
                sa.select(sa.func.count())
                .select_from(AnalysisModel)
                .where(
                    AnalysisModel.status == "processing",
                    AnalysisModel.stale_at.is_not(None),
                    AnalysisModel.stale_at <= now,
                )
            )
            or 0
        )

    async def get_pricing_catalog(self) -> dict[str, Any]:
        """List configured pricing entries plus any (provider, model) pairs
        observed in `ai_usage_logs` that have no pricing yet ("Não configurado").

        Read-only — does not modify any data.
        """
        configured: list[dict[str, Any]] = [
            {
                "provider": provider,
                "model": model_id,
                "input_per_1m_tokens": pricing.input_per_1m_tokens,
                "output_per_1m_tokens": pricing.output_per_1m_tokens,
                "currency": pricing.currency,
                "source": pricing.source or None,
                "last_reviewed_at": pricing.last_reviewed_at or None,
                "status": "configured",
            }
            for (provider, model_id), pricing in sorted(AI_MODEL_PRICING.items())
        ]

        observed = await self._session.execute(
            sa.select(AIUsageLogModel.provider, AIUsageLogModel.model).distinct()
        )
        configured_keys = {(entry["provider"], entry["model"]) for entry in configured}
        missing: list[dict[str, Any]] = []
        for provider, model_id in observed.all():
            if (provider, model_id) in configured_keys:
                continue
            # Skip if the pricing module aliases this provider to a configured one
            if estimate_ai_cost(provider, model_id, input_tokens=1, output_tokens=0) is not None:
                continue
            missing.append(
                {
                    "provider": provider,
                    "model": model_id,
                    "input_per_1m_tokens": None,
                    "output_per_1m_tokens": None,
                    "currency": "USD",
                    "source": None,
                    "last_reviewed_at": None,
                    "status": "not_configured",
                }
            )

        return {"items": configured + missing}

    async def backfill_missing_costs(self) -> dict[str, Any]:
        """Recompute ``estimated_cost_usd`` for rows where it is NULL but a price
        is now configured for ``(provider, model)``.

        Does NOT call the AI provider. Does NOT alter tokens, status, score,
        ranking, pipeline, or the analysis flow. Pure read-from-pricing-table
        write-to-column operation.

        Returns counts (updated, skipped_unpriced, total_null).
        """
        stmt = sa.select(AIUsageLogModel).where(AIUsageLogModel.estimated_cost_usd.is_(None))
        rows = (await self._session.execute(stmt)).scalars().all()

        updated = 0
        skipped_unpriced = 0
        for row in rows:
            cost = estimate_ai_cost(
                row.provider,
                row.model,
                input_tokens=int(row.input_tokens or 0),
                output_tokens=int(row.output_tokens or 0),
            )
            if cost is None:
                skipped_unpriced += 1
                continue
            row.estimated_cost_usd = cost
            updated += 1

        if updated:
            await self._session.commit()
        return {
            "total_null_rows": len(rows),
            "updated": updated,
            "skipped_unpriced": skipped_unpriced,
        }

    async def _list_ai_usage_rows(self, query: AIUsageQuery) -> list[AIUsageLogModel]:
        stmt = sa.select(AIUsageLogModel).order_by(AIUsageLogModel.created_at.asc())
        start, end = _to_window(query)
        if start is not None:
            stmt = stmt.where(AIUsageLogModel.created_at >= start)
        if end is not None:
            stmt = stmt.where(AIUsageLogModel.created_at < end)
        if query.provider:
            stmt = stmt.where(AIUsageLogModel.provider == query.provider)
        if query.model:
            stmt = stmt.where(AIUsageLogModel.model == query.model)
        rows = await self._session.execute(stmt)
        return list(rows.scalars().all())

    @staticmethod
    def _usage_center_bucket(seed: dict[str, Any]) -> dict[str, Any]:
        return {
            **seed,
            "calls": 0,
            "success_calls": 0,
            "failed_calls": 0,
            "rate_limited_calls": 0,
            "blocked_calls": 0,
            "unknown_calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": None,
            "avg_duration_ms": None,
            "_latency_sum": 0,
            "_latency_count": 0,
        }

    @staticmethod
    def _usage_center_model_bucket(seed: dict[str, Any]) -> dict[str, Any]:
        return {
            **seed,
            "calls": 0,
            "success_calls": 0,
            "failed_calls": 0,
            "rate_limited_calls": 0,
            "blocked_calls": 0,
            "unknown_calls": 0,
            "total_tokens": 0,
            "estimated_cost_usd": None,
        }

    @staticmethod
    def _accumulate_usage_center_bucket(
        bucket: dict[str, Any],
        row: AIUsageLogModel,
        normalized_status: str,
    ) -> None:
        bucket["calls"] += 1
        bucket[f"{normalized_status}_calls"] += 1
        bucket["input_tokens"] += int(row.input_tokens or 0)
        bucket["output_tokens"] += int(row.output_tokens or 0)
        bucket["total_tokens"] += int(row.total_tokens or 0)
        if row.estimated_cost_usd is not None:
            current = bucket["estimated_cost_usd"] or Decimal("0")
            bucket["estimated_cost_usd"] = current + Decimal(row.estimated_cost_usd)
        if row.latency_ms is not None:
            bucket["_latency_sum"] += int(row.latency_ms)
            bucket["_latency_count"] += 1
            bucket["avg_duration_ms"] = bucket["_latency_sum"] / bucket["_latency_count"]

    @staticmethod
    def _accumulate_usage_center_model_bucket(
        bucket: dict[str, Any],
        row: AIUsageLogModel,
        normalized_status: str,
    ) -> None:
        bucket["calls"] += 1
        bucket[f"{normalized_status}_calls"] += 1
        bucket["total_tokens"] += int(row.total_tokens or 0)
        if row.estimated_cost_usd is not None:
            current = bucket["estimated_cost_usd"] or Decimal("0")
            bucket["estimated_cost_usd"] = current + Decimal(row.estimated_cost_usd)

    @staticmethod
    def _finalize_usage_center_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
        finalized = dict(bucket)
        finalized.pop("_latency_sum", None)
        finalized.pop("_latency_count", None)
        return finalized

    @staticmethod
    def _finalize_usage_center_model_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
        return dict(bucket)

    @staticmethod
    def _normalize_ai_usage_status(status: str | None) -> str:
        normalized = (status or "").strip().lower()
        if normalized == "success":
            return "success"
        if normalized in {"failed", "failure", "error"}:
            return "failed"
        if normalized in {"rate_limited", "rate_limit"}:
            return "rate_limited"
        if normalized in {"blocked", "invalid_payload", "skipped", "disabled"}:
            return "blocked"
        return "unknown"

    @staticmethod
    def _safe_ai_usage_error_message(value: str | None) -> str | None:
        cleaned = sanitize_log_text(value)
        if cleaned is None:
            return None
        trimmed = cleaned.strip()
        if not trimmed:
            return None
        return trimmed[:240]

    async def _get_celery_health(self) -> dict[str, Any]:
        def _inspect() -> dict[str, Any]:
            inspector = celery_app.control.inspect(timeout=1.0)
            stats = inspector.stats()
            if not stats:
                return {
                    "status": "unknown",
                    "message": "Celery inspect indisponível ou sem workers respondendo.",
                    "workers_online": 0,
                }
            return {
                "status": "ok",
                "message": None,
                "workers_online": len(stats),
            }

        try:
            return await asyncio.to_thread(_inspect)
        except Exception as exc:
            return {
                "status": "unknown",
                "message": f"Celery inspect indisponível: {str(exc)}",
                "workers_online": None,
            }

    @staticmethod
    def _get_pool_info() -> dict[str, Any]:
        pool = getattr(engine.sync_engine, "pool", None)
        if pool is None:
            return {"status": "unavailable"}

        info: dict[str, Any] = {"status": "available"}
        for key in ("size", "checkedin", "checkedout", "overflow"):
            value = getattr(pool, key, None)
            if callable(value):
                try:
                    info[key] = value()
                except Exception:
                    info[key] = None
        status = getattr(pool, "status", None)
        if callable(status):
            try:
                info["summary"] = status()
            except Exception:
                info["summary"] = None
        return info
