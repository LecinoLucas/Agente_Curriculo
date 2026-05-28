from __future__ import annotations

import re
import unicodedata
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admission_case_workspace_service import (
    AdmissionCaseWorkspaceService,
    AdmissionReadinessError,
)
from src.application.services.pre_admission_checklist_template_service import (
    PreAdmissionChecklistTemplateService,
)
from src.application.services.pre_admission_service import (
    MAX_PRE_ADMISSION_DOCUMENT_BYTES,
    PreAdmissionService,
)
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models.pre_admission_model import PreAdmissionChecklistItemModel
from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import (
    SQLAlchemyPreAdmissionRepository,
)
from src.interface.api.dependencies import (
    CurrentCompleteCandidateSession,
    PreAdmissionDocumentDownloadStaff,
    PreAdmissionReadStaff,
    PreAdmissionWriteStaff,
    get_db,
)
from src.interface.api.routers.communication_events import notify_candidate_event_safely
from src.interface.api.schemas.pre_admission_schemas import (
    AdmissionCaseDocumentsResponse,
    AdmissionCaseEventsPageResponse,
    AdmissionCaseOverviewResponse,
    AdmissionCaseWorkspaceResponse,
    CandidatePortalPreAdmissionDocumentUploadResponse,
    CandidatePortalPreAdmissionEnvelopeResponse,
    PreAdmissionCaseResponse,
    PreAdmissionChecklistTemplateCreateRequest,
    PreAdmissionChecklistTemplateDetailResponse,
    PreAdmissionChecklistTemplateItemCreateRequest,
    PreAdmissionChecklistTemplateItemResponse,
    PreAdmissionChecklistTemplateResponse,
    PreAdmissionChecklistTemplateUpdateRequest,
    PreAdmissionChecklistTemplateItemUpdateRequest,
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


def _sanitize_download_filename(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    safe = re.sub(r"[^\w .-]", "", ascii_name).strip()
    safe = re.sub(r"\s+", "_", safe)
    while ".." in safe:
        safe = safe.replace("..", ".")
    safe = safe.lstrip(".")
    return safe or "documento.pdf"


def _service(db: AsyncSession) -> PreAdmissionService:
    return PreAdmissionService(SQLAlchemyPreAdmissionRepository(db))


def _workspace_service(db: AsyncSession) -> AdmissionCaseWorkspaceService:
    return AdmissionCaseWorkspaceService(SQLAlchemyPreAdmissionRepository(db))


def _template_service(db: AsyncSession) -> PreAdmissionChecklistTemplateService:
    return PreAdmissionChecklistTemplateService(SQLAlchemyPreAdmissionRepository(db))


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
    response_model=PreAdmissionEnvelopeResponse,
)
async def get_pre_admission(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionEnvelopeResponse:
    return await _service(db).get(candidate_id=candidate_id, job_id=job_id)


@router.get(
    "/admin/pre-admission/checklists",
    response_model=list[PreAdmissionChecklistTemplateResponse],
)
async def list_pre_admission_checklists(
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> list[PreAdmissionChecklistTemplateResponse]:
    return await _template_service(db).list_templates()


@router.get(
    "/admin/pre-admission/checklists/{template_id}",
    response_model=PreAdmissionChecklistTemplateDetailResponse,
)
async def get_pre_admission_checklist(
    template_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateDetailResponse:
    try:
        return await _template_service(db).get_template(template_id)
    except NotFoundException as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc


@router.post(
    "/admin/pre-admission/checklists",
    response_model=PreAdmissionChecklistTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pre_admission_checklist(
    body: PreAdmissionChecklistTemplateCreateRequest,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateResponse:
    try:
        result = await _template_service(db).create_template(body=body)
        await db.commit()
        return result
    except ValidationException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message) from exc
    except Exception:
        await db.rollback()
        raise


@router.patch(
    "/admin/pre-admission/checklists/{template_id}",
    response_model=PreAdmissionChecklistTemplateResponse,
)
async def update_pre_admission_checklist(
    template_id: UUID,
    body: PreAdmissionChecklistTemplateUpdateRequest,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateResponse:
    try:
        result = await _template_service(db).update_template(template_id=template_id, body=body)
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


@router.post(
    "/admin/pre-admission/checklists/{template_id}/archive",
    response_model=PreAdmissionChecklistTemplateResponse,
)
async def archive_pre_admission_checklist(
    template_id: UUID,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateResponse:
    try:
        result = await _template_service(db).archive_template(template_id=template_id)
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admin/pre-admission/checklists/{template_id}/duplicate",
    response_model=PreAdmissionChecklistTemplateDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_pre_admission_checklist(
    template_id: UUID,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateDetailResponse:
    try:
        result = await _template_service(db).duplicate_template(template_id=template_id)
        await db.commit()
        return result
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admin/pre-admission/checklists/{template_id}/items",
    response_model=PreAdmissionChecklistTemplateItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pre_admission_checklist_template_item(
    template_id: UUID,
    body: PreAdmissionChecklistTemplateItemCreateRequest,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateItemResponse:
    try:
        result = await _template_service(db).create_item(template_id=template_id, body=body)
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


@router.patch(
    "/admin/pre-admission/checklists/{template_id}/items/{item_id}",
    response_model=PreAdmissionChecklistTemplateItemResponse,
)
async def update_pre_admission_checklist_template_item(
    template_id: UUID,
    item_id: UUID,
    body: PreAdmissionChecklistTemplateItemUpdateRequest,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistTemplateItemResponse:
    try:
        result = await _template_service(db).update_item(template_id=template_id, item_id=item_id, body=body)
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


@router.delete(
    "/admin/pre-admission/checklists/{template_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    response_class=Response,
)
async def delete_pre_admission_checklist_template_item(
    template_id: UUID,
    item_id: UUID,
    _current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _template_service(db).remove_item(template_id=template_id, item_id=item_id)
        await db.commit()
    except NotFoundException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message) from exc
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/admission/cases/{case_id}/workspace",
    response_model=AdmissionCaseWorkspaceResponse,
)
async def get_admission_case_workspace(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseWorkspaceResponse:
    return await _workspace_service(db).get_workspace(case_id=case_id)


@router.get(
    "/pre-admission/cases/{case_id}/overview",
    response_model=AdmissionCaseOverviewResponse,
)
async def get_admission_case_overview(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseOverviewResponse:
    return await _workspace_service(db).get_overview(case_id=case_id)


@router.get(
    "/pre-admission/cases/{case_id}/documents",
    response_model=AdmissionCaseDocumentsResponse,
)
async def get_admission_case_documents(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseDocumentsResponse:
    return await _workspace_service(db).get_documents(case_id=case_id)


@router.get(
    "/pre-admission/cases/{case_id}/events",
    response_model=AdmissionCaseEventsPageResponse,
)
async def get_admission_case_events_page(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseEventsPageResponse:
    return await _workspace_service(db).get_events(
        case_id=case_id,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/admission/checklist-items/{item_id}/approve",
    response_model=AdmissionCaseWorkspaceResponse,
)
async def approve_admission_checklist_item(
    item_id: UUID,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseWorkspaceResponse:
    try:
        result = await _workspace_service(db).approve_checklist_item(
            item_id=item_id,
            actor_id=current_user.id,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission/checklist-items/{item_id}/reject",
    response_model=AdmissionCaseWorkspaceResponse,
)
async def reject_admission_checklist_item(
    item_id: UUID,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseWorkspaceResponse:
    try:
        result = await _workspace_service(db).reject_checklist_item(
            item_id=item_id,
            actor_id=current_user.id,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission/checklist-items/{item_id}/request-correction",
    response_model=AdmissionCaseWorkspaceResponse,
)
async def request_admission_checklist_item_correction(
    item_id: UUID,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseWorkspaceResponse:
    try:
        result = await _workspace_service(db).request_checklist_item_correction(
            item_id=item_id,
            actor_id=current_user.id,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission/checklist-items/{item_id}/mark-not-required",
    response_model=AdmissionCaseWorkspaceResponse,
)
async def mark_admission_checklist_item_not_required(
    item_id: UUID,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseWorkspaceResponse:
    try:
        result = await _workspace_service(db).mark_checklist_item_not_required(
            item_id=item_id,
            actor_id=current_user.id,
        )
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission/cases/{case_id}/mark-ready-for-export",
    response_model=AdmissionCaseWorkspaceResponse,
)
async def mark_admission_case_ready_for_export(
    case_id: UUID,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionCaseWorkspaceResponse:
    try:
        result = await _workspace_service(db).mark_ready_for_export(
            case_id=case_id,
            actor_id=current_user.id,
        )
        await db.commit()
        return result
    except AdmissionReadinessError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Caso de pré-admissão possui pendências para exportação.",
                "blockers": [blocker.model_dump(mode="json") for blocker in exc.blockers],
            },
        ) from exc
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/pre-admission",
    response_model=PreAdmissionCaseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_pre_admission(
    job_id: UUID,
    candidate_id: UUID,
    body: PreAdmissionCreateRequest,
    current_user: PreAdmissionWriteStaff,
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
        await notify_candidate_event_safely(
            db,
            event_type="pre_admission_created",
            candidate_id=result.candidate_id,
            job_id=result.job_id,
            related_entity_type="pre_admission_case",
            related_entity_id=result.id,
            actor_id=current_user.id,
        )
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
    current_user: PreAdmissionWriteStaff,
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
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionChecklistItemResponse:
    try:
        result = await _service(db).add_checklist_item(
            case_id=case_id,
            actor_id=current_user.id,
            body=body,
        )
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
    current_user: PreAdmissionWriteStaff,
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
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionEventsResponse:
    return await _service(db).events(case_id=case_id)


@router.get(
    "/pre-admission/{case_id}/documents",
    response_model=PreAdmissionDocumentsResponse,
)
async def list_pre_admission_documents(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentsResponse:
    return await _service(db).list_documents(case_id=case_id)


@router.post(
    "/pre-admission/documents/{document_id}/approve",
    response_model=PreAdmissionDocumentResponse,
)
async def approve_pre_admission_document(
    document_id: UUID,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentResponse:
    try:
        result = await _service(db).approve_document(
            document_id=document_id,
            actor_id=current_user.id,
        )
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
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> PreAdmissionDocumentResponse:
    try:
        result = await _service(db).reject_document(
            document_id=document_id,
            actor_id=current_user.id,
            rejection_reason_public=body.rejection_reason_public,
            review_notes=body.review_notes,
        )
        await db.commit()
        document_title = await db.scalar(
            sa.select(PreAdmissionChecklistItemModel.title).where(
                PreAdmissionChecklistItemModel.id == result.checklist_item_id
            )
        )
        await notify_candidate_event_safely(
            db,
            event_type="document_rejected",
            candidate_id=result.candidate_id,
            related_entity_type="pre_admission_document",
            related_entity_id=result.id,
            context={"document_type": document_title or "enviado"},
            actor_id=current_user.id,
        )
        return result
    except Exception:
        await db.rollback()
        raise


@router.get("/pre-admission/documents/{document_id}/download")
async def download_pre_admission_document(
    document_id: UUID,
    current_user: PreAdmissionDocumentDownloadStaff,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    try:
        document, path = await _service(db).document_download(
            document_id=document_id,
            actor_type="staff",
            actor_id=current_user.id,
            actor_role=current_user.role.value,
        )
        await db.commit()
        return FileResponse(
            path,
            media_type=document.mime_type,
            filename=_sanitize_download_filename(document.original_filename),
        )
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/candidate-portal/pre-admission",
    response_model=CandidatePortalPreAdmissionEnvelopeResponse,
)
async def get_candidate_portal_pre_admission(
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionEnvelopeResponse:
    return await _service(db).candidate_portal_get(candidate_id=candidate_session.candidate_id)


@router.get(
    "/candidate-portal/pre-admission/{case_id}",
    response_model=CandidatePortalPreAdmissionEnvelopeResponse,
)
async def get_candidate_portal_pre_admission_case(
    case_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionEnvelopeResponse:
    return await _service(db).candidate_portal_get(
        candidate_id=candidate_session.candidate_id,
        case_id=case_id,
    )


@router.post(
    "/candidate-portal/pre-admission/{case_id}/checklist-items/{item_id}/documents",
    response_model=CandidatePortalPreAdmissionDocumentUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_candidate_portal_pre_admission_document(
    case_id: UUID,
    item_id: UUID,
    candidate_session: CurrentCompleteCandidateSession,
    document_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalPreAdmissionDocumentUploadResponse:
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
    candidate_session: CurrentCompleteCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    try:
        document, path = await _service(db).document_download(
            document_id=document_id,
            actor_type="candidate",
            candidate_id=candidate_session.candidate_id,
        )
        await db.commit()
        return FileResponse(
            path,
            media_type=document.mime_type,
            filename=_sanitize_download_filename(document.original_filename),
        )
    except Exception:
        await db.rollback()
        raise
