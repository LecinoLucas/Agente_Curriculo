from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.interview_scorecard_service import InterviewScorecardService
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.collaboration_comments_model import CollaborationCommentModel
from src.infrastructure.database.models.interview_scorecard_model import InterviewScorecardModel
from src.infrastructure.repositories.sqlalchemy_interview_scorecard_repository import (
    SQLAlchemyInterviewScorecardRepository,
)
from src.interface.api.dependencies import ManagerRecruiterOrAdmin, RecruiterOrAdmin, get_db
from src.interface.api.schemas.interview_scorecard_schemas import (
    InterviewScorecardCreateRequest,
    InterviewScorecardEnvelopeResponse,
    InterviewScorecardPatchRequest,
    InterviewScorecardResponse,
)

router = APIRouter(tags=["interview-scorecards"])

_REVIEW_REQUEST_TYPE = "review_request"


def _service(db: AsyncSession) -> InterviewScorecardService:
    return InterviewScorecardService(SQLAlchemyInterviewScorecardRepository(db))


async def _assert_manager_candidate_access(
    user_id: UUID,
    candidate_id: UUID,
    job_id: UUID,
    db: AsyncSession,
) -> None:
    """Raise 403 if manager lacks scorecard or directed review_request for this candidate+job."""
    scorecard_count = await db.scalar(
        sa.select(sa.func.count(InterviewScorecardModel.id)).where(
            InterviewScorecardModel.candidate_id == candidate_id,
            InterviewScorecardModel.job_id == job_id,
            InterviewScorecardModel.evaluator_id == user_id,
        )
    )
    if (scorecard_count or 0) > 0:
        return
    review_count = await db.scalar(
        sa.select(sa.func.count(CollaborationCommentModel.id)).where(
            CollaborationCommentModel.candidate_id == candidate_id,
            CollaborationCommentModel.job_id == job_id,
            CollaborationCommentModel.comment_type == _REVIEW_REQUEST_TYPE,
            CollaborationCommentModel.target_manager_id == user_id,
        )
    )
    if (review_count or 0) > 0:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Gestor não tem acesso a este candidato/vaga.",
    )


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
    response_model=InterviewScorecardEnvelopeResponse,
)
async def get_interview_scorecard(
    job_id: UUID,
    candidate_id: UUID,
    current_user: ManagerRecruiterOrAdmin,
    interview_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardEnvelopeResponse:
    if current_user.role == UserRole.MANAGER:
        await _assert_manager_candidate_access(current_user.id, candidate_id, job_id, db)
    return await _service(db).get_for_candidate_job(
        candidate_id=candidate_id,
        job_id=job_id,
        interview_id=interview_id,
        viewer_evaluator_id=current_user.id,
        include_all_scorecards=current_user.role != UserRole.MANAGER,
    )


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/interview-scorecard",
    response_model=InterviewScorecardResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_interview_scorecard(
    job_id: UUID,
    candidate_id: UUID,
    body: InterviewScorecardCreateRequest,
    current_user: ManagerRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardResponse:
    if current_user.role == UserRole.MANAGER:
        await _assert_manager_candidate_access(current_user.id, candidate_id, job_id, db)
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
    current_user: ManagerRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardResponse:
    if current_user.role == UserRole.MANAGER:
        scorecard = await db.get(InterviewScorecardModel, scorecard_id)
        if scorecard is None or scorecard.evaluator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Gestor só pode editar scorecards criados por ele mesmo.",
            )
    result = await _service(db).patch(scorecard_id=scorecard_id, body=body)
    await db.commit()
    return result


@router.post(
    "/interview-scorecards/{scorecard_id}/submit",
    response_model=InterviewScorecardResponse,
)
async def submit_interview_scorecard(
    scorecard_id: UUID,
    current_user: ManagerRecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScorecardResponse:
    if current_user.role == UserRole.MANAGER:
        scorecard = await db.get(InterviewScorecardModel, scorecard_id)
        if scorecard is None or scorecard.evaluator_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Gestor só pode submeter scorecards criados por ele mesmo.",
            )
    result = await _service(db).submit(scorecard_id=scorecard_id)
    await db.commit()
    return result
