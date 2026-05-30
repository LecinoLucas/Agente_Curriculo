from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class ManualCandidateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    job_id: UUID | None = None
    resume_summary: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _require_email_or_phone(self) -> "ManualCandidateRequest":
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


class ImportCandidatesResponse(BaseModel):
    created: int
    linked: int
    duplicates: int
    errors: list[ImportRowError]
    preview: list[dict]


class ImportRowError(BaseModel):
    row: int
    message: str
