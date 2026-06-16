from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
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
    "dismissed",
    "cancelled",
]
PreAdmissionChecklistItemType = str
PreAdmissionChecklistItemStatus = Literal["pending", "received", "approved", "rejected", "waived"]
PreAdmissionDocumentStatus = Literal["uploaded", "approved", "rejected", "replaced"]


class PreAdmissionCreateRequest(BaseModel):
    checklist_template_id: UUID | None = None
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


class DismissAdmissionRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason", mode="before")
    @classmethod
    def clean_reason(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistItemCreateRequest(BaseModel):
    item_type: PreAdmissionChecklistItemType
    document_key: str | None = Field(default=None, min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=180)
    status: PreAdmissionChecklistItemStatus = "pending"
    required: bool = True
    notes: str | None = Field(default=None, max_length=2000)
    candidate_description: str | None = Field(default=None, max_length=2000)
    accepted_file_types: list[str] | None = None
    max_file_size_mb: int | None = Field(default=None, ge=1, le=50)
    display_order: int | None = Field(default=None, ge=0)

    @field_validator("document_key", "title", "notes", "candidate_description", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistItemUpdateRequest(BaseModel):
    item_type: PreAdmissionChecklistItemType | None = None
    document_key: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, min_length=1, max_length=180)
    status: PreAdmissionChecklistItemStatus | None = None
    required: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)
    candidate_description: str | None = Field(default=None, max_length=2000)
    accepted_file_types: list[str] | None = None
    max_file_size_mb: int | None = Field(default=None, ge=1, le=50)
    display_order: int | None = Field(default=None, ge=0)

    @field_validator("document_key", "title", "notes", "candidate_description", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistItemResponse(BaseModel):
    id: UUID
    case_id: UUID
    template_item_id: UUID | None = None
    document_key: str
    item_type: PreAdmissionChecklistItemType
    title: str
    status: PreAdmissionChecklistItemStatus
    required: bool
    notes: str | None = None
    candidate_description: str | None = None
    accepted_file_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int
    display_order: int
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
    checklist_template_id: UUID | None = None
    checklist_template_name: str | None = None
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
    dismissed_at: datetime | None = None
    dismissal_reason: str | None = None
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
    status_public_label: str
    uploaded_at: datetime


class CandidatePortalPreAdmissionChecklistItemResponse(BaseModel):
    item_id: UUID
    title: str
    description: str | None = None
    required: bool
    status: PreAdmissionChecklistItemStatus
    status_public_label: str
    rejection_reason_public: str | None = None
    uploaded_document: CandidatePortalPreAdmissionUploadedDocumentResponse | None = None
    allowed_file_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int


class CandidatePortalPreAdmissionSummary(BaseModel):
    has_pre_admission_case: bool
    pre_admission_status: PreAdmissionStatus | None = None
    status_public_label: str | None = None
    documents_total: int = 0
    documents_pending: int = 0
    documents_submitted: int = 0
    documents_approved: int = 0
    next_pending_document: str | None = None


class CandidatePortalPreAdmissionCaseResponse(BaseModel):
    id: UUID
    status: PreAdmissionStatus
    status_public_label: str
    salary_offer: Decimal | None = None
    start_date: date | None = None
    work_model: str | None = None
    checklist_items: list[CandidatePortalPreAdmissionChecklistItemResponse] = Field(default_factory=list)
    summary: CandidatePortalPreAdmissionSummary


class CandidatePortalPreAdmissionEnvelopeResponse(BaseModel):
    case: CandidatePortalPreAdmissionCaseResponse | None = None
    summary: CandidatePortalPreAdmissionSummary


class CandidatePortalPreAdmissionDocumentUploadResponse(BaseModel):
    id: UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    status: PreAdmissionDocumentStatus
    status_public_label: str
    uploaded_at: datetime


class PreAdmissionChecklistTemplateItemCreateRequest(BaseModel):
    document_key: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=180)
    candidate_description: str | None = Field(default=None, max_length=2000)
    is_required: bool = True
    accepted_file_types: list[str] | None = None
    max_file_size_mb: int = Field(default=10, ge=1, le=50)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool = True

    @field_validator("document_key", "title", "candidate_description", mode="before")
    @classmethod
    def clean_template_item_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistTemplateItemUpdateRequest(BaseModel):
    document_key: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, min_length=1, max_length=180)
    candidate_description: str | None = Field(default=None, max_length=2000)
    is_required: bool | None = None
    accepted_file_types: list[str] | None = None
    max_file_size_mb: int | None = Field(default=None, ge=1, le=50)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("document_key", "title", "candidate_description", mode="before")
    @classmethod
    def clean_template_item_update_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistTemplateItemResponse(BaseModel):
    id: UUID
    template_id: UUID
    document_key: str
    title: str
    candidate_description: str | None = None
    is_required: bool
    accepted_file_types: list[str] = Field(default_factory=list)
    max_file_size_mb: int
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PreAdmissionChecklistTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    admission_type: str | None = Field(default=None, max_length=80)
    is_active: bool = True
    is_default: bool = False

    @field_validator("name", "description", "admission_type", mode="before")
    @classmethod
    def clean_template_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistTemplateUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    admission_type: str | None = Field(default=None, max_length=80)
    is_active: bool | None = None
    is_default: bool | None = None

    @field_validator("name", "description", "admission_type", mode="before")
    @classmethod
    def clean_template_update_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class PreAdmissionChecklistTemplateResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    admission_type: str | None = None
    is_active: bool
    is_default: bool
    item_count: int
    created_at: datetime
    updated_at: datetime


