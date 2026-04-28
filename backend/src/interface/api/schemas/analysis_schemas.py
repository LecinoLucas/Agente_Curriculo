from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class AnalysisRequestResponse(BaseModel):
    analysis_id: UUID
    status: str


class AnalysisStatusResponse(BaseModel):
    analysis_id: UUID
    status: str
    retry_count: int
    failure_reason: str | None = None
    next_retry_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    failed_at: datetime | None = None
    updated_at: datetime


class AnalysisPipelineJobMatchResponse(BaseModel):
    job_id: UUID
    job_title: str
    job_status: str
    match_score: Decimal | None = None
    recommendation: str | None = None
    created_at: datetime


class AnalysisPipelineResponse(BaseModel):
    analysis_id: UUID
    analysis_status: str
    matching_status: str
    published_jobs_total: int
    matched_jobs_count: int
    pending_jobs_count: int
    recent_matches: list[AnalysisPipelineJobMatchResponse]


class AnalysisResponse(BaseModel):
    id: UUID
    resume_id: UUID | None = None
    resume_version_id: UUID
    candidate_id: UUID | None = None
    candidate_name: str | None = None
    resume_title: str | None = None
    resume_file_name: str | None = None
    job_id: UUID | None = None
    status: str
    priority: int
    retry_count: int
    requested_by: UUID
    requested_by_name: str | None = None
    failure_reason: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AnalysisResultResponse(BaseModel):
    analysis_id: UUID
    resume_id: UUID | None = None
    resume_version_id: UUID | None = None
    candidate_id: UUID | None = None
    candidate_name: str | None = None
    resume_title: str | None = None
    resume_file_name: str | None = None
    requested_by: UUID
    requested_by_name: str | None = None
    worker_id: str | None = None
    task_id: str | None = None
    used_real_ai: bool
    overall_score: Decimal | None = None
    technical_score: Decimal | None = None
    experience_score: Decimal | None = None
    education_score: Decimal | None = None
    communication_score: Decimal | None = None
    leadership_score: Decimal | None = None
    candidate_summary: str | None = None
    seniority_level: str | None = None
    total_experience_years: Decimal | None = None
    strengths: list[str]
    weaknesses: list[str]
    recommendations: list[str]
    keywords: list[str]
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    processing_time_ms: int | None = None
    created_at: datetime


class AnalysisGlobalItemResponse(BaseModel):
    id: UUID
    candidate_id: UUID | None = None
    candidate_name: str | None = None
    candidate_email: str | None = None
    resume_file_name: str | None = None
    resume_version_id: UUID
    status: str
    failure_reason: str | None = None
    used_real_ai: bool | None = None
    overall_score: float | None = None
    retry_count: int
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    failed_at: datetime | None = None


class AnalysisMatchResponse(BaseModel):
    analysis_id: UUID
    job_id: UUID
    match_score: Decimal
    recommendation: str
    mandatory_skills_matched: int
    mandatory_skills_total: int
    optional_skills_matched: int
    optional_skills_total: int
    seniority_score: Decimal
    candidate_seniority: str | None = None
    job_seniority: str | None = None
    validation_status: str = "pass"  # "pass" | "fail" | "unknown"
    missing_evidence: list[str] = Field(default_factory=list)  # ["education"] or ["experience"]
    rejection_reasons: list[str] = Field(default_factory=list)  # Detailed failure messages
