from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import Field

from src.interface.api.schemas.common import APISchemaModel

CandidateJobFlowReasonCode = Literal[
    "flow_consistent",
    "missing_active_pipeline",
    "missing_current_analysis",
    "analysis_not_completed",
    "completed_analysis_missing_score",
    "score_source_analysis_mismatch",
    "match_points_to_inactive_job_profile",
    "missing_active_job_profile",
    "ranking_score_unavailable",
]


class CandidateJobFlowDiagnosticsResponse(APISchemaModel):
    candidate_id: UUID
    job_id: UUID
    active_pipeline_exists: bool
    current_analysis_id_exists: bool
    current_analysis_exists: bool
    current_analysis_status: str | None = None
    active_job_profile_exists: bool
    match_exists: bool
    match_points_to_active_job_profile: bool
    score_exists: bool
    score_source_analysis_matches_current: bool
    candidate_in_ranking: bool
    reason_code: CandidateJobFlowReasonCode


class CandidateJobFlowRepairRequest(APISchemaModel):
    candidate_id: UUID
    job_id: UUID


class CandidateJobFlowRepairResponse(APISchemaModel):
    candidate_id: UUID
    job_id: UUID
    repaired: bool
    actions: list[str] = Field(default_factory=list)
    before: CandidateJobFlowDiagnosticsResponse
    after: CandidateJobFlowDiagnosticsResponse
