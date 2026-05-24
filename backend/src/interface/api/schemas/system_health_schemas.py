from __future__ import annotations

from datetime import date as DateValue, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from src.interface.api.schemas.common import APISchemaModel


HealthStatus = Literal["ok", "degraded", "down", "unknown"]
AIProviderOperationalStatus = Literal["available", "degraded", "rate_limited", "unavailable"]


class ComponentStatusResponse(APISchemaModel):
    status: HealthStatus
    latency_ms: int | None = None
    message: str | None = None


class AIProviderHealthResponse(APISchemaModel):
    configured_provider: str
    status: HealthStatus
    configured_key_count: int | None = None
    available_key_count: int | None = None
    cooldown_key_count: int | None = None
    cooldowns: list[dict[str, object]] = Field(default_factory=list)


class AIProviderOperationalHealthResponse(APISchemaModel):
    provider: str
    model_id: str
    status: AIProviderOperationalStatus
    cooldown_until: datetime | None = None
    retry_after_seconds: int | None = None
    configured_key_count: int
    available_key_count: int | None = None
    last_error_type: str | None = None
    last_status_code: int | None = None
    last_error_at: datetime | None = None
    consecutive_rate_limit_count: int = 0


class SystemHealthOverviewResponse(APISchemaModel):
    status: Literal["ok", "degraded", "down"]
    environment: str
    version: str
    uptime_seconds: int
    backend: ComponentStatusResponse
    database: ComponentStatusResponse
    redis: ComponentStatusResponse
    ai_provider: AIProviderHealthResponse
    last_analysis_at: datetime | None = None
    pending_analyses: int
    processing_analyses: int
    failed_analyses_24h: int


class AIUsageAggregateResponse(APISchemaModel):
    provider: str | None = None
    model: str | None = None
    usage_date: DateValue | None = Field(default=None, alias="date")
    total_calls: int
    successful_calls: int
    failed_calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: Decimal | None = None
    avg_latency_ms: float | None = None


class TopExpensiveAnalysisResponse(APISchemaModel):
    analysis_id: UUID
    provider: str
    model: str
    calls: int
    total_tokens: int
    estimated_cost_usd: Decimal | None = None


class AIUsageSummaryResponse(APISchemaModel):
    total_calls: int
    successful_calls: int
    failed_calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: Decimal | None = None
    avg_latency_ms: float | None = None
    by_provider: list[AIUsageAggregateResponse]
    by_model: list[AIUsageAggregateResponse]
    daily_usage: list[AIUsageAggregateResponse]
    top_expensive_analyses: list[TopExpensiveAnalysisResponse]


class QueueWorkerStatusResponse(APISchemaModel):
    status: HealthStatus
    message: str | None = None
    workers_online: int | None = None


class QueueHealthResponse(APISchemaModel):
    redis: ComponentStatusResponse
    celery: QueueWorkerStatusResponse
    pending_analyses: int
    processing_analyses: int
    stale_processing: int
    failed_last_24h: int
    retries_pending: int


class AnalysisStatusCountResponse(APISchemaModel):
    status: str
    count: int


class DatabaseHealthResponse(APISchemaModel):
    status: HealthStatus
    latency_ms: int | None = None
    total_candidates: int
    total_jobs: int
    total_analyses: int
    analyses_by_status: list[AnalysisStatusCountResponse]
    database_time: datetime | None = None
    pool_info: dict[str, object | None]


class ProviderErrorSummaryResponse(APISchemaModel):
    provider: str
    failed_calls: int


class RecentFailureResponse(APISchemaModel):
    source: str
    analysis_id: UUID | None = None
    provider: str | None = None
    model: str | None = None
    operation: str | None = None
    error_message: str | None = None
    provider_error_type: str | None = None
    provider_status_code: int | None = None
    created_at: datetime | None = None


class SystemErrorsResponse(APISchemaModel):
    failed_analyses_24h: int
    ai_errors_by_provider: list[ProviderErrorSummaryResponse]
    recent_failures: list[RecentFailureResponse]
    worker_status: QueueWorkerStatusResponse


class AIPricingItemResponse(APISchemaModel):
    provider: str
    model: str
    input_per_1m_tokens: Decimal | None = None
    output_per_1m_tokens: Decimal | None = None
    currency: str = "USD"
    source: str | None = None
    last_reviewed_at: str | None = None
    status: Literal["configured", "not_configured"]


class AIPricingCatalogResponse(APISchemaModel):
    items: list[AIPricingItemResponse]


class AICostBackfillResponse(APISchemaModel):
    total_null_rows: int
    updated: int
    skipped_unpriced: int
