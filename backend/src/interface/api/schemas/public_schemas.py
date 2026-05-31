from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class PublicJobResponse(BaseModel):
    id: UUID
    title: str
    location: str | None = None
    job_area: str | None = None

    model_config = {"from_attributes": True}


class PublicJobDetailResponse(BaseModel):
    """Detalhe público de uma vaga — apenas campos seguros para exibição ao candidato.

    Campos excluídos intencionalmente: created_by, quality_score, quality_status,
    deal_breakers, mandatory_skills, behavioral_template_id, screening_questions,
    job_profile_json, skill_requirements, audit timestamps.
    """

    id: UUID
    title: str
    description: str
    requirements: str | None = None
    responsibilities: str | None = None
    location: str | None = None
    job_area: str | None = None
    work_model: str | None = None
    seniority_level: str | None = None
    benefits: list = Field(default_factory=list)
    working_hours: str | None = None
    published_at: datetime | None = None

    model_config = {"from_attributes": True}


class PublicApplyResponse(BaseModel):
    candidate_id: UUID
    resume_id: UUID
    resume_version_id: UUID
    job_id: UUID | None = None
    pipeline_id: UUID | None = None
    analysis_auto_requested: bool = False
    analysis_id: UUID | None = None
    analysis_status: str = "not_requested"
    talent_pool: bool = False
    talent_pool_profile_status: str | None = None
    portal_access_hint: str | None = None
    status: str
    message: str


class PublicApplicantCheckResponse(BaseModel):
    exists: bool
    candidate_id: UUID | None = None
