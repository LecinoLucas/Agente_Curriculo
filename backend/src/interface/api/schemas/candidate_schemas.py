from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

ApplicationSource = str


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
    salary_expectation: str | None = None
    location_city: str | None = None
    location_state: str | None = None
    location_country: str
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    internal_notes: str | None = None
    tags: list[str]
    user_id: UUID | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    archived_by: UUID | None = None
    archive_reason: str | None = None
    archive_reason_note: str | None = None
    application_source: ApplicationSource | None = None

    model_config = {"from_attributes": True}


class CandidateResumeSummaryResponse(BaseModel):
    resume_id: UUID
    title: str
    status: str
    current_version: int
    current_version_id: UUID | None = None
    current_file_name: str | None = None
    extraction_status: str | None = None
    can_retry_extraction: bool = False
    retry_extraction_reason: str | None = None
    extraction_status_label: str | None = None
    updated_at: datetime


class CandidateLatestAnalysisResponse(BaseModel):
    analysis_id: UUID
    job_id: UUID | None = None
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
    seniority_level: str | None = None
    total_experience_years: float | None = None
    created_at: datetime
    updated_at: datetime


class CandidateLatestAnalysisPipelineResponse(BaseModel):
    analysis_id: UUID
    job_id: UUID | None = None
    matching_status: str
    published_jobs_total: int
    matched_jobs_count: int
    pending_jobs_count: int


class CandidateActiveJobDecisionResponse(BaseModel):
    score_status: str
    analysis_status: str | None = None
    current_analysis_id: UUID | None = None
    match_score: float | None = None
    warnings: list[str] = Field(default_factory=list)
    next_action: str


class CandidateJobMatchSummaryResponse(BaseModel):
    analysis_id: UUID | None = None
    job_id: UUID
    job_title: str
    job_status: str
    job_fit_score: float | None = None
    recommendation: str | None = None
    seniority_level: str | None = None
    total_experience_years: float | None = None
    created_at: datetime


class CandidatePipelineEntryResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    job_title: str
    stage: str
    pipeline_id: UUID | None = None
    resume_version_id: UUID | None = None
    relationship_status: str
    is_terminal: bool
    terminated_at: datetime | None = None
    termination_reason: str | None = None
    candidate_status: str
    entered_at: datetime | None = None
    updated_at: datetime


class CandidateSkillPreviewResponse(BaseModel):
    matched_skills: list[str] = Field(default_factory=list)
    attention_points: list[str] = Field(default_factory=list)


class CandidateScoreDimensionsResponse(BaseModel):
    skills: float | None = None
    experience: float | None = None
    seniority: float | None = None
    education: float | None = None
    confidence: float | None = None


class CandidateLatestNoteResponse(BaseModel):
    note_text: str
    created_at: datetime


class CandidatePreviewPendencyResponse(BaseModel):
    id: str
    label: str
    tone: str = "info"
    action: str | None = None
    description: str | None = None
    action_payload: dict | None = None


class CandidateLatestMovementResponse(BaseModel):
    event_type: str
    to_stage: str | None = None
    actor_name: str | None = None
    moved_at: datetime


class CandidateResumeDownloadUrlResponse(BaseModel):
    url: str
    expires_at: datetime | None = None
    content_type: str
    filename: str


class CandidateActiveJobResponse(BaseModel):
    id: UUID
    title: str
    status: str


class CandidateOverviewResponse(BaseModel):
    candidate: CandidateResponse
    resumes: list[CandidateResumeSummaryResponse]
    latest_analysis: CandidateLatestAnalysisResponse | None = None
    latest_analysis_pipeline: CandidateLatestAnalysisPipelineResponse | None = None
    top_matches: list[CandidateJobMatchSummaryResponse]
    active_job_id: UUID | None = None
    active_job: CandidateActiveJobResponse | None = None
    pipeline_entries: list[CandidatePipelineEntryResponse] = Field(default_factory=list)
    active_job_decision: CandidateActiveJobDecisionResponse | None = None
    active_job_skill_preview: CandidateSkillPreviewResponse | None = None
    active_job_score_dimensions: CandidateScoreDimensionsResponse | None = None
    latest_note: CandidateLatestNoteResponse | None = None
    preview_pendencies: list[CandidatePreviewPendencyResponse] = Field(default_factory=list)
    latest_movement: CandidateLatestMovementResponse | None = None


