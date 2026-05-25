from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.behavioral_ai_evaluation_service import (
    BehavioralAIEvaluationService,
    behavioral_ai_safe_detail,
)
from src.domain.exceptions import ValidationException
from src.interface.api.dependencies import AdminOnly, RecruiterOrAdmin, get_db
from src.interface.api.schemas.behavioral_ai_evaluation_schemas import (
    BehavioralAIEvaluationDetailResponse,
    BehavioralAIEvaluationListResponse,
    BehavioralAIEvaluationMetricsResponse,
    BehavioralAIRetryResponse,
)
from src.interface.workers.behavioral_ai_dispatcher import enqueue_behavioral_ai_evaluation

router = APIRouter(prefix="/admin/behavioral-ai", tags=["admin-behavioral-ai"])


@router.get(
    "/metrics",
    response_model=BehavioralAIEvaluationMetricsResponse,
    status_code=status.HTTP_200_OK,
)
async def get_behavioral_ai_metrics(
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAIEvaluationMetricsResponse:
    service = BehavioralAIEvaluationService(db)
    return await service.get_operational_metrics()


@router.get(
    "/evaluations",
    response_model=BehavioralAIEvaluationListResponse,
    status_code=status.HTTP_200_OK,
)
async def list_behavioral_ai_evaluations(
    _current_user: RecruiterOrAdmin,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    operational_status: str | None = Query(default=None),
    candidate_id: UUID | None = Query(default=None),
    job_id: UUID | None = Query(default=None),
    provider: str | None = Query(default=None),
    model: str | None = Query(default=None),
    provider_error_type: str | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> BehavioralAIEvaluationListResponse:
    service = BehavioralAIEvaluationService(db)
    rows, total = await service.list_operational_evaluations(
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        operational_status=operational_status,
        candidate_id=candidate_id,
        job_id=job_id,
        provider=provider,
        model=model,
        provider_error_type=provider_error_type,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    return {
        "data": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get(
    "/evaluations/{evaluation_id}",
    response_model=BehavioralAIEvaluationDetailResponse,
    status_code=status.HTTP_200_OK,
)
async def get_behavioral_ai_evaluation_detail(
    evaluation_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAIEvaluationDetailResponse:
    service = BehavioralAIEvaluationService(db)
    detail = await service.get_operational_evaluation_detail(evaluation_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=behavioral_ai_safe_detail(
                "behavioral_ai_evaluation_not_found",
                message="Avaliação IA comportamental não encontrada.",
            ),
        )
    return detail


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


@router.post(
    "/{evaluation_id}/retry",
    response_model=BehavioralAIRetryResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_behavioral_ai_evaluation(
    evaluation_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAIRetryResponse:
    service = BehavioralAIEvaluationService(db)
    try:
        evaluation, should_enqueue = await service.retry_failed_or_stuck(evaluation_id=evaluation_id)
        if should_enqueue:
            await service.mark_enqueued(evaluation)
            try:
                enqueue_behavioral_ai_evaluation(evaluation.id)
            except Exception as exc:
                await service.mark_enqueue_failed(evaluation, "behavioral_ai_enqueue_failed")
                await db.commit()
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "code": "enqueue_failed",
                        "message": "Não foi possível enfileirar a IA comportamental.",
                        "evaluation_id": str(evaluation.id),
                    },
                ) from exc
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=behavioral_ai_safe_detail(
                    "behavioral_ai_evaluation_not_found",
                    message="Avaliação IA comportamental não encontrada.",
                ),
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=behavioral_ai_safe_detail(
                "retry_not_allowed",
                message="Retry não permitido para o estado atual.",
            ),
        ) from exc
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=behavioral_ai_safe_detail("unexpected_error"),
        ) from exc
