from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admission.repositories.admission_repository import AdmissionRepository
from app.modules.admission.schemas.admission_schemas import (
    AdmissionProgressResponse,
    AdmissionResponse,
    CandidateDocumentResponse,
    UploadDocumentRequest,
    ValidateDocumentRequest,
)
from app.modules.admission.services.admission_service import AdmissionService
from src.interface.api.dependencies import RecruiterOrAdmin, get_db

router = APIRouter(prefix="/admissions", tags=["admissions"])


def _repository(db: AsyncSession) -> AdmissionRepository:
    return AdmissionRepository(db)


def _service(db: AsyncSession) -> AdmissionService:
    return AdmissionService(_repository(db))


@router.get("/{id}", response_model=AdmissionResponse)
async def get_admission(
    id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdmissionResponse:
    admission = await _repository(db).get_admission(id)
    if admission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission not found")
    return AdmissionResponse.model_validate(admission)


@router.get("/{id}/progress", response_model=AdmissionProgressResponse)
async def get_admission_progress(
    id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdmissionProgressResponse:
    try:
        progress = await _service(db).get_admission_progress(id)
        return AdmissionProgressResponse(**progress)
    except ValueError as exc:
        if str(exc) == "admission_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission not found")
        raise


@router.post("/{id}/documents", response_model=CandidateDocumentResponse)
async def upload_document(
    id: UUID,
    body: UploadDocumentRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateDocumentResponse:
    try:
        document = await _service(db).upload_document(
            admission_id=id,
            file_path=body.file_path,
            requirement_id=body.requirement_id,
        )
        await db.commit()
        return CandidateDocumentResponse.model_validate(document)
    except ValueError as exc:
        await db.rollback()
        if str(exc) == "admission_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission not found")
        if str(exc) == "requirement_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document requirement not found")
        raise
    except Exception:
        await db.rollback()
        raise


@router.patch("/{id}/documents/{doc_id}", response_model=CandidateDocumentResponse)
async def validate_document(
    id: UUID,
    doc_id: UUID,
    body: ValidateDocumentRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateDocumentResponse:
    try:
        document = await _service(db).validate_document(doc_id=doc_id, status=body.status)
        if document.admission_id != id:
            await db.rollback()
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        await db.commit()
        return CandidateDocumentResponse.model_validate(document)
    except ValueError as exc:
        await db.rollback()
        if str(exc) == "document_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        if str(exc) == "admission_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admission not found")
        if str(exc) == "invalid_document_status":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
        raise
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        raise