class CandidateProcessHistoryInterviewResponse(BaseModel):
    id: UUID
    type: str
    status: str
    scheduled_at: datetime | None = None
    scorecard_status: str | None = None
    final_recommendation: str | None = None


class CandidateProcessHistoryScorecardResponse(BaseModel):
    id: UUID
    interview_id: UUID | None = None
    status: str
    final_recommendation: str | None = None
    submitted_at: datetime | None = None


class CandidateProcessHistoryBehavioralResponse(BaseModel):
    assignment_id: UUID
    status: str
    submitted_at: datetime | None = None
    ai_status: str | None = None
    ai_completed_at: datetime | None = None


class CandidateProcessHistoryDecisionResponse(BaseModel):
    id: UUID
    status: str
    outcome: str
    submitted_at: datetime | None = None


class CandidateProcessHistoryItemResponse(BaseModel):
    pipeline_id: UUID
    job_id: UUID
    job_title: str
    is_current: bool
    started_at: datetime | None = None
    closed_at: datetime | None = None
    current_or_final_stage: str
    result_label: str
    closure_reason: str | None = None
    events_count: int = 0
    interviews: list[CandidateProcessHistoryInterviewResponse] = Field(default_factory=list)
    scorecards: list[CandidateProcessHistoryScorecardResponse] = Field(default_factory=list)
    behavioral_assessment: CandidateProcessHistoryBehavioralResponse | None = None
    hiring_decision: CandidateProcessHistoryDecisionResponse | None = None


class CandidateProcessHistoryResponse(BaseModel):
    candidate_id: UUID
    processes: list[CandidateProcessHistoryItemResponse] = Field(default_factory=list)


class CandidateNextInterviewSummary(BaseModel):
    scheduled_start: datetime
    scheduled_end: datetime
    interview_type: str
    interview_format: str


class CandidateListSummaryResponse(BaseModel):
    id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    cpf: str | None = None
    tags: list[str]
    created_at: datetime
    archived_at: datetime | None = None
    archive_reason: str | None = None
    application_source: ApplicationSource | None = None
    resume_count: int
    linked_job_count: int = 0
    latest_job_id: UUID | None = None
    latest_job_title: str | None = None
    latest_job_stage: str | None = None
    latest_relationship_status: str | None = None
    active_job_id: UUID | None = None
    active_job_title: str | None = None
    active_job_stage: str | None = None
    active_job_job_fit_score: float | None = None
    ai_status: str | None = None
    next_interview: CandidateNextInterviewSummary | None = None


class CreateCandidateRequest(BaseModel):
    full_name: str = Field(max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    cpf: str | None = None
    salary_expectation: str | None = Field(default=None, max_length=100)
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
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    cpf: str | None = None
    salary_expectation: str | None = Field(default=None, max_length=100)
    location_city: str | None = Field(default=None, max_length=100)
    location_state: str | None = Field(default=None, max_length=100)
    location_country: str | None = Field(default=None, max_length=10)
    linkedin_url: str | None = Field(default=None, max_length=500)
    github_url: str | None = Field(default=None, max_length=500)
    portfolio_url: str | None = Field(default=None, max_length=500)
    internal_notes: str | None = None
    tags: list[str] | None = None


class DeleteCandidateRequest(BaseModel):
    reason: str | None = None
    note: str | None = None
    confirmation: str | None = None


class ArchiveCandidateRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=1000)


class CandidateNoteAuthorResponse(BaseModel):
    id: UUID | None = None
    name: str


class CandidateNoteResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    note_text: str
    visibility: str = "internal"
    is_pinned: bool = False
    created_at: datetime
    updated_at: datetime
    is_edited: bool
    can_edit: bool = False
    can_delete: bool = False
    author: CandidateNoteAuthorResponse


class CreateCandidateNoteRequest(BaseModel):
    note_text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("note_text", mode="before")
    @classmethod
    def _normalize_note_text(cls, value: str) -> str:
        if value is None:
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                raise ValueError("Observação não pode estar vazia.")
            return normalized
        return value


class UpdateCandidateNoteRequest(BaseModel):
    note_text: str = Field(..., min_length=1, max_length=2000)

    @field_validator("note_text", mode="before")
    @classmethod
    def _normalize_note_text(cls, value: str) -> str:
        if value is None:
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                raise ValueError("Observação não pode estar vazia.")
            return normalized
        return value
