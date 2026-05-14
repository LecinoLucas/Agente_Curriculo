from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

InterviewScorecardStatus = Literal["draft", "submitted"]
InterviewFinalRecommendation = Literal["strong_yes", "yes", "neutral", "no", "strong_no"]


class InterviewScorecardItemUpsert(BaseModel):
    id: UUID | None = None
    competency_name: str = Field(..., min_length=1, max_length=255)
    question_text: str | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    evidence: str | None = None
    weight: Decimal = Field(default=Decimal("1.00"), ge=Decimal("0"))
    display_order: int = 0

    @field_validator("competency_name", "question_text", "evidence", mode="before")
    @classmethod
    def clean_optional_text(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class InterviewScorecardCreateRequest(BaseModel):
    interview_id: UUID | None = None
    overall_notes: str | None = None
    final_recommendation: InterviewFinalRecommendation | None = None
    items: list[InterviewScorecardItemUpsert] = Field(default_factory=list)


class InterviewScorecardPatchRequest(BaseModel):
    interview_id: UUID | None = None
    overall_notes: str | None = None
    final_recommendation: InterviewFinalRecommendation | None = None
    items: list[InterviewScorecardItemUpsert] | None = None


class InterviewScorecardItemResponse(BaseModel):
    id: UUID
    scorecard_id: UUID
    competency_name: str
    question_text: str | None = None
    rating: int | None = None
    evidence: str | None = None
    weight: Decimal
    display_order: int
    created_at: datetime
    updated_at: datetime


class InterviewScorecardResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    interview_id: UUID | None = None
    evaluator_id: UUID | None = None
    status: InterviewScorecardStatus
    final_recommendation: InterviewFinalRecommendation | None = None
    overall_notes: str | None = None
    submitted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    items: list[InterviewScorecardItemResponse] = Field(default_factory=list)


class InterviewScorecardEnvelopeResponse(BaseModel):
    scorecard: InterviewScorecardResponse | None = None
    suggested_behavioral_questions: list[str] = Field(default_factory=list)
