from decimal import Decimal
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# Field types allowed for deal-breakers
DEAL_BREAKER_FIELDS = Literal[
    "location",
    "work_model",
    "education_level",
    "experience_years",
    "skill",
    "language",
    "availability",
    "custom_text",
]

# Operators allowed by field type
FIELD_OPERATORS = {
    "location": Literal["equals", "not_equals", "contains", "in"],
    "work_model": Literal["equals", "not_equals"],
    "education_level": Literal["equals", ">="],
    "experience_years": Literal[">=", "<=", "equals"],
    "skill": Literal["contains", "not_contains"],
    "language": Literal["equals", "contains"],
    "availability": Literal["equals"],
    "custom_text": Literal["contains"],
}


class DealBreaker(BaseModel):
    field: DEAL_BREAKER_FIELDS = Field(description="Type of field to evaluate")
    operator: Literal["equals", "not_equals", "contains", "not_contains", "in", ">=", "<="] = "equals"
    value: str | None = Field(default=None, description="Single value for operators like equals, contains, >=, <=")
    values: list[str] | None = Field(default=None, description="Multiple values for 'in' operator")
    reason: str = Field(min_length=1, max_length=500, description="Why this is a deal-breaker")
    is_active: bool = True

    @field_validator("operator", mode="after")
    @classmethod
    def validate_operator_for_field(cls, operator, info):
        """Validate that operator is allowed for the field type."""
        if "field" not in info.data:
            return operator

        field_type = info.data.get("field")
        allowed_ops = {
            "location": {"equals", "not_equals", "contains", "in"},
            "work_model": {"equals", "not_equals"},
            "education_level": {"equals", ">="},
            "experience_years": {">=", "<=", "equals"},
            "skill": {"contains", "not_contains"},
            "language": {"equals", "contains"},
            "availability": {"equals"},
            "custom_text": {"contains"},
        }

        if field_type in allowed_ops and operator not in allowed_ops[field_type]:
            raise ValueError(
                f"Operator '{operator}' not allowed for field '{field_type}'. "
                f"Allowed: {', '.join(sorted(allowed_ops[field_type]))}"
            )
        return operator

    @field_validator("value")
    @classmethod
    def validate_value_for_operator(cls, v, info):
        """Validate value based on operator."""
        if "operator" not in info.data:
            return v

        operator = info.data.get("operator")

        # 'in' operator requires values instead of value
        if operator == "in":
            return v

        # Other operators require value
        if operator != "in" and not v:
            raise ValueError(f"Operator '{operator}' requires 'value' field")

        return v


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
