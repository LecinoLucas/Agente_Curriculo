from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.decision_summary_service import DecisionSummaryService
from src.infrastructure.repositories.sqlalchemy_decision_summary_repository import SQLAlchemyDecisionSummaryRepository
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.decision_summary_schemas import CandidateDecisionSummaryResponse

router = APIRouter(tags=["decision-summary"])


def _service(db: AsyncSession) -> DecisionSummaryService:
    return DecisionSummaryService(SQLAlchemyDecisionSummaryRepository(db))


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/decision-summary",
    response_model=CandidateDecisionSummaryResponse,
)
async def get_candidate_decision_summary(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateDecisionSummaryResponse:
    return await _service(db).get_summary(candidate_id=candidate_id, job_id=job_id)
