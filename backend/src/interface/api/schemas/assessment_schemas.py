from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

AssessmentType = Literal["behavioral_test", "behavioral_survey"]
AssessmentStatus = Literal["pending", "in_progress", "completed", "expired", "cancelled"]
QuestionType = Literal["single_choice", "multiple_choice", "scale", "text"]
TemplateStatus = Literal["draft", "active", "archived"]


class AssessmentOptionInput(BaseModel):
    option_text: str = Field(min_length=1, max_length=1000)
    score_value: Decimal | None = None
    metadata: dict | None = None
    order_index: int = 0


class AssessmentQuestionInput(BaseModel):
    question_text: str = Field(min_length=1, max_length=4000)
    question_type: QuestionType
    required: bool = True
    order_index: int = 0
    metadata: dict | None = None
    options: list[AssessmentOptionInput] = Field(default_factory=list)


class AssessmentTemplateCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    type: AssessmentType
    status: TemplateStatus = "active"
    version: int = Field(default=1, ge=1)
    questions: list[AssessmentQuestionInput] = Field(default_factory=list)


class AssessmentTemplateUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    status: TemplateStatus | None = None


class AssessmentTemplateResponse(BaseModel):
    id: UUID
    title: str
    description: str | None = None
    type: AssessmentType
    status: str
    version: int
    question_count: int = 0
    created_at: datetime
    updated_at: datetime


class AssessmentTemplateDuplicateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    status: TemplateStatus = "draft"


class AssessmentTemplateListFilters(BaseModel):
    type: AssessmentType | None = None
    status: TemplateStatus | None = None


class AssessmentQuestionResponse(BaseModel):
    id: UUID
    question_text: str
    question_type: QuestionType
    required: bool
    order_index: int
    metadata: dict | None = None
    options: list["AssessmentOptionResponse"] = Field(default_factory=list)


class AssessmentOptionResponse(BaseModel):
    id: UUID
    option_text: str
    score_value: Decimal | None = None
    metadata: dict | None = None
    order_index: int


class AssessmentTemplateDetailResponse(AssessmentTemplateResponse):
    questions: list[AssessmentQuestionResponse] = Field(default_factory=list)
    job_link_count: int = 0
    assignment_count: int = 0
    is_used: bool = False


class AssessmentQuestionCreateRequest(BaseModel):
    question_text: str = Field(min_length=1, max_length=4000)
    question_type: QuestionType
    required: bool = True
    order_index: int = 0
    metadata: dict | None = None
    options: list[AssessmentOptionInput] = Field(default_factory=list)


class AssessmentQuestionUpdateRequest(BaseModel):
    question_text: str | None = Field(default=None, min_length=1, max_length=4000)
    question_type: QuestionType | None = None
    required: bool | None = None
    order_index: int | None = None
    metadata: dict | None = None


class AssessmentOptionCreateRequest(BaseModel):
    option_text: str = Field(min_length=1, max_length=1000)
    score_value: Decimal | None = None
    metadata: dict | None = None
    order_index: int = 0


class AssessmentOptionUpdateRequest(BaseModel):
    option_text: str | None = Field(default=None, min_length=1, max_length=1000)
    score_value: Decimal | None = None
    metadata: dict | None = None
    order_index: int | None = None


class JobAssessmentCreateRequest(BaseModel):
    template_id: UUID
    required: bool = True
    trigger_stage: str = Field(default="entry", max_length=50)
    order_index: int = 0


class JobAssessmentResponse(BaseModel):
    id: UUID
    job_id: UUID
    template_id: UUID
    title: str
    type: AssessmentType
    template_status: TemplateStatus
    template_version: int
    required: bool
    trigger_stage: str
    order_index: int
    created_at: datetime


class JobAssessmentUpdateRequest(BaseModel):
    required: bool | None = None
    trigger_stage: str | None = Field(default=None, max_length=50)
    order_index: int | None = None


class CandidateAssessmentSummaryResponse(BaseModel):
    id: UUID
    type: AssessmentType
    title: str
    description: str | None = None
    status: AssessmentStatus
    required: bool
    due_at: datetime | None = None
    assigned_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    result_summary: str | None = None


class CandidateAssessmentOptionResponse(BaseModel):
    id: UUID
    option_text: str
    order_index: int


class CandidateAssessmentQuestionResponse(BaseModel):
    id: UUID
    question_text: str
    question_type: QuestionType
    required: bool
    order_index: int
    metadata: dict | None = None
    options: list[CandidateAssessmentOptionResponse] = Field(default_factory=list)


class CandidateAssessmentDetailResponse(BaseModel):
    id: UUID
    type: AssessmentType
    title: str
    description: str | None = None
    status: AssessmentStatus
    required: bool
    due_at: datetime | None = None
    questions: list[CandidateAssessmentQuestionResponse]
    privacy_notice: str = "Suas respostas serão usadas exclusivamente para fins de recrutamento e seleção."


class CandidateAssessmentAnswerInput(BaseModel):
    question_id: UUID
    option_id: UUID | None = None
    option_ids: list[UUID] | None = None
    answer_text: str | None = Field(default=None, max_length=8000)
    answer_value: int | float | str | bool | dict | list | None = None


class CandidateAssessmentSubmitRequest(BaseModel):
    answers: list[CandidateAssessmentAnswerInput] = Field(min_length=1)


class CandidateAssessmentSubmitResponse(BaseModel):
    id: UUID
    status: AssessmentStatus
    message: str


class RecruiterAssessmentAnswerResponse(BaseModel):
    id: UUID
    question_id: UUID
    question_text: str
    question_type: QuestionType
    option_id: UUID | None = None
    option_text: str | None = None
    answer_text: str | None = None
    answer_value: int | float | str | bool | dict | list | None = None
    created_at: datetime


class RecruiterCandidateAssessmentResponse(CandidateAssessmentSummaryResponse):
    answers: list[RecruiterAssessmentAnswerResponse] = Field(default_factory=list)
