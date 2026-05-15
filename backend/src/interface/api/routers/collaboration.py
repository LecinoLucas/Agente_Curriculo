"""Collaboration endpoints for internal comments between recruiter and manager."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.collaboration_service import (
    CollaborationService,
    CollaborationValidationError,
)
from src.interface.api.dependencies import RecruiterOrAdmin, ManagerOrAdmin, get_db
from src.interface.api.schemas.collaboration_schemas import (
    CollaborationListResponse,
    CreateCommentRequest,
    ManagerFeedbackRequest,
    RequestManagerReviewRequest,
    CollaborationComment,
)

router = APIRouter(tags=["collaboration"])


def _service(db: AsyncSession, user) -> CollaborationService:
    return CollaborationService(db, user)


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/collaboration",
    response_model=CollaborationListResponse,
)
async def list_collaboration(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CollaborationListResponse:
    """List collaboration comments for candidate in job."""
    comments = await _service(db, current_user).list_collaboration(candidate_id, job_id)
    return CollaborationListResponse(
        comments=[CollaborationComment(**c) for c in comments]
    )


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/collaboration/comments",
    response_model=CollaborationComment,
)
async def create_collaboration_comment(
    job_id: UUID,
    candidate_id: UUID,
    payload: CreateCommentRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CollaborationComment:
    """Create internal collaboration comment."""
    comment = await _service(db, current_user).create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type=payload.comment_type,
        message=payload.message,
        recommendation=payload.recommendation,
    )
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )
    await db.commit()
    return CollaborationComment(**comment)


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/collaboration/request-manager-review",
    response_model=CollaborationComment,
)
async def request_manager_review(
    job_id: UUID,
    candidate_id: UUID,
    payload: RequestManagerReviewRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CollaborationComment:
    """Recruiter/admin requests manager review of candidate."""
    try:
        comment = await _service(db, current_user).create_comment(
            candidate_id=candidate_id,
            job_id=job_id,
            comment_type="review_request",
            message=payload.message,
            target_manager_id=payload.target_manager_id,
            priority=payload.priority,
        )
    except CollaborationValidationError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )
    await db.commit()
    return CollaborationComment(**comment)


@router.get(
    "/manager/jobs/{job_id}/candidates/{candidate_id}/collaboration",
    response_model=CollaborationListResponse,
)
async def list_manager_collaboration(
    job_id: UUID,
    candidate_id: UUID,
    current_user: ManagerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CollaborationListResponse:
    """Manager views collaboration for assigned candidate."""
    comments = await _service(db, current_user).list_collaboration(candidate_id, job_id)
    if not comments and not (current_user.role.value in ["admin", "manager"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado",
        )
    return CollaborationListResponse(
        comments=[CollaborationComment(**c) for c in comments]
    )


@router.post(
    "/manager/jobs/{job_id}/candidates/{candidate_id}/feedback",
    response_model=CollaborationComment,
)
async def post_manager_feedback(
    job_id: UUID,
    candidate_id: UUID,
    payload: ManagerFeedbackRequest,
    current_user: ManagerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CollaborationComment:
    """Manager provides feedback with recommendation."""
    comment = await _service(db, current_user).create_comment(
        candidate_id=candidate_id,
        job_id=job_id,
        comment_type="manager_feedback",
        message=payload.message,
        recommendation=payload.recommendation,
    )
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager não tem acesso a este candidato",
        )
    await db.commit()
    return CollaborationComment(**comment)
