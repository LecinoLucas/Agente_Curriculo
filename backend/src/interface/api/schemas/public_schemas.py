from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PublicJobResponse(BaseModel):
    id: UUID
    title: str
    location: str | None = None
    job_area: str | None = None

    model_config = {"from_attributes": True}


class PublicApplyResponse(BaseModel):
    candidate_id: UUID
    resume_id: UUID
    resume_version_id: UUID
    job_id: UUID | None = None
    pipeline_id: UUID | None = None
    analysis_auto_requested: bool = False
    analysis_id: UUID | None = None
    analysis_status: str | None = None
    talent_pool: bool = False
    talent_pool_profile_status: str | None = None
    portal_access_hint: str | None = None
    status: str
    message: str


class PublicApplicantCheckResponse(BaseModel):
    exists: bool
    candidate_id: UUID | None = None
