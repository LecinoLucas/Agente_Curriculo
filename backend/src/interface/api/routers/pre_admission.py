from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pre_admission_service import (
    MAX_PRE_ADMISSION_DOCUMENT_BYTES,
    PreAdmissionService,
)
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import SQLAlchemyPreAdmissionRepository
from src.interface.api.dependencies import CurrentCandidateSession, RecruiterOrAdmin, get_db
from src.interface.api.schemas.pre_admission_schemas import (
    CandidatePortalPreAdmissionEnvelopeResponse,
    PreAdmissionCaseResponse,
    PreAdmissionChecklistItemCreateRequest,
    PreAdmissionChecklistItemResponse,
    PreAdmissionChecklistItemUpdateRequest,
    PreAdmissionCreateRequest,
    PreAdmissionDocumentRejectRequest,
    PreAdmissionDocumentResponse,
    PreAdmissionDocumentsResponse,
    PreAdmissionEnvelopeResponse,
    PreAdmissionEventsResponse,
    PreAdmissionUpdateRequest,
)

router = APIRouter(tags=["pre-admission"])


def _service(db: AsyncSession) -> PreAdmissionService:
    return PreAdmissionService(SQLAlchemyPreAdmissionRepository(db))


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
    response_model=PreAdmissionEnvelopeResponse,
)
async def get_pre_admission(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionEnvelopeResponse:
    return await _service(db).get(candidate_id=candidate_id, job_id=job_id)


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
    response_model=PreAdmissionCaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pre_admission(
    job_id: UUID,
    candidate_id: UUID,
    body: PreAdmissionCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionCaseResponse:
    try:
        result = await _service(db).create(
            candidate_id=candidate_id,
            job_id=job_id,
            actor_id=current_user.id,
            body=body,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.patch(
    "/pre-admission/{case_id}",
    response_model=PreAdmissionCaseResponse,
)
async def update_pre_admission(
    case_id: UUID,
    body: PreAdmissionUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionCaseResponse:
    try:
        result = await _service(db).update(case_id=case_id, actor_id=current_user.id, body=body)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/pre-admission/{case_id}/checklist-items",
    response_model=PreAdmissionChecklistItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pre_admission_checklist_item(
    case_id: UUID,
    body: PreAdmissionChecklistItemCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistItemResponse:
    try:
        result = await _service(db).add_checklist_item(case_id=case_id, actor_id=current_user.id, body=body)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.patch(
    "/pre-admission/{case_id}/checklist-items/{item_id}",
    response_model=PreAdmissionChecklistItemResponse,
)
async def update_pre_admission_checklist_item(
    case_id: UUID,
    item_id: UUID,
    body: PreAdmissionChecklistItemUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistItemResponse:
    try:
        result = await _service(db).update_checklist_item(
            case_id=case_id,
            item_id=item_id,
            actor_id=current_user.id,
            body=body,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/pre-admission/{case_id}/events",
    response_model=PreAdmissionEventsResponse,
)
async def get_pre_admission_events(
    case_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionEventsResponse:
    return await _service(db).events(case_id=case_id)


@router.get(
    "/pre-admission/{case_id}/documents",
    response_model=PreAdmissionDocumentsResponse,
)
async def list_pre_admission_documents(
    case_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentsResponse:
    return await _service(db).list_documents(case_id=case_id)


@router.post(
    "/pre-admission/documents/{document_id}/approve",
    response_model=PreAdmissionDocumentResponse,
)
async def approve_pre_admission_document(
    document_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentResponse:
    try:
        result = await _service(db).approve_document(document_id=document_id, actor_id=current_user.id)
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/pre-admission/documents/{document_id}/reject",
    response_model=PreAdmissionDocumentResponse,
)
async def reject_pre_admission_document(
    document_id: UUID,
    body: PreAdmissionDocumentRejectRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentResponse:
    try:
        result = await _service(db).reject_document(
            document_id=document_id,
            actor_id=current_user.id,
            review_notes=body.review_notes,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.get("/pre-admission/documents/{document_id}/download")
async def download_pre_admission_document(
    document_id: UUID,
    _current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    document, path = await _service(db).document_download(document_id=document_id)
    return FileResponse(
        path,
        media_type=document.mime_type,
        filename=document.original_filename,
    )


@router.get(
    "/candidate-portal/pre-admission",
    response_model=CandidatePortalPreAdmissionEnvelopeResponse,
)
async def get_candidate_portal_pre_admission(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionEnvelopeResponse:
    return await _service(db).candidate_portal_get(candidate_id=candidate_session.candidate_id)


@router.get(
    "/candidate-portal/pre-admission/{case_id}",
    response_model=CandidatePortalPreAdmissionEnvelopeResponse,
)
async def get_candidate_portal_pre_admission_case(
    case_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionEnvelopeResponse:
    return await _service(db).candidate_portal_get(
        candidate_id=candidate_session.candidate_id,
        case_id=case_id,
    )


@router.post(
    "/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents",
    response_model=PreAdmissionDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_candidate_portal_pre_admission_document(
    case_id: UUID,
    item_id: UUID,
    candidate_session: CurrentCandidateSession,
    document_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentResponse:
    try:
        content = await document_file.read(MAX_PRE_ADMISSION_DOCUMENT_BYTES + 1)
        result = await _service(db).candidate_upload_document(
            candidate_id=candidate_session.candidate_id,
            case_id=case_id,
            item_id=item_id,
            file_name=document_file.filename or "documento",
            content_type=document_file.content_type,
            content=content,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.get("/candidate-portal/pre-admission/documents/{document_id}/download")
async def download_candidate_portal_pre_admission_document(
    document_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    document, path = await _service(db).document_download(
        document_id=document_id,
        candidate_id=candidate_session.candidate_id,
    )
    return FileResponse(
        path,
        media_type=document.mime_type,
        filename=document.original_filename,
    )
