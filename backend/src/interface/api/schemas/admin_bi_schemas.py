from __future__ import annotations

from pydantic import BaseModel


class BIStatusTotalItem(BaseModel):
    status: str
    total: int


class BIPipelineStageItem(BaseModel):
    stage: str
    total: int


class BIAnalysesDailyItem(BaseModel):
    date: str
    total: int


class BIAIUsageDailyItem(BaseModel):
    date: str
    tokens: int
    calls: int


class BITopJobItem(BaseModel):
    job_id: str
    title: str
    status: str
    total_candidates: int


class BITopExpensiveAnalysisItem(BaseModel):
    analysis_id: str
    candidate_name: str
    tokens: int
    estimated_cost_usd: float | None = None


class BIRecentFailureItem(BaseModel):
    analysis_id: str
    candidate_name: str
    job_title: str
    status: str
    failed_at: str | None = None
    failure_reason: str | None = None


class BIAggregatedUsageSummary(BaseModel):
    total_calls: int
    successful_calls: int
    failed_calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float | None = None
    avg_latency_ms: float | None = None


class BISummaryResponse(BaseModel):
    total_candidates: int
    active_candidates: int
    archived_candidates: int
    total_jobs: int
    published_jobs: int
    archived_jobs: int
    completed_analyses: int
    failed_analyses: int
    average_score: float | None = None
    hired_candidates: int
    ai_total_tokens: int
    ai_total_calls: int
    ai_estimated_cost_usd: float | None = None


class BIOverviewResponse(BaseModel):
    summary: BISummaryResponse
    jobs_by_status: list[BIStatusTotalItem]
    candidates_by_status: list[BIStatusTotalItem]
    analyses_by_status: list[BIStatusTotalItem]
    pipeline_by_stage: list[BIPipelineStageItem]
    analyses_daily: list[BIAnalysesDailyItem]
    ai_usage_daily: list[BIAIUsageDailyItem]
    top_jobs_by_candidates: list[BITopJobItem]
    top_expensive_analyses: list[BITopExpensiveAnalysisItem]
    latest_analysis_failures: list[BIRecentFailureItem]
    ai_usage: BIAggregatedUsageSummary
    total_analyses: int
