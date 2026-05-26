from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from src.interface.api.schemas.job_schemas import DealBreaker

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
    "pre_admission",
    "protheus",
    "admitted",
    "rejected",
]

PipelineTrigger = Literal["manual", "auto_match", "system"]

# Outcome status — independent of stage position.
CandidateOutcomeStatus = Literal["active", "removed", "hired", "rejected", "transferred"]

# AI analysis processing status — completely independent of pipeline stage.
# Controlled exclusively by the analysis worker; never set by stage moves.
AIAnalysisStatus = Literal[
    "waiting_extraction",
    "pending",
    "processing",
    "retry_scheduled",
    "completed",
    "failed",
    "cancelled",
    "discarded",
]

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
    entered_at: datetime | None = None
    top_skills: list[str]
    updated_at: datetime
    # AI-controlled: processing state of the candidate's latest analysis.
    # null means no analysis has been requested yet.
    ai_status: AIAnalysisStatus | None = None
    # Official job fit score (0-100) if score exists and is fresh. Null if no score yet.
    job_fit_score: Decimal | None = None
    requires_behavioral_assessment: bool | None = None
    requires_behavioral_ai_evaluation: bool | None = None
    requires_interview: bool | None = None
    requires_scorecard: bool | None = None
    behavioral_assessment_status: str | None = None
    behavioral_submitted_at: datetime | None = None
    behavioral_ai_evaluation_status: str | None = None
    interview_status: str | None = None
    interview_scheduled_start: datetime | None = None
    interview_scorecard_status: str | None = None


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
    updated_at: datetime


# ---------------------------------------------------------------------------
# Stage move — new schemas (richer, used by the PATCH /pipeline/{id}/stage endpoint)
# ---------------------------------------------------------------------------


FORCE_REASON_MIN_LENGTH = 10
FORCE_REASON_MAX_LENGTH = 500


class MoveCandidateRequest(BaseModel):
    job_id: UUID
    stage: PipelineStage
    notes: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=500)
    # Admin-only escape hatch to bypass structural gates. Service enforces:
    # actor role == admin AND force_reason length >= FORCE_REASON_MIN_LENGTH
    # AND every blocking gate is forceable.
    force: bool = False
    force_reason: str | None = Field(default=None, max_length=FORCE_REASON_MAX_LENGTH)


class MoveCandidateResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    stage: PipelineStage
    candidate_status: str
    status: CandidateOutcomeStatus
    transition_id: UUID
    updated_at: datetime
    analysis: PipelineAnalysisDecisionResponse | None = None


# Body for the unambiguous path-based move endpoint: PATCH /pipeline/{job_id}/{candidate_id}/stage
class MoveCandidateByJobBody(BaseModel):
    stage: PipelineStage
    notes: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=500)
    force: bool = False
    force_reason: str | None = Field(default=None, max_length=FORCE_REASON_MAX_LENGTH)


class SchedulePipelineInterviewRequest(BaseModel):
    scheduled_start: datetime
    scheduled_end: datetime
    timezone: str = "America/Recife"
    interview_format: Literal["online", "presencial", "telefone"] = "online"
    location: str | None = Field(default=None, max_length=255)
    meeting_url: str | None = Field(default=None, max_length=2000)
    public_notes: str | None = Field(default=None, max_length=2000)
    internal_notes: str | None = Field(default=None, max_length=4000)
    title: str | None = Field(default=None, max_length=255)
    interview_type: str = Field(default="hr", max_length=50)


class PipelineAnalysisDecisionResponse(BaseModel):
    analysis_id: UUID | None = None
    status: str | None = None
    created: bool = False
    blocked: bool = False
    reused: bool = False
    stuck: bool = False
    reason: str
    stage: PipelineStage | None = None
    trigger_source: Literal["automatic", "manual"] = "automatic"


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
    analysis: PipelineAnalysisDecisionResponse | None = None


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
    analysis: PipelineAnalysisDecisionResponse | None = None


class ReconsiderCandidateRequest(BaseModel):
    job_id: UUID
    initial_stage: PipelineStage = "entry"
    reason: str = Field(min_length=3, max_length=500)


class ReconsiderCandidateResponse(BaseModel):
    candidate_id: UUID
    job_id: UUID
    stage: PipelineStage
    candidate_status: str
    status: CandidateOutcomeStatus
    transition_id: UUID
    updated_at: datetime
    analysis: PipelineAnalysisDecisionResponse | None = None


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
    seniority_level: str | None = None
    work_model: str | None = None
    location: str | None = None
    deal_breakers: list[DealBreaker] = Field(default_factory=list)
    total_candidates: int
    stage_counts: dict[str, int]
    latest_activity: datetime | None


# ---------------------------------------------------------------------------
# Stage gate blocking — structured error payload
# ---------------------------------------------------------------------------


GateActionCode = Literal[
    "open_interview",
    "open_scorecard",
    "open_behavioral_assessment",
    "open_behavioral_ai",
    "open_decision",
    "add_reason",
]


class MissingGateSchema(BaseModel):
    code: str
    label: str
    description: str
    action: GateActionCode
    action_payload: dict | None = None
    severity: Literal["block"] = "block"
    forceable: bool = False


class PipelineTransitionBlockedResponse(BaseModel):
    code: Literal["pipeline_transition_blocked"] = "pipeline_transition_blocked"
    message: str = "Não é possível avançar candidato para esta etapa."
    current_stage: PipelineStage | None
    target_stage: PipelineStage
    missing_gates: list[MissingGateSchema]
    can_force: bool = False
    force_requires_reason: bool = True
