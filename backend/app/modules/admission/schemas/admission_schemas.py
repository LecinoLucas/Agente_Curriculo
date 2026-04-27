from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


AdmissionStatus = Literal["pending", "in_progress", "approved", "rejected"]
DocumentStatus = Literal["pending", "approved", "rejected"]
ValidationStatus = Literal["approved", "rejected"]


class AdmissionResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    status: AdmissionStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdmissionProgressResponse(BaseModel):
    total_required: int
    total_sent: int
    total_approved: int
    percentage: float


class UploadDocumentRequest(BaseModel):
    file_path: str = Field(min_length=1)
    requirement_id: UUID


class ValidateDocumentRequest(BaseModel):
    status: ValidationStatus


class CandidateDocumentResponse(BaseModel):
    id: UUID
    admission_id: UUID
    document_requirement_id: UUID
    file_path: str
    status: DocumentStatus
    uploaded_at: datetime
    validated_at: datetime | None

    model_config = {"from_attributes": True}
