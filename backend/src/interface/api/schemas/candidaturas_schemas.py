from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class ManualCandidateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_id: UUID | None = None
    resume_summary: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _require_email_or_phone(self) -> ManualCandidateRequest:
        if not self.email and not self.phone:
            raise ValueError("Informe pelo menos e-mail ou telefone.")
        return self


class ManualCandidateResponse(BaseModel):
    candidate_id: UUID
    full_name: str
    email: str | None
    phone: str | None
    job_id: UUID | None
    job_linked: bool
    duplicate_warning: str | None = None


class ImportCandidateErrorItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row: int
    message: str


class ImportRowError(ImportCandidateErrorItem):
    pass


class ImportCandidateAnalysisStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: UUID | None = None
    status: str | None = None
    created: bool | None = None
    blocked: bool | None = None
    reused: bool | None = None
    stuck: bool | None = None
    reason: str | None = None
    stage: str | None = None
    trigger_source: str | None = None


class ImportCandidatePreviewItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row: int | None = None
    nome: str | None = None
    email: str | None = None
    telefone: str | None = None
    status: str | None = None
    job_linked: bool | None = None
    job_link_error: str | None = None
    analysis: ImportCandidateAnalysisStatus | None = None


class ImportCandidatesResponse(BaseModel):
    created: int
    linked: int
    duplicates: int
    errors: list[ImportCandidateErrorItem]
    preview: list[ImportCandidatePreviewItem]
