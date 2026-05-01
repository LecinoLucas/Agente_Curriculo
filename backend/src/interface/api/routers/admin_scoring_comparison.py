from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.scoring_comparison_admin_service import (
    ScoringComparisonAdminService,
    ScoringComparisonAnalysisNotFoundError,
    ScoringComparisonCandidateNotFoundError,
    ScoringComparisonJobNotFoundError,
)
from src.interface.api.dependencies import AdminOnly, get_db

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/admin/scoring-comparison", tags=["admin"])


class InsightEvidenceResponse(BaseModel):
    requirement: str
    requirement_type: str
    match_status: str
    match_type: str
    evidence_quotes: list[str]
    evidence_strength: str
    confidence: str
    score_hint: float
    explanation: str


class ScoreDriverResponse(BaseModel):
    driver: str
    impact: str
    weight: float
    reason: str


class CandidateEvaluationInsightResponse(BaseModel):
    why_score_is_high: list[str]
    why_score_is_low: list[str]
    top_evidence: list[InsightEvidenceResponse]
    matched_requirements: list[str]
    partially_matched_requirements: list[str]
    missing_critical_requirements: list[str]
    equivalent_matches: list[InsightEvidenceResponse]
    inferred_matches: list[InsightEvidenceResponse]
    score_drivers: list[ScoreDriverResponse]
    possible_overestimation: list[str]
    possible_underestimation: list[str]
    risk_points: list[str]
    recommended_interview_questions: list[str]
    human_review_notes: list[str]


class ScoringComparisonResponse(BaseModel):
    job_id: UUID
    candidate_id: UUID
    analysis_id: UUID
    job_profile_hash: str
    candidate_profile_hash: str
    legacy_match_score: float
    adaptive_match_score: float
    delta: float
    legacy_recommendation: str
    adaptive_recommendation: str
    confidence_score: float
    should_review_manually: bool
    major_differences: list[str]
    strengths: list[str]
    gaps: list[str]
    risk_points: list[str]
    explanation: str
    evaluation_insight: CandidateEvaluationInsightResponse


def _handle_scoring_comparison_error(exc: Exception) -> None:
    if isinstance(exc, ScoringComparisonJobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, ScoringComparisonCandidateNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidato não encontrado")
    if isinstance(exc, ScoringComparisonAnalysisNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise do candidato não encontrada")
    raise exc


@router.get("/{job_id}/{candidate_id}", response_model=ScoringComparisonResponse)
async def get_scoring_comparison(
    job_id: UUID,
    candidate_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> ScoringComparisonResponse:
    logger.info(
        "scoring_comparison_requested",
        job_id=str(job_id),
        candidate_id=str(candidate_id),
        requested_by=str(current_user.id),
    )

    try:
        payload = await ScoringComparisonAdminService(db).compare(job_id, candidate_id)
        return ScoringComparisonResponse.model_validate(payload.to_dict())
    except HTTPException:
        logger.warning(
            "scoring_comparison_failed",
            job_id=str(job_id),
            candidate_id=str(candidate_id),
            reason="http_exception",
        )
        raise
    except Exception as exc:
        logger.error(
            "scoring_comparison_failed",
            job_id=str(job_id),
            candidate_id=str(candidate_id),
            error=str(exc),
        )
        _handle_scoring_comparison_error(exc)
        raise
