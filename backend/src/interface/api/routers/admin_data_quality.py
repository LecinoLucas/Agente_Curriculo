"""Admin endpoints for data quality management."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.interface.api.dependencies import get_db, get_current_user
from src.application.services.data_quality_service import DataQualityService
from src.domain.enums.data_quality_status import DataQualityStatus
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.domain.entities.user import UserRole, User

router = APIRouter(prefix="/api/v1/admin/data-quality", tags=["admin"])


class MarkInvalidRequest(BaseModel):
    """Request to mark candidate as invalid."""
    reason: str = Field(
        ...,
        min_length=10,
        description="Explanation for marking as invalid (min 10 chars)"
    )


class DataQualityStatus_Response(BaseModel):
    """Response with candidate data quality status."""
    candidate_id: UUID
    status: str
    reason: str | None
    marked_at: str | None


class BatchClassificationResponse(BaseModel):
    """Response from batch classification."""
    total: int
    valid: int
    no_resume: int
    empty_resume: int
    parsing_failed: int
    invalid_manual: int
    unknown: int
    failed: int


@router.post("/classify/{candidate_id}")
async def classify_candidate(
    candidate_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DataQualityStatus_Response:
    """Classify a single candidate based on resume data.

    Only admins can perform this action.
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.RECRUITER]:
        raise HTTPException(status_code=403, detail="Not authorized")

    service = DataQualityService(db)
    try:
        status, reason = await service.classify_and_mark_candidate(candidate_id)
        return DataQualityStatus_Response(
            candidate_id=candidate_id,
            status=status.value,
            reason=reason,
            marked_at=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/mark-invalid/{candidate_id}")
async def mark_candidate_invalid(
    candidate_id: UUID,
    body: MarkInvalidRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DataQualityStatus_Response:
    """Manually mark candidate as invalid with audit trail."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Only admins can mark invalid")

    service = DataQualityService(db)
    try:
        await service.mark_invalid(
            candidate_id=candidate_id,
            reason=body.reason,
            marked_by=current_user.id,
        )

        from sqlalchemy import select
        stmt = select(CandidateModel).where(CandidateModel.id == candidate_id)
        result = await db.execute(stmt)
        candidate = result.scalar_one()

        return DataQualityStatus_Response(
            candidate_id=candidate_id,
            status=candidate.data_quality_status,
            reason=candidate.data_quality_reason,
            marked_at=candidate.data_quality_marked_at.isoformat() if candidate.data_quality_marked_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/unmark-invalid/{candidate_id}")
async def unmark_candidate_invalid(
    candidate_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DataQualityStatus_Response:
    """Revert manual invalid marking and re-classify candidate."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Only admins can revert marking")

    service = DataQualityService(db)
    try:
        await service.unmark_invalid(
            candidate_id=candidate_id,
            marked_by=current_user.id,
        )

        from sqlalchemy import select
        stmt = select(CandidateModel).where(CandidateModel.id == candidate_id)
        result = await db.execute(stmt)
        candidate = result.scalar_one()

        return DataQualityStatus_Response(
            candidate_id=candidate_id,
            status=candidate.data_quality_status,
            reason=candidate.data_quality_reason,
            marked_at=candidate.data_quality_marked_at.isoformat() if candidate.data_quality_marked_at else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/batch-classify")
async def batch_classify_all_candidates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BatchClassificationResponse:
    """Batch classify all candidates (admin only).

    This operation may take a while on large datasets.
    """
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Only admins can run batch operations")

    service = DataQualityService(db)
    counts = await service.reclassify_all_candidates()

    total = sum(v for k, v in counts.items() if k != "failed")
    return BatchClassificationResponse(
        total=total,
        valid=counts.get("valid", 0),
        no_resume=counts.get("no_resume", 0),
        empty_resume=counts.get("empty_resume", 0),
        parsing_failed=counts.get("parsing_failed", 0),
        invalid_manual=counts.get("invalid_manual", 0),
        unknown=counts.get("unknown", 0),
        failed=counts.get("failed", 0),
    )


@router.get("/candidates/by-status/{status}")
async def get_candidates_by_quality_status(
    status: str,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DataQualityStatus_Response]:
    """Get candidates with specific data quality status."""
    if current_user.role not in [UserRole.ADMIN, UserRole.RECRUITER]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Validate status
    if status not in DataQualityStatus.valid_statuses():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Valid values: {', '.join(DataQualityStatus.valid_statuses())}"
        )

    service = DataQualityService(db)
    candidates = await service.get_candidates_by_quality(
        status=DataQualityStatus(status),
        limit=limit,
        offset=offset,
    )

    return [
        DataQualityStatus_Response(
            candidate_id=c.id,
            status=c.data_quality_status,
            reason=c.data_quality_reason,
            marked_at=c.data_quality_marked_at.isoformat() if c.data_quality_marked_at else None,
        )
        for c in candidates
    ]
