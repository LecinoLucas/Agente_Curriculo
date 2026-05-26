from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

PreAdmissionStatus = Literal[
    "draft",
    "offer_preparing",
    "offer_sent",
    "offer_accepted",
    "offer_declined",
    "documents_pending",
    "documents_received",
    "ready_for_admission",
    "admitted",
    "cancelled",
]
PreAdmissionChecklistItemType = Literal[
    "cpf",
    "rg",
    "comprovante_endereco",
    "carteira_trabalho",
    "pis",
    "titulo_eleitor",
    "certificado_reservista",
    "exame_admissional",
    "dados_bancarios",
    "other",
]
PreAdmissionChecklistItemStatus = Literal["pending", "received", "approved", "rejected", "waived"]
PreAdmissionDocumentStatus = Literal["uploaded", "approved", "rejected", "replaced"]


class PreAdmissionCreateRequest(BaseModel):
    salary_offer: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    start_date: date | None = None
    work_model: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("work_model", "notes", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionUpdateRequest(BaseModel):
    status: PreAdmissionStatus | None = None
    salary_offer: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    start_date: date | None = None
    work_model: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("work_model", "notes", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistItemCreateRequest(BaseModel):
    item_type: PreAdmissionChecklistItemType
    title: str = Field(min_length=1, max_length=180)
    status: PreAdmissionChecklistItemStatus = "pending"
    required: bool = True
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("title", "notes", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistItemUpdateRequest(BaseModel):
    item_type: PreAdmissionChecklistItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=180)
    status: PreAdmissionChecklistItemStatus | None = None
    required: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("title", "notes", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistItemResponse(BaseModel):
    id: UUID
    case_id: UUID
    item_type: PreAdmissionChecklistItemType
    title: str
    status: PreAdmissionChecklistItemStatus
    required: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class PreAdmissionDocumentResponse(BaseModel):
    id: UUID
    case_id: UUID
    checklist_item_id: UUID
    candidate_id: UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    status: PreAdmissionDocumentStatus
    uploaded_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by: UUID | None = None
    review_notes: str | None = None
    rejection_reason_public: str | None = None
    created_at: datetime
    updated_at: datetime


class PreAdmissionChecklistItemWithDocumentsResponse(PreAdmissionChecklistItemResponse):
    documents: list[PreAdmissionDocumentResponse] = Field(default_factory=list)


class PreAdmissionDocumentRejectRequest(BaseModel):
    """Request body for rejecting a pre-admission document.

    Two independent text fields:

    - ``rejection_reason_public`` is shown to the candidate on the portal.
    - ``review_notes`` is the internal RH note and must never reach the
      candidate.

    At least one of the two must be provided so the staff/auditor knows why a
    document was rejected.
    """

    rejection_reason_public: str | None = Field(default=None, max_length=1000)
    review_notes: str | None = Field(default=None, max_length=2000)

    @field_validator("rejection_reason_public", "review_notes", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionEventResponse(BaseModel):
    id: UUID
    case_id: UUID
    event_type: str
    actor_id: UUID | None = None
    payload_json: dict | None = None
    created_at: datetime


class PreAdmissionCaseResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    hiring_decision_id: UUID
    status: PreAdmissionStatus
    salary_offer: Decimal | None = None
    start_date: date | None = None
    work_model: str | None = None
    notes: str | None = None
    created_by: UUID | None = None
    ready_for_export: bool = False
    ready_for_export_at: datetime | None = None
    ready_for_export_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None
    checklist_items: list[PreAdmissionChecklistItemResponse] = Field(default_factory=list)


class PreAdmissionEnvelopeResponse(BaseModel):
    case: PreAdmissionCaseResponse | None = None
    hiring_decision_outcome: str | None = None
    can_create: bool = False


class PreAdmissionEventsResponse(BaseModel):
    events: list[PreAdmissionEventResponse] = Field(default_factory=list)


class PreAdmissionDocumentsResponse(BaseModel):
    documents: list[PreAdmissionDocumentResponse] = Field(default_factory=list)


class CandidatePortalPreAdmissionUploadedDocumentResponse(BaseModel):
    id: UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    status: PreAdmissionDocumentStatus
    uploaded_at: datetime


class CandidatePortalPreAdmissionChecklistItemResponse(BaseModel):
    item_id: UUID
    title: str
    description: str | None = None
    required: bool
    status: PreAdmissionChecklistItemStatus
    rejection_reason_public: str | None = None
    uploaded_document: CandidatePortalPreAdmissionUploadedDocumentResponse | None = None
    allowed_file_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int


class CandidatePortalPreAdmissionSummary(BaseModel):
    has_pre_admission_case: bool
    pre_admission_status: PreAdmissionStatus | None = None
    documents_total: int = 0
    documents_pending: int = 0
    documents_submitted: int = 0
    documents_approved: int = 0
    next_pending_document: str | None = None


class CandidatePortalPreAdmissionCaseResponse(BaseModel):
    id: UUID
    status: PreAdmissionStatus
    salary_offer: Decimal | None = None
    start_date: date | None = None
    work_model: str | None = None
    checklist_items: list[CandidatePortalPreAdmissionChecklistItemResponse] = Field(default_factory=list)
    summary: CandidatePortalPreAdmissionSummary


class CandidatePortalPreAdmissionEnvelopeResponse(BaseModel):
    case: CandidatePortalPreAdmissionCaseResponse | None = None
    summary: CandidatePortalPreAdmissionSummary


class AdmissionCaseSummarySchema(BaseModel):
    id: UUID
    status: str
    current_stage: str
    created_at: datetime
    updated_at: datetime


class AdmissionCandidateSummarySchema(BaseModel):
    id: UUID
    name: str
    initials: str
    avatar_url: str | None = None


class AdmissionJobSummarySchema(BaseModel):
    id: UUID
    title: str


class AdmissionChecklistItemSchema(BaseModel):
    id: UUID
    title: str
    status: str
    required: bool
    position: int
    updated_at: datetime
    updated_by_name: str | None = None
    document_id: UUID | None = None


class AdmissionChecklistSummarySchema(BaseModel):
    total: int
    approved: int
    pending: int
    blocked: int
    items: list[AdmissionChecklistItemSchema] = Field(default_factory=list)


class AdmissionDocumentSummarySchema(BaseModel):
    id: UUID
    filename: str
    document_type: str
    status: str
    uploaded_at: datetime
    approved_at: datetime | None = None


class AdmissionBlockerSchema(BaseModel):
    type: str
    severity: str
    title: str
    description: str
    action: str


class AdmissionNextActionSchema(BaseModel):
    type: str
    label: str
    enabled: bool
    disabled_reason: str | None = None


class AdmissionCaseWorkspaceSummarySchema(BaseModel):
    responsible_name: str | None = None
    created_at: datetime
    last_update_at: datetime
    readiness_status: str
    ready_for_export: bool


class AdmissionRecentEventSchema(BaseModel):
    id: UUID
    type: str
    title: str
    description: str
    created_at: datetime


class AdmissionCaseWorkspaceResponse(BaseModel):
    case: AdmissionCaseSummarySchema
    candidate: AdmissionCandidateSummarySchema
    job: AdmissionJobSummarySchema
    checklist: AdmissionChecklistSummarySchema
    documents: list[AdmissionDocumentSummarySchema] = Field(default_factory=list)
    main_blockers: list[AdmissionBlockerSchema] = Field(default_factory=list)
    next_actions: list[AdmissionNextActionSchema] = Field(default_factory=list)
    summary: AdmissionCaseWorkspaceSummarySchema
    recent_events: list[AdmissionRecentEventSchema] = Field(default_factory=list)
