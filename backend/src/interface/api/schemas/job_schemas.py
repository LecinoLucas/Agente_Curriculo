from decimal import Decimal
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class DealBreaker(BaseModel):
    field: str = Field(min_length=1, max_length=100)
    operator: Literal["equals", "not_equals", "contains", "in"] = "equals"
    value: str | None = None
    values: list[str] | None = None
    reason: str = Field(min_length=1, max_length=500)
    is_active: bool = True


class JobResponse(BaseModel):
    id: UUID
    title: str
    description: str
    requirements: str | None = None
    status: str
    seniority_level: str | None = None
    minimum_education_level: str | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] = Field(default_factory=list)
    work_model: str | None = None
    location: str | None = None
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str
    created_by: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CreateJobRequest(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10)
    requirements: str | None = None
    status: Literal["draft", "published", "paused", "closed", "cancelled"] = "draft"
    seniority_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_education_level: Literal["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"] | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] = Field(default_factory=list)
    work_model: Literal["remote", "hybrid", "onsite"] | None = None
    location: str | None = Field(default=None, max_length=255)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str = Field(default="BRL", min_length=3, max_length=10)


class UpdateJobRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, min_length=10)
    requirements: str | None = None
    status: Literal["draft", "published", "paused", "closed", "cancelled"] | None = None
    seniority_level: Literal["intern", "junior", "mid", "senior", "lead", "principal", "director"] | None = None
    minimum_education_level: Literal["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"] | None = None
    minimum_years_experience: Decimal | None = None
    deal_breakers: list[DealBreaker] | None = None
    work_model: Literal["remote", "hybrid", "onsite"] | None = None
    location: str | None = Field(default=None, max_length=255)
    salary_min: Decimal | None = None
    salary_max: Decimal | None = None
    salary_currency: str | None = Field(default=None, min_length=3, max_length=10)