class PreAdmissionChecklistTemplateDetailResponse(PreAdmissionChecklistTemplateResponse):
    items: list[PreAdmissionChecklistTemplateItemResponse] = Field(default_factory=list)


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
    checklist_item_id: UUID
    checklist_title: str
    required: bool
    filename: str
    document_type: str
    mime_type: str
    size_bytes: int
    status: str
    uploaded_at: datetime
    reviewed_at: datetime | None = None
    reviewed_by_name: str | None = None
    review_notes: str | None = None
    rejection_reason_public: str | None = None
    approved_at: datetime | None = None
    is_current_for_item: bool = True


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
    actor_name: str | None = None


class AdmissionProgressSchema(BaseModel):
    total: int
    approved: int
    pending: int
    rejected: int
    in_review: int
    waived: int


class AdmissionIntegrationStatusSchema(BaseModel):
    state: str
    label: str
    ready_for_export: bool


class AdmissionProtheusBridgeLatestTraceSchema(BaseModel):
    trace_id: str | None = None
    action_type: str | None = None
    status: str | None = None
    blocked_reason: str | None = None
    error_code: str | None = None
    created_at: datetime | None = None


class AdmissionProtheusBridgeSafetySchema(BaseModel):
    would_execute: bool = False
    protheus_registration: str | None = None
    erp_send_attempted: bool = False
    registration_routine_called: bool = False


class AdmissionProtheusBridgeSummaryResponse(BaseModel):
    enabled: bool
    available: bool
    status: str
    message: str | None = None
    environment: str | None = None
    storage_mode: str | None = None
    readiness: str | None = None
    latest_trace: AdmissionProtheusBridgeLatestTraceSchema | None = None
    safety: AdmissionProtheusBridgeSafetySchema
    next_action: str
    dashboard_url: str


class AdmissionCaseOverviewResponse(BaseModel):
    case: AdmissionCaseSummarySchema
    candidate: AdmissionCandidateSummarySchema
    job: AdmissionJobSummarySchema
    status_label: str
    progress: AdmissionProgressSchema
    main_blocker: AdmissionBlockerSchema | None = None
    main_blockers: list[AdmissionBlockerSchema] = Field(default_factory=list)
    next_action: AdmissionNextActionSchema | None = None
    next_actions: list[AdmissionNextActionSchema] = Field(default_factory=list)
    summary: AdmissionCaseWorkspaceSummarySchema
    integration_status: AdmissionIntegrationStatusSchema
    updated_at: datetime


