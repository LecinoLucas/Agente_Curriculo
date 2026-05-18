from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class BehavioralAssignmentAnswerUpsertRequest(BaseModel):
    question_id: UUID
    answer_text: str | None = None
    answer_value: Decimal | None = None
    selected_options_json: list[str] | None = None


class BehavioralAssignmentAnswersRequest(BaseModel):
    answers: list[BehavioralAssignmentAnswerUpsertRequest] = Field(default_factory=list)


class BehavioralAssignmentSubmitRequest(BaseModel):
    answers: list[BehavioralAssignmentAnswerUpsertRequest] = Field(default_factory=list)


class BehavioralAssignmentAnswerResponse(BaseModel):
    question_id: UUID
    answer_text: str | None = None
    answer_value: Decimal | None = None
    selected_options_json: list[str] | None = None


class BehavioralAssignmentQuestionResponse(BaseModel):
    id: UUID
    question_text: str
    answer_type: str
    is_required: bool
    display_order: int
    options_json: list | dict | None = None
    answer: BehavioralAssignmentAnswerResponse | None = None


class BehavioralAssignmentCompetencyResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    display_order: int
    questions: list[BehavioralAssignmentQuestionResponse] = Field(default_factory=list)


class BehavioralAssignmentSummaryResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    job_title: str | None = None
    template_id: UUID
    template_name: str
    status: str
    assigned_at: datetime
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    expires_at: datetime | None = None
    ai_evaluation_status: str | None = None
    answered_count: int
    question_count: int


class BehavioralAssignmentDetailResponse(BehavioralAssignmentSummaryResponse):
    competencies: list[BehavioralAssignmentCompetencyResponse] = Field(default_factory=list)


class RecruiterBehavioralAssessmentStatusResponse(BaseModel):
    status: str | None = None
    assigned_at: datetime | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    template_name: str | None = None
    answered_count: int = 0
    question_count: int = 0
