from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
    SQLAlchemyBehavioralAssignmentRepository,
)
from src.interface.api.dependencies import CurrentCompleteCandidateSession, get_db
from src.interface.api.routers.communication_events import notify_candidate_event_safely

from src.interface.api.schemas.behavioral_assignment_schemas import (
    BehavioralAssignmentAnswersRequest,
    BehavioralAssignmentDetailResponse,
    BehavioralAssignmentSubmitRequest,
    BehavioralAssignmentSummaryResponse,
)

router = APIRouter(prefix="/candidate-portal/behavioral-assessments", tags=["candidate-behavioral-assessments"])


def _service(db: AsyncSession) -> BehavioralAssignmentService:
    return BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db))


@router.get("", response_model=list[BehavioralAssignmentSummaryResponse])
async def list_behavioral_assessments(
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> list[BehavioralAssignmentSummaryResponse]:
    return await _service(db).list_for_candidate(candidate_session.candidate_id)


@router.get("/{assignment_id}", response_model=BehavioralAssignmentDetailResponse)
async def get_behavioral_assessment(
    assignment_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    try:
        return await _service(db).get_detail_for_candidate(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
        )
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post("/{assignment_id}/start", response_model=BehavioralAssignmentDetailResponse)
async def start_behavioral_assessment(
    assignment_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    try:
        result = await _service(db).start(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
        )
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)


@router.put("/{assignment_id}/answers", response_model=BehavioralAssignmentDetailResponse)
async def save_behavioral_answers(
    assignment_id: UUID,
    body: BehavioralAssignmentAnswersRequest,
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    try:
        result = await _service(db).save_answers(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
            answers=body.answers,
        )
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)


@router.post("/{assignment_id}/submit", response_model=BehavioralAssignmentDetailResponse)
async def submit_behavioral_assessment(
    assignment_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    body: BehavioralAssignmentSubmitRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse:
    try:
        result = await _service(db).submit(
            assignment_id=assignment_id,
            candidate_id=candidate_session.candidate_id,
            answers=body.answers if body is not None else None,
        )
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="behavioral_assessment_submitted",
            candidate_id=candidate_session.candidate_id,
            job_id=result.job_id,
            related_entity_type="behavioral_assessment_assignment",
            related_entity_id=assignment_id,
            context={"job_title": result.job_title or ""},
            actor_id=None,
        )

        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
