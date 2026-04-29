from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

DecisionStatus = Literal["approved", "review", "rejected_suggested"]

class ReasonCode(BaseModel):
    """Filterable, auditable scoring signal with a quantified impact.

    impact > 0 means favorable; impact < 0 means penalizing.
    Values are in score-point units so they can be summed to approximate
    the candidate's total advantage/disadvantage contribution.
    """

    type: str
    field: str
    impact: float
    description: str


class ScoreBreakdownResponse(BaseModel):
    skill_match_score: Decimal
    experience_match_score: Decimal
    seniority_match_score: Decimal
    education_score: Decimal
    ai_confidence_score: Decimal
    penalty_score: Decimal
    validation_penalty_score: Decimal
    final_score: Decimal


class CandidateRankingEntry(BaseModel):
    rank: int
    candidate_id: UUID
    candidate_name: str
    stage: str
    pipeline_status: str
    score_breakdown: ScoreBreakdownResponse
    final_score: Decimal
    decision_suggestion: DecisionStatus
    reason_codes: list[ReasonCode]
    explanation_text: str
    entered_at: datetime | None
    computed_at: datetime
    version: str


class JobRankingResponse(BaseModel):
    job_id: UUID
    total_candidates: int
    threshold_high: Decimal
    threshold_low: Decimal
    score_version: str
    candidates: list[CandidateRankingEntry]


class ScoringComputeResponse(BaseModel):
    job_id: UUID
    candidates_scored: int
    score_version: str
    computed_at: datetime
