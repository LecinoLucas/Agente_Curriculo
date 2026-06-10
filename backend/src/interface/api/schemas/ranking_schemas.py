from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.interface.api.schemas.job_schemas import CandidateScoreExplanationFactorSummaryResponse

DecisionStatus = Literal["approved", "review", "rejected_suggested"]
FreshnessStatus = Literal["fresh", "stale"]

class ReasonTag(BaseModel):
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
    model_config = ConfigDict(extra="allow")

    skill_match_score: Decimal
    experience_match_score: Decimal
    seniority_match_score: Decimal
    education_score: Decimal
    confidence_score: Decimal
    penalty_score: Decimal
    validation_penalty_score: Decimal
    job_fit_score: Decimal
    raw_score: Decimal | None = None
    cap_applied: bool | None = None
    cap_reason: str | None = None
    validation_status: str | None = None
    validation_reason: str | None = None
    failed_rule: str | None = None
    failed_dimension: str | None = None
    eligibility_status: str | None = None
    missing_required_skills: list[str] | None = None
    matched_priority_skills: list[str] | None = None
    missing_priority_skills: list[str] | None = None
    matched_complementary_skills: list[str] | None = None
    missing_complementary_skills: list[str] | None = None
    matched_eliminatory_skills: list[str] | None = None
    missing_eliminatory_skills: list[str] | None = None
    priority_skills_matched: int | None = None
    priority_skills_total: int | None = None
    complementary_skills_matched: int | None = None
    complementary_skills_total: int | None = None
    eliminatory_skills_matched: int | None = None
    eliminatory_skills_total: int | None = None
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
    job_fit_score: Decimal
    decision_suggestion: DecisionStatus
    reason_tags: list[ReasonTag]
    score_factors: CandidateScoreExplanationFactorSummaryResponse
    data_confidence_score: float
    ranking_summary_text: str
    entered_at: datetime | None
    computed_at: datetime
    ranking_freshness_status: FreshnessStatus
    match_freshness_status: FreshnessStatus
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
    page: int | None = None
    page_size: int | None = None
    total_pages: int | None = None


class ScoreDeltaEntry(BaseModel):
    candidate_id: UUID
    previous_score: Decimal | None
    new_score: Decimal
    delta: Decimal | None
    monotonicity_decision: str | None


class SingleCandidateScoringResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    previous_score: Decimal | None
    job_fit_score: Decimal
    delta: Decimal | None
    monotonicity_decision: str | None
    computed_at: datetime
    score_version: str


class ScoringComputeResponse(BaseModel):
    job_id: UUID
    candidates_scored: int
    score_version: str
    computed_at: datetime
    score_deltas: list[ScoreDeltaEntry]


class RankingRecalculateResponse(BaseModel):
    job_id: UUID
    queued: bool
    provider_calls: int
    message: str


class SmartRefreshSkipReason(BaseModel):
    reason: str
    count: int
    description: str = ""


class _SmartRefreshRankingRecalculation(BaseModel):
    count: int
    provider_calls: int
    description: str


class _SmartRefreshAiAnalysis(BaseModel):
    count: int
    may_use_provider: bool
    description: str
    failed_retry_count: int = 0  # subset of count: failed/cancelled analyses to be retried


class _SmartRefreshSkipped(BaseModel):
    count: int
    reasons: list[SmartRefreshSkipReason]


class _SmartRefreshSampleEntry(BaseModel):
    candidate_id: UUID
    candidate_name: str
    reason: str


class _SmartRefreshSamples(BaseModel):
    ai_analysis: list[_SmartRefreshSampleEntry] = []
    skipped: list[_SmartRefreshSampleEntry] = []


class SmartRefreshPreviewResponse(BaseModel):
    job_id: UUID
    total_candidates: int
    ranking_recalculation: _SmartRefreshRankingRecalculation
    ai_analysis: _SmartRefreshAiAnalysis
    skipped: _SmartRefreshSkipped
    warnings: list[str]
    samples: _SmartRefreshSamples = Field(default_factory=_SmartRefreshSamples)


class SmartRefreshExecuteResponse(BaseModel):
    job_id: UUID
    queued: bool
    ranking_recalculation_enqueued: bool
    ranking_candidates: int
    ai_analysis_enqueued: int
    failed_analysis_retried: int = 0  # subset of ai_analysis_enqueued: failed/cancelled retried
    skipped_already_processing: int
    skipped_no_resume: int
    skipped_legacy_incomplete: int = 0
    provider_calls_now: int
    may_use_provider_later: bool
    message: str
