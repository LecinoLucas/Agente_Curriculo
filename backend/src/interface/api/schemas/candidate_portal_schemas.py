from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from src.interface.api.schemas.pre_admission_schemas import (
    CandidatePortalPreAdmissionSummary,
)


class CandidateAuthRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class CandidateAuthLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class CandidatePasswordSetupRequest(BaseModel):
    email: EmailStr


class CandidatePasswordSetupConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=8, max_length=128)


class CandidatePasswordSetupResponse(BaseModel):
    message: str


class CandidateAuthGoogleRequest(BaseModel):
    id_token: str = Field(min_length=1, max_length=4096)


class CandidateAuthLoginResponse(BaseModel):
    message: str
    redirect_to: str
    session_expires_at: datetime


class CandidateAuthGoogleCandidateResponse(BaseModel):
    id: UUID
    full_name: str
    email: str | None = None
    phone: str | None = None
    cpf: str | None = None
    salary_expectation: str | None = None
    has_resume: bool = False
    picture_url: str | None = None
    email_locked: bool = False


class CandidateAuthGoogleResponse(BaseModel):
    status: str
    message: str
    redirect_to: str
    session_expires_at: datetime
    candidate: CandidateAuthGoogleCandidateResponse
    missing_fields: list[str] = Field(default_factory=list)


class CandidatePortalResumeResponse(BaseModel):
    resume_id: UUID
    resume_version_id: UUID | None = None
    file_name: str | None = None
    extraction_status: str | None = None
    uploaded_at: datetime


class CandidatePortalCandidateSummaryResponse(BaseModel):
    id: UUID
    full_name: str
    cpf_masked: str | None = None
    email: str | None = None
    email_masked: str | None = None
    phone: str | None = None
    phone_masked: str | None = None
    city: str | None = None
    state: str | None = None
    application_source: str | None = None
    application_source_label: str


class CandidatePortalActiveApplicationResponse(BaseModel):
    pipeline_id: UUID
    job_id: UUID
    job_title: str | None = None
    pipeline_stage: str
    status_public: str
    submitted_at: datetime
    current_analysis_id: UUID | None = None
    analysis_status: str | None = None
    resume_version_id: UUID | None = None
    resume_filename: str | None = None
    is_talent_pool: bool = False


class CandidatePortalPublicInterviewResponse(BaseModel):
    id: UUID | None = None
    status: str
    status_label: str
    scheduled_at: datetime | None = None
    interview_type: str | None = None
    interview_type_label: str | None = None
    interview_format: str | None = None
    interview_format_label: str | None = None
    location: str | None = None
    meeting_url: str | None = None
    public_notes: str | None = None
    is_online: bool | None = None


class CandidatePortalTimelineStepResponse(BaseModel):
    key: str
    label: str
    status: str
    description: str
    interview: CandidatePortalPublicInterviewResponse | None = None


class CandidatePortalTimelineResponse(BaseModel):
    current_step_key: str
    current_step_label: str
    steps: list[CandidatePortalTimelineStepResponse]


class CandidatePortalOverviewResponse(BaseModel):
    candidate: CandidatePortalCandidateSummaryResponse
    active_application: CandidatePortalActiveApplicationResponse | None = None
    application_history: list["CandidatePortalApplicationResponse"] = []
    latest_resume: CandidatePortalResumeResponse | None = None
    public_interview: CandidatePortalPublicInterviewResponse | None = None
    talent_pool: bool
    status_public: str
    application_status: str
    current_process_status_label: str
    is_process_closed: bool = False
    closed_reason_public_label: str | None = None
    can_request_contact: bool = True
    can_apply_to_other_jobs: bool = True
    public_timeline: CandidatePortalTimelineResponse | None = None
    pre_admission: "CandidatePortalPreAdmissionSummary | None" = None
    requires_behavioral_assessment: bool = False


class CandidatePortalApplicationResponse(BaseModel):
    pipeline_id: UUID | None = None
    job_id: UUID | None = None
    job_title: str | None = None
    status: str
    status_label: str
    submitted_at: datetime
    updated_at: datetime
    resume_file_name: str | None = None
    analysis_status: str | None = None
    application_source: str | None = None
    talent_pool: bool = False
    talent_pool_profile_status: str | None = None


class CandidatePortalUpdateProfileRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)


class CandidatePortalResumeUploadResponse(BaseModel):
    resume_id: UUID
    resume_version_id: UUID
    extraction_status: str
    message: str


CandidatePortalOverviewResponse.model_rebuild()

__all__ = [
    "CandidateAuthRegisterRequest",
    "CandidateAuthLoginRequest",
    "CandidateAuthLoginResponse",
    "CandidatePasswordSetupRequest",
    "CandidatePasswordSetupConfirmRequest",
    "CandidatePasswordSetupResponse",
    "CandidateAuthGoogleRequest",
    "CandidateAuthGoogleResponse",
    "CandidateAuthGoogleCandidateResponse",
    "CandidatePortalResumeResponse",
    "CandidatePortalCandidateSummaryResponse",
    "CandidatePortalActiveApplicationResponse",
    "CandidatePortalPublicInterviewResponse",
    "CandidatePortalTimelineStepResponse",
    "CandidatePortalTimelineResponse",
    "CandidatePortalOverviewResponse",
    "CandidatePortalApplicationResponse",
    "CandidatePortalUpdateProfileRequest",
    "CandidatePortalResumeUploadResponse",
    "CandidatePortalPreAdmissionSummary",
]
