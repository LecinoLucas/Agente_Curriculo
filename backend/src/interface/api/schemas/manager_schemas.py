"""Schemas for manager view endpoints — safe data structures."""

from typing import Optional
from pydantic import BaseModel, Field


class ManagerJobResponse(BaseModel):
    """Safe summary of a job for manager view."""
    id: str = Field(..., description="Job ID")
    title: str = Field(..., description="Job title")
    candidate_count: int = Field(..., description="Total active candidates")
    assigned_count: int = Field(..., description="Candidates with scorecard from this evaluator")


class ManagerJobListResponse(BaseModel):
    """List of jobs where manager is evaluator."""
    jobs: list[ManagerJobResponse]


class ManagerCandidateSummary(BaseModel):
    """Safe summary of candidate in job."""
    id: str = Field(..., description="Candidate ID")
    name: str = Field(..., description="Candidate full name")
    email: str = Field(..., description="Candidate email")
    pipeline_stage: Optional[str] = Field(None, description="Current pipeline stage")
    scorecard_status: Optional[str] = Field(None, description="Scorecard status (draft, submitted)")


class ManagerJobCandidatesResponse(BaseModel):
    """List of candidates in a job."""
    job_id: str = Field(..., description="Job ID")
    candidates: list[ManagerCandidateSummary]


class ManagerScorecardSummary(BaseModel):
    """Safe scorecard summary — no items, no technical notes."""
    status: str = Field(..., description="Status: draft or submitted")
    recommendation: Optional[str] = Field(None, description="Recommendation: strong_yes, yes, neutral, no, strong_no")
    submitted_at: Optional[str] = Field(None, description="ISO timestamp when submitted")


class ManagerCandidateDetailResponse(BaseModel):
    """Safe candidate detail for manager view."""
    id: str = Field(..., description="Candidate ID")
    name: str = Field(..., description="Candidate full name")
    email: str = Field(..., description="Candidate email")
    pipeline_stage: Optional[str] = Field(None, description="Current pipeline stage")
    scorecard: Optional[ManagerScorecardSummary] = Field(None, description="Scorecard summary if exists")
