from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SkillResponse(BaseModel):
    id: UUID
    name: str
    normalized_name: str
    category: Optional[str] = None
    aliases: list[str] = Field(default_factory=list)
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateSkillRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    aliases: list[str] = Field(default_factory=list)


class UpdateSkillRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    aliases: Optional[list[str]] = None
    is_verified: Optional[bool] = None


class JobRequiredSkillResponse(BaseModel):
    id: UUID
    job_id: UUID
    skill_id: UUID
    skill_name: str
    is_mandatory: bool
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
    skill_id: UUID
    is_mandatory: bool = False
    minimum_level: Optional[str] = Field(default=None, max_length=50)
    minimum_years: Optional[Decimal] = Field(default=None, ge=0, le=80)
    weight: Decimal = Field(default=Decimal("1.00"), ge=0, le=10)