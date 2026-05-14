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
    created_at: datetime
    updated_at: datetime


class PreAdmissionChecklistItemWithDocumentsResponse(PreAdmissionChecklistItemResponse):
    documents: list[PreAdmissionDocumentResponse] = Field(default_factory=list)


class PreAdmissionDocumentRejectRequest(BaseModel):
    review_notes: str = Field(min_length=1, max_length=2000)

    @field_validator("review_notes", mode="before")
    @classmethod
    def clean_review_notes(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
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


class CandidatePortalPreAdmissionCaseResponse(BaseModel):
    id: UUID
    status: PreAdmissionStatus
    salary_offer: Decimal | None = None
    start_date: date | None = None
    work_model: str | None = None
    checklist_items: list[PreAdmissionChecklistItemWithDocumentsResponse] = Field(default_factory=list)


class CandidatePortalPreAdmissionEnvelopeResponse(BaseModel):
    case: CandidatePortalPreAdmissionCaseResponse | None = None
