"""Schemas for admission export packages."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DocumentMetadataInPackage(BaseModel):
    """Document metadata in admission package."""
    checklist_item_id: str
    title: str
    status: str  # approved, waived, etc.
    document_id: str
    mime_type: str
    size_bytes: int


class CandidateDataInPackage(BaseModel):
    """Candidate data snapshot."""
    id: str
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    cpf: Optional[str] = None


class JobDataInPackage(BaseModel):
    """Job data snapshot."""
    id: str
    title: str
    company: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None


class PreAdmissionDataInPackage(BaseModel):
    """Pre-admission case data snapshot."""
    case_id: str
    status: str
    start_date: Optional[str] = None
    salary_offer: Optional[float] = None
    work_model: Optional[str] = None


class DecisionDataInPackage(BaseModel):
    """Hiring decision snapshot."""
    hiring_decision_id: str
    decision_outcome: str
    reason_code: Optional[str] = None
    submitted_at: Optional[str] = None


class AdmissionPackagePayload(BaseModel):
    """Complete admission package payload."""
    candidate: CandidateDataInPackage
    job: JobDataInPackage
    pre_admission: PreAdmissionDataInPackage
    documents: list[DocumentMetadataInPackage]
    decision: DecisionDataInPackage


class ValidationErrorDetail(BaseModel):
    """Validation error detail."""
    field: str
    message: str


class AdmissionPackageCreateRequest(BaseModel):
    """Request to create admission export package."""
    case_id: str = Field(..., description="Pre-admission case ID")


class AdmissionPackageApproveRequest(BaseModel):
    """Request to approve admission package."""
    pass


class AdmissionPackageCancelRequest(BaseModel):
    """Request to cancel admission package."""
    reason: Optional[str] = None


class AdmissionPackageResponse(BaseModel):
    """Admission export package response."""
    id: str
    case_id: str
    candidate_id: str
    job_id: str
    status: str
    payload: AdmissionPackagePayload
    validation_errors: Optional[list[ValidationErrorDetail]] = None
    created_by: Optional[str] = None
    approved_by: Optional[str] = None
    exported_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    approved_at: Optional[datetime] = None
    exported_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None


class AdmissionPackageStatusResponse(BaseModel):
    """Simplified response for package status."""
    id: str
    status: str
    created_at: datetime
    approved_at: Optional[datetime] = None


class AdmissionPackageExportResponse(BaseModel):
    """Response for JSON/CSV export."""
    id: str
    status: str
    payload: AdmissionPackagePayload
    exported_at: Optional[datetime] = None


class ErpIntegrationAttemptValidationError(BaseModel):
    field: str
    message: str


class ErpDryRunPreviewPayload(BaseModel):
    provider: str
    mode: str
    candidate: dict
    job: dict
    admission: dict
    decision: dict
    documents: list[dict]


class ErpIntegrationAttemptResponse(BaseModel):
    id: str
    package_id: str
    case_id: str
    candidate_id: str
    job_id: str
    provider: str
    mode: str
    status: str
    request_payload_json: ErpDryRunPreviewPayload
    response_payload_json: dict | None = None
    validation_errors_json: list[ErpIntegrationAttemptValidationError] | None = None
    error_message: str | None = None
    attempted_by: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class ErpIntegrationAttemptListResponse(BaseModel):
    attempts: list[ErpIntegrationAttemptResponse]