class AdmissionCaseDocumentsResponse(BaseModel):
    checklist: AdmissionChecklistSummarySchema
    documents: list[AdmissionDocumentSummarySchema] = Field(default_factory=list)


class AdmissionCaseEventsPageResponse(BaseModel):
    items: list[AdmissionRecentEventSchema] = Field(default_factory=list)
    total: int
    page: int
    page_size: int
    has_next: bool


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


# ── Protheus Export Queue ─────────────────────────────────────────────────────


class ProtheusExportQueueCreateRequest(BaseModel):
    unit_code: str = Field(default="STUB", max_length=40)
    protheus_group_code: str = Field(default="T01", max_length=40)
    protheus_branch_code: str = Field(default="01", max_length=40)


class ProtheusExportQueuePreflightResponse(BaseModel):
    payload_status: str
    payload_status_label: str
    pending_requirements: list[str] = Field(default_factory=list)
    shape_debug: dict[str, Any] | None = None
    safe_error_code: str | None = None
    safe_error_message: str | None = None
    can_enqueue: bool
    is_stub_mode: bool
    disclaimer: str | None = None


class ProtheusExportQueueStatusResponse(BaseModel):
    id: str
    case_id: str
    status: str
    status_label: str
    recommended_action: str
    attempt_count: int
    max_attempts: int
    next_attempt_at: datetime | None = None
    last_error_code: str | None = None
    last_error_message_redacted: str | None = None
    last_trace_id: str | None = None
    can_cancel: bool
    can_retry_manually: bool
    created_at: str
    updated_at: str
    finished_at: str | None = None
    payload_status: str | None = None
    payload_status_label: str | None = None
    pending_requirements: list[str] = Field(default_factory=list)
    can_request_new: bool
    can_enqueue: bool
    is_stub_mode: bool
    disclaimer: str | None = None


class ProtheusExportQueueCreateResponse(BaseModel):
    was_existing: bool
    export_request: ProtheusExportQueueStatusResponse


class ProtheusExportDashboardTotalsResponse(BaseModel):
    queued: int = 0
    processing: int = 0
    retry_scheduled: int = 0
    success: int = 0
    failed_permanent: int = 0
    blocked: int = 0
    cancelled: int = 0
    unknown: int = 0


class ProtheusExportDashboardTopErrorResponse(BaseModel):
    code: str | None = None
    message_redacted: str | None = None
    count: int = 0


class ProtheusExportDashboardOperationalFlagsResponse(BaseModel):
    is_stub_mode: bool
    bridge_enabled: bool
    real_send_enabled: bool


class ProtheusExportDashboardSummaryResponse(BaseModel):
    total: int
    active: int
    terminal: int
    action_required: int
    totals_by_status: ProtheusExportDashboardTotalsResponse
    top_errors: list[ProtheusExportDashboardTopErrorResponse] = Field(default_factory=list)
    operational_flags: ProtheusExportDashboardOperationalFlagsResponse


class ProtheusExportDashboardItemResponse(BaseModel):
    id: str
    case_id: str
    status: str
    status_label: str
    payload_status: str | None = None
    payload_status_label: str | None = None
    attempt_count: int
    max_attempts: int
    next_attempt_at: datetime | None = None
    last_error_code: str | None = None
    last_error_message_redacted: str | None = None
    blocked_reason: str | None = None
    last_trace_id: str | None = None
    created_at: str
    updated_at: str
    finished_at: str | None = None
    recommended_action: str
    can_cancel: bool
    can_retry_manually: bool
    can_request_new: bool
    is_stub_mode: bool


class ProtheusExportDashboardItemsResponse(BaseModel):
    items: list[ProtheusExportDashboardItemResponse] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    has_next: bool
