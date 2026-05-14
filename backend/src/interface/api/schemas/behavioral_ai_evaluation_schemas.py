from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BehavioralCompetencySignal(BaseModel):
    competency: str = Field(..., description="Competency name")
    signal: str = Field(..., description="Signal quality: weak, moderate, strong")
    evidence: str = Field(..., description="Evidence-based description from answers")
    concerns: list[str] = Field(default_factory=list, description="Concerns or gaps identified")


class BehavioralRiskFlag(BaseModel):
    code: str = Field(..., description="Risk code: insufficient_evidence, unexpected_pattern, etc.")
    message: str = Field(..., description="Human-readable risk message")


class BehavioralAIEvaluationCreateRequest(BaseModel):
    """Request to trigger IA evaluation of submitted behavioral assessment."""
    pass


class BehavioralAIEvaluationResponse(BaseModel):
    """IA evaluation response structure returned from Claude."""

    confidence: str = Field(..., description="low, medium, high")
    summary: str = Field(..., description="Short operational summary of candidate's behavioral profile")
    competency_signals: list[BehavioralCompetencySignal] = Field(
        default_factory=list,
        description="Per-competency signals based on responses",
    )
    strengths: list[str] = Field(default_factory=list, description="Identified strengths")
    concerns: list[str] = Field(default_factory=list, description="Points of attention to validate in interview")
    suggested_interview_questions: list[str] = Field(
        default_factory=list,
        description="Follow-up questions for interview",
    )
    risk_flags: list[BehavioralRiskFlag] = Field(
        default_factory=list,
        description="Flags: insufficient_evidence, unexpected_pattern, etc.",
    )


class BehavioralAIEvaluationDetailResponse(BaseModel):
    """Stored evaluation record."""

    id: str = Field(..., description="Evaluation ID")
    assignment_id: str
    candidate_id: str
    job_id: str
    template_id: str
    status: str = Field(
        ...,
        description="pending, processing, completed, failed",
    )
    provider: str
    model: str
    prompt_version: int
    confidence: Optional[str] = None
    summary: Optional[str] = None
    strengths: Optional[list[str]] = None
    concerns: Optional[list[str]] = None
    competency_signals: Optional[list[BehavioralCompetencySignal]] = None
    suggested_interview_questions: Optional[list[str]] = None
    risk_flags: Optional[list[BehavioralRiskFlag]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class BehavioralAIEvaluationStatusResponse(BaseModel):
    """Status response when evaluation is pending or processing."""

    id: str
    assignment_id: str
    status: str
    created_at: datetime
    updated_at: datetime
