from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared type aliases
# ---------------------------------------------------------------------------

PipelineStage = Literal[
    "entry",
    "screening",
    "hr_interview",
    "technical_interview",
    "final",
    "offer",
    "hired",
    "rejected",
]

PipelineTrigger = Literal["manual", "auto_match", "system"]

# Outcome status — independent of stage position.
CandidateOutcomeStatus = Literal["active", "hired", "rejected", "transferred"]

# AI analysis processing status — completely independent of pipeline stage.
# Controlled exclusively by the analysis worker; never set by stage moves.
AIAnalysisStatus = Literal["pending", "processing", "completed", "failed", "cancelled"]

# ---------------------------------------------------------------------------
# Board — existing schemas (unchanged)
# ---------------------------------------------------------------------------


class JobMatchCandidateResponse(BaseModel):
    candidate_id: UUID
    candidate_name: str
    job_id: UUID
    # Human-controlled: which column the candidate is in. Never modified by AI workers.
    stage: PipelineStage
    candidate_status: str
    status: CandidateOutcomeStatus = "active"
    match_score: Decimal | None = None
    entered_at: datetime | None = None
    top_skills: list[str]
    updated_at: datetime
    # AI-controlled: processing state of the candidate's latest analysis.
    # null means no analysis has been requested yet.
    ai_status: AIAnalysisStatus | None = None


class PipelineColumnResponse(BaseModel):
    stage: PipelineStage
    label: str
    candidates: list[JobMatchCandidateResponse]


class PipelineBoardResponse(BaseModel):
    job_id: UUID
    columns: list[PipelineColumnResponse]


# ---------------------------------------------------------------------------
# Stage move — existing schemas (unchanged, used by PipelineService internals)
# ---------------------------------------------------------------------------


class UpdateCandidateStageRequest(BaseModel):
    job_id: UUID
    stage: PipelineStage


class UpdateCandidateStageResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    stage: PipelineStage
    candidate_status: str
    match_score: Decimal | None = None
    updated_at: datetime


# ---------------------------------------------------------------------------
# Stage move — new schemas (richer, used by the PATCH /pipeline/{id}/stage endpoint)
# ---------------------------------------------------------------------------


class MoveCandidateRequest(BaseModel):
    job_id: UUID
    stage: PipelineStage
    notes: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=500)


class MoveCandidateResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    stage: PipelineStage
    candidate_status: str
    status: CandidateOutcomeStatus
    match_score: Decimal | None = None
    transition_id: UUID
    updated_at: datetime


# Body for the unambiguous path-based move endpoint: PATCH /pipeline/{job_id}/{candidate_id}/stage
class MoveCandidateByJobBody(BaseModel):
    stage: PipelineStage
    notes: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=500)


class AddCandidateToJobRequest(BaseModel):
    job_id: UUID
    initial_stage: PipelineStage = "entry"


class AddCandidateToJobResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    stage: PipelineStage
    candidate_status: str
    status: CandidateOutcomeStatus
    transition_id: UUID
    updated_at: datetime


class TransferCandidateJobRequest(BaseModel):
    from_job_id: UUID
    to_job_id: UUID
    reason: str = Field(min_length=3, max_length=500)


class TransferCandidateJobResponse(BaseModel):
    candidate_id: UUID
    from_job_id: UUID
    to_job_id: UUID
    from_stage: PipelineStage
    to_stage: PipelineStage
    source_status: CandidateOutcomeStatus
    destination_status: CandidateOutcomeStatus
    source_transition_id: UUID
    destination_transition_id: UUID
    updated_at: datetime


# ---------------------------------------------------------------------------
# Transition history
# ---------------------------------------------------------------------------


class StageTransitionResponse(BaseModel):
    """One immutable record of a candidate moving between stages."""

    id: UUID
    candidate_id: UUID
    job_id: UUID
    from_stage: PipelineStage | None
    to_stage: PipelineStage
    moved_by: UUID | None
    moved_by_name: str | None
    moved_at: datetime
    trigger: PipelineTrigger
    notes: str | None
    reason: str | None = None

    model_config = {"from_attributes": True}


class CandidatePipelineHistoryResponse(BaseModel):
    """Full pipeline state + transition log for one (candidate, job) pair."""

    candidate_id: UUID
    candidate_name: str
    job_id: UUID
    job_title: str
    current_stage: PipelineStage
    status: CandidateOutcomeStatus
    match_score: Decimal | None
    entered_at: datetime | None
    updated_at: datetime
    transitions: list[StageTransitionResponse]


# ---------------------------------------------------------------------------
# Jobs list (pipeline summary view)
# ---------------------------------------------------------------------------


class PipelineJobSummaryResponse(BaseModel):
    """One job row in the pipeline jobs list, with candidate counts per stage."""

    job_id: UUID
    job_title: str
    job_status: str
    total_candidates: int
    stage_counts: dict[str, int]
    latest_activity: datetime | None
