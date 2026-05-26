from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.audit_service import AuditService
from src.application.services.hiring_decision_service import HiringDecisionService
from src.infrastructure.repositories.sqlalchemy_decision_summary_repository import (
    SQLAlchemyDecisionSummaryRepository,
)
from src.infrastructure.repositories.sqlalchemy_hiring_decision_repository import (
    SQLAlchemyHiringDecisionRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.routers.communication_events import notify_candidate_event_safely
from src.interface.api.routers.pipeline import _handle as _handle_pipeline_error
from src.interface.api.schemas.hiring_decision_schemas import (
    HiringDecisionCreateRequest,
    HiringDecisionEnvelopeResponse,
    HiringDecisionHistoryResponse,
    HiringDecisionPatchRequest,
    HiringDecisionResponse,
)

router = APIRouter(tags=["hiring-decisions"])


def _service(db: AsyncSession) -> HiringDecisionService:
    return HiringDecisionService(
        SQLAlchemyHiringDecisionRepository(db),
        SQLAlchemyDecisionSummaryRepository(db),
        SQLAlchemyPipelineRepository(db),
        AuditService(db),
    )


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
    response_model=HiringDecisionEnvelopeResponse,
)
async def get_hiring_decision(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> HiringDecisionEnvelopeResponse:
    return await _service(db).get_current(candidate_id=candidate_id, job_id=job_id)


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/hiring-decision/history",
    response_model=HiringDecisionHistoryResponse,
)
async def get_hiring_decision_history(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> HiringDecisionHistoryResponse:
    return await _service(db).list_history(candidate_id=candidate_id, job_id=job_id)


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/hiring-decision",
    response_model=HiringDecisionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_hiring_decision(
    job_id: UUID,
    candidate_id: UUID,
    body: HiringDecisionCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> HiringDecisionResponse:
    try:
        result = await _service(db).create(
            candidate_id=candidate_id,
            job_id=job_id,
            decided_by=current_user.id,
            body=body,
        )
        await db.commit()
        if result.decision_status == "submitted":
            await notify_candidate_event_safely(
                db,
                event_type="hiring_decision_submitted",
                candidate_id=result.candidate_id,
                job_id=result.job_id,
                related_entity_type="hiring_decision",
                related_entity_id=result.id,
                actor_id=current_user.id,
            )
        return result
    except Exception as exc:
        await db.rollback()
        _handle_pipeline_error(exc)
        raise


@router.patch(
    "/hiring-decisions/{decision_id}",
    response_model=HiringDecisionResponse,
)
async def patch_hiring_decision(
    decision_id: UUID,
    body: HiringDecisionPatchRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> HiringDecisionResponse:
    try:
        result = await _service(db).patch(
            decision_id=decision_id, body=body, actor_user_id=current_user.id
        )
        await db.commit()
        if body.submit and result.decision_status == "submitted":
            await notify_candidate_event_safely(
                db,
                event_type="hiring_decision_submitted",
                candidate_id=result.candidate_id,
                job_id=result.job_id,
                related_entity_type="hiring_decision",
                related_entity_id=result.id,
                actor_id=current_user.id,
            )
        return result
    except Exception as exc:
        await db.rollback()
        _handle_pipeline_error(exc)
        raise
