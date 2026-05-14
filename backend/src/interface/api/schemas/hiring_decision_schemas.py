from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

HiringDecisionStatus = Literal["draft", "submitted", "superseded"]
HiringDecisionOutcome = Literal[
    "advance",
    "hold",
    "reject",
    "hire",
    "request_another_interview",
    "keep_under_review",
]
HiringDecisionReasonCode = Literal[
    "strong_fit",
    "partial_fit",
    "missing_required_skill",
    "salary_mismatch",
    "availability_mismatch",
    "behavioral_concern",
    "interview_concern",
    "better_candidates",
    "candidate_withdrew",
    "other",
]
PipelineTargetStage = Literal[
    "entry",
    "screening",
    "hr_interview",
    "technical_interview",
    "final",
    "offer",
    "hired",
    "rejected",
]


class HiringDecisionPipelineActionRequest(BaseModel):
    enabled: bool = False
    target_stage: PipelineTargetStage | None = None
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def clean_reason(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class HiringDecisionCreateRequest(BaseModel):
    decision_outcome: HiringDecisionOutcome
    reason_code: HiringDecisionReasonCode
    notes: str | None = Field(default=None, max_length=4000)
    submit: bool = True
    pipeline_action: HiringDecisionPipelineActionRequest | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class HiringDecisionPatchRequest(BaseModel):
    decision_outcome: HiringDecisionOutcome | None = None
    reason_code: HiringDecisionReasonCode | None = None
    notes: str | None = Field(default=None, max_length=4000)
    submit: bool | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def clean_notes(cls, value: object) -> object:
        if isinstance(value, str):
            cleaned = value.strip()
            return cleaned or None
        return value


class HiringDecisionResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    pipeline_id: UUID | None = None
    decided_by: UUID | None = None
    decision_status: HiringDecisionStatus
    decision_outcome: HiringDecisionOutcome
    reason_code: HiringDecisionReasonCode
    notes: str | None = None
    based_on_decision_summary_snapshot: dict | None = None
    based_on_scorecard_id: UUID | None = None
    based_on_behavioral_assignment_id: UUID | None = None
    based_on_behavioral_ai_evaluation_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None = None
    pipeline_transition_id: UUID | None = None


class HiringDecisionEnvelopeResponse(BaseModel):
    decision: HiringDecisionResponse | None = None


class HiringDecisionHistoryResponse(BaseModel):
    decisions: list[HiringDecisionResponse] = Field(default_factory=list)
