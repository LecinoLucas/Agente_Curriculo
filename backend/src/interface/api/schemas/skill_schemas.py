from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SkillEquivalenceGroupResponse(BaseModel):
    id: str
    canonical: str
    aliases: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    type: Optional[str] = None
    strength: str = "partial"


class CreateSkillEquivalenceGroupRequest(BaseModel):
    canonical: str = Field(min_length=1, max_length=255)
    aliases: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    type: Optional[str] = Field(default="skill", max_length=50)
    strength: str = Field(default="partial", pattern="^(exact|strong|partial|weak)$")


class UpdateSkillEquivalenceGroupRequest(BaseModel):
    canonical: Optional[str] = Field(default=None, min_length=1, max_length=255)
    aliases: Optional[list[str]] = None
    domains: Optional[list[str]] = None
    type: Optional[str] = Field(default=None, max_length=50)
    strength: Optional[str] = Field(default=None, pattern="^(exact|strong|partial|weak)$")


class JobRequiredSkillResponse(BaseModel):
    id: UUID
    job_id: UUID
    skill_id: UUID
    skill_name: str
    priority_level: Literal["priority", "complementary", "eliminatory"]
    minimum_level: Optional[str] = None
    minimum_years: Optional[Decimal] = None
    weight: Decimal

    model_config = {
        "from_attributes": True,
        "json_encoders": {
            Decimal: lambda v: float(v),
        },
    }


class AddJobSkillRequest(BaseModel):
    skill_name: str = Field(min_length=1, max_length=255)
    priority_level: Literal["priority", "complementary", "eliminatory"] = "complementary"
    minimum_level: Optional[str] = Field(default=None, max_length=50)
    minimum_years: Optional[Decimal] = Field(default=None, ge=0, le=80)
    weight: Decimal = Field(default=Decimal("1.00"), ge=0, le=10)
