from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class CandidateCheckResponse(BaseModel):
    exists: bool
    candidate_id: UUID | None = None
    full_name: str | None = None


class CandidateResponse(BaseModel):
    id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    cpf: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    internal_notes: str | None = None
    tags: list[str]
    user_id: UUID | None = None
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CandidateResumeSummaryResponse(BaseModel):
    resume_id: UUID
    title: str
    status: str
    current_version: int
    current_version_id: UUID | None = None
    current_file_name: str | None = None
    extraction_status: str | None = None
    updated_at: datetime


class CandidateLatestAnalysisResponse(BaseModel):
    analysis_id: UUID
    resume_id: UUID
    resume_title: str
    status: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    failed_at: datetime | None = None
    failure_reason: str | None = None
    used_real_ai: bool | None = None
    task_id: str | None = None
    worker_id: str | None = None
    overall_score: float | None = None
    seniority_level: str | None = None
    total_experience_years: float | None = None
    created_at: datetime
    updated_at: datetime


class CandidateLatestAnalysisPipelineResponse(BaseModel):
    analysis_id: UUID
    matching_status: str
    published_jobs_total: int
    matched_jobs_count: int
    pending_jobs_count: int


class CandidateJobMatchSummaryResponse(BaseModel):
    analysis_id: UUID
    job_id: UUID
    job_title: str
    job_status: str
    match_score: float | None = None
    recommendation: str | None = None
    overall_score: float | None = None
    seniority_level: str | None = None
    total_experience_years: float | None = None
    created_at: datetime


class CandidatePipelineEntryResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    job_title: str
    stage: str
    candidate_status: str
    match_score: float | None = None
    entered_at: datetime | None = None
    updated_at: datetime


class CandidateOverviewResponse(BaseModel):
    candidate: CandidateResponse
    resumes: list[CandidateResumeSummaryResponse]
    latest_analysis: CandidateLatestAnalysisResponse | None = None
    latest_analysis_pipeline: CandidateLatestAnalysisPipelineResponse | None = None
    top_matches: list[CandidateJobMatchSummaryResponse]
    pipeline_entries: list[CandidatePipelineEntryResponse] = Field(default_factory=list)


class CandidateListSummaryResponse(BaseModel):
    id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    cpf: str | None = None
    tags: list[str]
    created_at: datetime
    resume_count: int
    ai_status: str | None = None
    ai_score: float | None = None


class CreateCandidateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    cpf: str | None = Field(default=None, max_length=14)
    location_city: str | None = Field(default=None, max_length=100)
    location_state: str | None = Field(default=None, max_length=100)
    location_country: str = Field(default="BR", max_length=10)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    portfolio_url: str | None = Field(default=None, max_length=500)
    internal_notes: str | None = None
    tags: list[str] = Field(default_factory=list)
    user_id: UUID | None = None


class UpdateCandidateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    cpf: str | None = Field(default=None, max_length=14)
    location_city: str | None = Field(default=None, max_length=100)
    location_state: str | None = Field(default=None, max_length=100)
    location_country: str | None = Field(default=None, max_length=10)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    portfolio_url: str | None = Field(default=None, max_length=500)
    internal_notes: str | None = None
    tags: list[str] | None = None
