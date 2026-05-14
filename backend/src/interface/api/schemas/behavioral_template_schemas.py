from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# Request Models
class BehavioralTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class BehavioralTemplateUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class BehavioralCompetencyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    weight: float = Field(default=1.0, ge=0)
    display_order: int = Field(default=0, ge=0)


class BehavioralCompetencyUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    weight: float | None = None
    display_order: int | None = None


class BehavioralQuestionCreateRequest(BaseModel):
    question_text: str = Field(min_length=1)
    answer_type: Literal["text", "scale", "multiple_choice"]
    is_required: bool = Field(default=True)
    weight: float = Field(default=1.0, ge=0)
    display_order: int = Field(default=0, ge=0)
    options_json: list[str] | None = None


class BehavioralQuestionUpdateRequest(BaseModel):
    question_text: str | None = None
    answer_type: Literal["text", "scale", "multiple_choice"] | None = None
    is_required: bool | None = None
    weight: float | None = None
    display_order: int | None = None
    options_json: list[str] | None = None


class JobBehavioralTemplateLinkRequest(BaseModel):
    behavioral_template_id: str | None = None


# Response Models
class BehavioralQuestionResponse(BaseModel):
    id: str
    competency_id: str
    question_text: str
    answer_type: str
    is_required: bool
    weight: float
    display_order: int
    options_json: list[str] | None = None


class BehavioralCompetencyResponse(BaseModel):
    id: str
    template_id: str
    name: str
    description: str | None = None
    weight: float
    display_order: int
    question_count: int = 0


class BehavioralCompetencyDetailResponse(BehavioralCompetencyResponse):
    questions: list[BehavioralQuestionResponse] = Field(default_factory=list)


class BehavioralTemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    status: str
    version: int
    competency_count: int = 0
    question_count: int = 0
    created_at: str
    updated_at: str
    archived_at: str | None = None


class BehavioralTemplateDetailResponse(BehavioralTemplateResponse):
    competencies: list[BehavioralCompetencyDetailResponse] = Field(default_factory=list)
