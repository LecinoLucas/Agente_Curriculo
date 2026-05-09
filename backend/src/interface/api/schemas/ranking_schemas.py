from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel

DecisionStatus = Literal["approved", "review", "rejected_suggested"]
FreshnessStatus = Literal["fresh", "stale"]

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
    confidence_score: Decimal
    penalty_score: Decimal
    validation_penalty_score: Decimal
    final_score: Decimal
    raw_score: Decimal | None = None
    final_score_before_cap: Decimal | None = None
    final_score_after_cap: Decimal | None = None
    cap_applied: bool | None = None
    cap_reason: str | None = None
    validation_status: str | None = None
    validation_reason: str | None = None
    failed_rule: str | None = None
    failed_dimension: str | None = None
    eligibility_status: str | None = None
    missing_required_skills: list[str] | None = None
    education_detected: str | None = None
    minimum_education_required: str | None = None
    experience_detected: float | None = None
    minimum_experience_required: float | None = None


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
    freshness_status: FreshnessStatus
    score_computed_at: datetime | None = None
    source_analysis_id: UUID | None = None
    source_analysis_created_at: datetime | None = None
    score_model_version: str | None = None
    match_updated_at: datetime | None = None
    ranking_updated_at: datetime | None = None
    version: str
    ranking_version: str | None = None
    data_quality_status: str


class DataQualityStats(BaseModel):
    """Data quality statistics for candidates.

    Breakdown:
    - valid_candidates: Successfully classified with data
    - unknown_candidates: Not yet classified (legitimate pending state)
    - invalid_candidates: Explicitly marked as invalid (no_resume, empty_resume, parsing_failed, invalid_manual)
    - filtered_candidates: Invalid candidates excluded from ranking
    """
    total_candidates: int
    valid_candidates: int
    unknown_candidates: int
    invalid_candidates: int
    filtered_candidates: int


class JobRankingResponse(BaseModel):
    job_id: UUID
    total_candidates: int
    threshold_high: Decimal
    threshold_low: Decimal
    score_version: str
    candidates: list[CandidateRankingEntry]
    data_quality_stats: DataQualityStats | None = None


class ScoringComputeResponse(BaseModel):
    job_id: UUID
    candidates_scored: int
    score_version: str
    computed_at: datetime
