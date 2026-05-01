from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.matching_observability_admin_service import (
    MatchingObservabilityAdminService,
)
from src.interface.api.dependencies import AdminOnly, get_db

router = APIRouter(prefix="/api/v1/admin/matching-observability", tags=["admin"])


class MatchingObservabilityCountItemResponse(BaseModel):
    name: str
    count: int


class MatchingObservabilityJobItemResponse(BaseModel):
    job_id: UUID
    job_title: str
    negative_feedback_count: int


class MatchingObservabilitySummaryResponse(BaseModel):
    total_observations: int
    adaptive_count: int
    legacy_count: int
    average_score: float
    average_confidence: float
    high_score_negative_feedback: int
    low_score_positive_feedback: int
    top_missing_skills: list[MatchingObservabilityCountItemResponse]
    top_equivalences_used: list[MatchingObservabilityCountItemResponse]
    jobs_with_most_negative_feedback: list[MatchingObservabilityJobItemResponse]


@router.get("/summary", response_model=MatchingObservabilitySummaryResponse)
async def get_matching_observability_summary(
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> MatchingObservabilitySummaryResponse:
    summary = await MatchingObservabilityAdminService(db).get_summary()
    return MatchingObservabilitySummaryResponse.model_validate(summary.to_dict())
