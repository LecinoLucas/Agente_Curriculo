from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from src.interface.api.schemas.common import APISchemaModel


class AdmittedCandidatesStatusResponse(APISchemaModel):
    admission_case_id: UUID
    admission_status: str
    admitted_at: datetime | None = None
    dismissed_at: datetime | None = None
    dismissal_reason: str | None = None


class AdmittedCandidateResponse(APISchemaModel):
    candidate_id: UUID
    candidate_name: str
    candidate_email: str | None = None
    job_id: UUID
    job_title: str
    pipeline_id: UUID | None = None
    admission_case_id: UUID
    admission_status: str
    admitted_at: datetime
    dismissed_at: datetime | None = None
    start_date: date | None = None
    work_model: str | None = None


class AdmittedCandidatesSummaryResponse(APISchemaModel):
    total_admitted: int = 0
    admitted_this_month: int = 0
    latest_admitted_at: datetime | None = None


class AdmittedCandidatesPageResponse(APISchemaModel):
    data: list[AdmittedCandidateResponse] = Field(default_factory=list)
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: AdmittedCandidatesSummaryResponse
