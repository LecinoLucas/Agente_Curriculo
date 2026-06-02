from datetime import datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from src.interface.api.schemas.common import APISchemaModel, ORMAPISchemaModel

ApplicationSource = Literal["web_portal", "bot", "whatsapp", "staff"]
ApplicationStatus = Literal[
    "started",
    "qualified",
    "submitted",
    "linked_to_pipeline",
    "abandoned",
    "cancelled",
]


class CandidateApplicationCreateRequest(APISchemaModel):
    candidate_id: UUID
    job_id: UUID | None = None
    source: ApplicationSource = "staff"
    status: ApplicationStatus = "started"
    preferred_location_group_id: UUID | None = None
    preferred_unit_id: UUID | None = None
    accepts_any_unit_in_location: bool = False
    desired_job_area: str | None = Field(default=None, max_length=100)
    desired_shift: str | None = Field(default=None, max_length=100)
    lgpd_consent_at: datetime | None = None
    lgpd_consent_version: str | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def validate_any_unit_flag(self) -> Self:
        if self.accepts_any_unit_in_location:
            if self.preferred_location_group_id is None:
                raise ValueError("accepts_any_unit_in_location exige preferred_location_group_id.")
            if self.preferred_unit_id is not None:
                raise ValueError("accepts_any_unit_in_location exige preferred_unit_id nulo.")
        return self


class CandidateApplicationUpdateRequest(APISchemaModel):
    source: ApplicationSource | None = None
    status: ApplicationStatus | None = None
    preferred_location_group_id: UUID | None = None
    preferred_unit_id: UUID | None = None
    accepts_any_unit_in_location: bool | None = None
    desired_job_area: str | None = Field(default=None, max_length=100)
    desired_shift: str | None = Field(default=None, max_length=100)
    lgpd_consent_at: datetime | None = None
    lgpd_consent_version: str | None = Field(default=None, max_length=50)


class CandidateApplicationResponse(ORMAPISchemaModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID | None = None
    source: str
    status: str
    preferred_location_group_id: UUID | None = None
    preferred_unit_id: UUID | None = None
    accepts_any_unit_in_location: bool
    desired_job_area: str | None = None
    desired_shift: str | None = None
    lgpd_consent_at: datetime | None = None
    lgpd_consent_version: str | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class LinkApplicationPipelineResponse(APISchemaModel):
    application_id: UUID
    pipeline_id: UUID | None
    application_status: str
    created: bool


class CandidateLocationPreferenceCreateRequest(APISchemaModel):
    candidate_id: UUID
    location_group_id: UUID
    operational_unit_id: UUID | None = None
    desired_shift: str | None = Field(default=None, max_length=100)
    priority: int = Field(default=0, ge=0)


class CandidateLocationPreferenceResponse(ORMAPISchemaModel):
    id: UUID
    candidate_id: UUID
    location_group_id: UUID
    operational_unit_id: UUID | None = None
    desired_shift: str | None = None
    priority: int
    created_at: datetime
