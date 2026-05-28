from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admitted_candidates_service import AdmittedCandidatesService
from src.application.services.audit_service import AuditService
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import (
    SQLAlchemyPreAdmissionRepository,
)
from src.interface.api.dependencies import PreAdmissionReadStaff, PreAdmissionWriteStaff, get_db
from src.interface.api.schemas.admission_schemas import (
    AdmittedCandidatesPageResponse,
    AdmittedCandidatesStatusResponse,
)
from src.interface.api.schemas.pre_admission_schemas import DismissAdmissionRequest

router = APIRouter(prefix="/admissions", tags=["admissions"])


def _service(db: AsyncSession) -> AdmittedCandidatesService:
    return AdmittedCandidatesService(
        SQLAlchemyPreAdmissionRepository(db),
        audit_service=AuditService(db),
    )


@router.get("/admitted", response_model=AdmittedCandidatesPageResponse)
async def list_admitted_candidates(
    _current_user: PreAdmissionReadStaff,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=120),
    status_filter: str = Query(default="all", alias="status"),
    db: AsyncSession = Depends(get_db),
) -> AdmittedCandidatesPageResponse:
    try:
        return await _service(db).list_admitted(
            page=page,
            page_size=page_size,
            search=search,
            status_filter=status_filter,
        )
    except ValidationException as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message) from exc


@router.post("/{admission_case_id}/dismiss", response_model=AdmittedCandidatesStatusResponse)
async def dismiss_admission_case(
    admission_case_id: UUID,
    body: DismissAdmissionRequest,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmittedCandidatesStatusResponse:
    try:
        result = await _service(db).dismiss_case(
            admission_case_id=admission_case_id,
            actor_user_id=current_user.id,
            reason=body.reason,
        )
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message) from exc
    except Exception:
        await db.rollback()
        raise
