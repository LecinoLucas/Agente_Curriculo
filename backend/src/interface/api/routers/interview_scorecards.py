from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.interview_scorecard_service import InterviewScorecardService
from src.infrastructure.repositories.sqlalchemy_interview_scorecard_repository import (
    SQLAlchemyInterviewScorecardRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.interview_scorecard_schemas import (
    InterviewScorecardCreateRequest,
    InterviewScorecardEnvelopeResponse,
    InterviewScorecardPatchRequest,
    InterviewScorecardResponse,
)

router = APIRouter(tags=["interview-scorecards"])


def _service(db: AsyncSession) -> InterviewScorecardService:
    return InterviewScorecardService(SQLAlchemyInterviewScorecardRepository(db))


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
    response_model=InterviewScorecardEnvelopeResponse,
)
async def get_interview_scorecard(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardEnvelopeResponse:
    return await _service(db).get_for_candidate_job(candidate_id=candidate_id, job_id=job_id)


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
    response_model=InterviewScorecardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview_scorecard(
    job_id: UUID,
    candidate_id: UUID,
    body: InterviewScorecardCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardResponse:
    result = await _service(db).create(
        candidate_id=candidate_id,
        job_id=job_id,
        evaluator_id=current_user.id,
        body=body,
    )
    await db.commit()
    return result


@router.patch(
    "/interview-scorecards/{scorecard_id}",
    response_model=InterviewScorecardResponse,
)
async def patch_interview_scorecard(
    scorecard_id: UUID,
    body: InterviewScorecardPatchRequest,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardResponse:
    result = await _service(db).patch(scorecard_id=scorecard_id, body=body)
    await db.commit()
    return result


@router.post(
    "/interview-scorecards/{scorecard_id}/submit",
    response_model=InterviewScorecardResponse,
)
async def submit_interview_scorecard(
    scorecard_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardResponse:
    result = await _service(db).submit(scorecard_id=scorecard_id)
    await db.commit()
    return result
