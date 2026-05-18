from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_ai_evaluation_service import BehavioralAIEvaluationService
from src.domain.exceptions import ValidationException
from src.interface.api.dependencies import AdminOnly, RecruiterOrAdmin, get_db
from src.interface.workers.behavioral_ai_dispatcher import enqueue_behavioral_ai_evaluation

router = APIRouter(prefix="/admin/behavioral-ai", tags=["admin-behavioral-ai"])


@router.get("/metrics", status_code=status.HTTP_200_OK)
async def get_behavioral_ai_metrics(
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict:
    service = BehavioralAIEvaluationService(db)
    return await service.get_operational_metrics()


@router.post("/stuck/detect", status_code=status.HTTP_200_OK)
async def detect_and_mark_stuck_behavioral_ai(
    _current_user: AdminOnly,
    limit: int = Query(default=200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> dict:
    service = BehavioralAIEvaluationService(db)
    count = await service.mark_stuck_as_failed(limit=limit)
    await db.commit()
    return {"success": True, "evaluations_marked_failed": count}


@router.post("/{evaluation_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_behavioral_ai_evaluation(
    evaluation_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    service = BehavioralAIEvaluationService(db)
    try:
        evaluation, should_enqueue = await service.retry_failed_or_stuck(evaluation_id=evaluation_id)
        if should_enqueue:
            await service.mark_enqueued(evaluation)
            enqueue_behavioral_ai_evaluation(evaluation.id)
        await db.commit()
        return {
            "evaluation_id": str(evaluation.id),
            "assignment_id": str(evaluation.assignment_id),
            "status": evaluation.status,
            "enqueued": should_enqueue,
            "retry_count": int(evaluation.retry_count or 0),
            "message": (
                "Avaliação enfileirada para retry"
                if should_enqueue
                else "Avaliação já em andamento"
            ),
        }
    except ValidationException as exc:
        await db.rollback()
        detail = str(exc)
        if "not found" in detail.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise
