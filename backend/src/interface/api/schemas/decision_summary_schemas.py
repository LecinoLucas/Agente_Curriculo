from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

DecisionReadinessStatus = Literal[
    "missing_job_match",
    "waiting_behavioral_assessment",
    "waiting_behavioral_ai",
    "waiting_interview_scorecard",
    "ready_for_human_decision",
    "needs_attention",
]


class DecisionSummaryActiveJobDecisionResponse(BaseModel):
    score_status: str
    match_score: float | None = None
    freshness_status: Literal["current", "stale", "missing"]
    warnings: list[str] = Field(default_factory=list)


class DecisionSummaryBehavioralAssessmentResponse(BaseModel):
    template_required: bool
    assignment_status: str | None = None
    answered_count: int = 0
    question_count: int = 0
    submitted_at: datetime | None = None
    ai_evaluation_status: str | None = None
    ai_confidence: str | None = None
    ai_summary: str | None = None


class DecisionSummaryInterviewScorecardResponse(BaseModel):
    status: str | None = None
    final_recommendation: str | None = None
    average_rating: float | None = None
    submitted_at: datetime | None = None


class DecisionReadinessResponse(BaseModel):
    status: DecisionReadinessStatus
    missing_items: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    next_action: str


class CandidateDecisionSummaryResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    active_job_decision: DecisionSummaryActiveJobDecisionResponse
    behavioral_assessment: DecisionSummaryBehavioralAssessmentResponse
    interview_scorecard: DecisionSummaryInterviewScorecardResponse
    decision_readiness: DecisionReadinessResponse
