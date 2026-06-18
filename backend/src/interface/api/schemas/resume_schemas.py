from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ResumeUploadResponse(BaseModel):
    resume_id: UUID
    candidate_id: UUID
    version_id: UUID
    upload_url: str
    upload_fields: dict[str, str]


class ResumeUploadRequest(BaseModel):
    candidate_id: UUID | None = None


class ResumeFileUploadResponse(BaseModel):
    resume_id: UUID
    candidate_id: UUID
    candidate_full_name: str
    version_id: UUID
    analysis_auto_requested: bool = False
    analysis_id: UUID | None = None
    analysis_status: str | None = None
    original_file_name: str
    file_size_bytes: int
    file_hash_sha256: str
    extraction_status: str
    page_count: int | None = None
    word_count: int | None = None
    prefilled_fields: list[str] = Field(default_factory=list)


class ResumeVersionResponse(BaseModel):
    id: UUID
    version_number: int
    original_file_name: str
    mime_type: str
    extraction_status: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class ResumeResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    title: str
    status: str
    current_version: int
    created_at: datetime
    updated_at: datetime
    versions: list[ResumeVersionResponse]


class ResumeSummaryResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    candidate_name: str | None = None
    title: str
    status: str
    current_version: int
    current_version_id: UUID | None = None
    current_file_name: str | None = None
    extraction_status: str | None = None
    updated_at: datetime


class ResumeExtractionStatusResponse(BaseModel):
    resume_id: UUID
    version_id: UUID
    extraction_status: str
    extraction_error: str | None = None
    original_file_name: str
    page_count: int | None = None
    word_count: int | None = None
    can_retry_extraction: bool = False
    retry_extraction_reason: str | None = None
    extraction_status_label: str | None = None


class ResumeExtractionRetryResponse(BaseModel):
    resume_id: UUID
    version_id: UUID
    extraction_status: str
    queued: bool
    can_retry_extraction: bool
    message: str


class UpdateResumeRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    status: Literal["active", "archived"] | None = None
