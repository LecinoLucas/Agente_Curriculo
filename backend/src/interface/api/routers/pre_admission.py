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
    PreAdmissionExportStaff,
    PreAdmissionReadStaff,
    PreAdmissionWriteStaff,
    get_db,
)
from src.interface.api.routers.communication_events import notify_candidate_event_safely
from src.interface.api.schemas.pre_admission_schemas import (
    AdmissionCaseDocumentsResponse,
    AdmissionCaseEventsPageResponse,
    AdmissionCaseOverviewResponse,
    AdmissionProtheusBridgeSummaryResponse,
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
    ProtheusExportQueueCreateRequest,
    ProtheusExportQueueCreateResponse,
    ProtheusExportDashboardItemsResponse,
    ProtheusExportDashboardSummaryResponse,
    ProtheusExportQueuePreflightResponse,
    ProtheusExportQueueStatusResponse,
)
from src.application.services import protheus_export_queue_service as _pq

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


@router.get(
    "/pre-admission/cases/{case_id}/protheus-bridge-summary",
    response_model=AdmissionProtheusBridgeSummaryResponse,
)
async def get_admission_case_protheus_bridge_summary(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> AdmissionProtheusBridgeSummaryResponse:
    return await _workspace_service(db).get_protheus_bridge_summary(case_id=case_id)


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


# ── Protheus Export Queue ─────────────────────────────────────────────────────


@router.get(
    "/pre-admission/protheus-export-dashboard",
    response_model=ProtheusExportDashboardSummaryResponse,
)
async def get_protheus_export_dashboard(
    _current_user: PreAdmissionExportStaff,
) -> ProtheusExportDashboardSummaryResponse:
    try:
        result = await _pq.get_dashboard()
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    return ProtheusExportDashboardSummaryResponse(**result)


@router.get(
    "/pre-admission/protheus-export-dashboard/items",
    response_model=ProtheusExportDashboardItemsResponse,
)
async def list_protheus_export_dashboard_items(
    _current_user: PreAdmissionExportStaff,
    status_filter: str | None = Query(default=None, alias="status", max_length=64),
    limit: int = Query(default=25, ge=1),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> ProtheusExportDashboardItemsResponse:
    try:
        result = await _pq.list_dashboard_items(
            status=status_filter,
            limit=limit,
            offset=offset,
            session=db,
        )
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )
    return ProtheusExportDashboardItemsResponse(**result)


@router.post(
    "/pre-admission/cases/{case_id}/protheus-export-requests/preflight",
    response_model=ProtheusExportQueuePreflightResponse,
)
async def preflight_protheus_export_request(
    case_id: UUID,
    body: ProtheusExportQueueCreateRequest,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> ProtheusExportQueuePreflightResponse:
    from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel

    case = await db.get(PreAdmissionCaseModel, case_id)
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caso de pré-admissão não encontrado.",
        )

    try:
        result = await _pq.preflight_case(
            case_id=case_id,
            requested_by=str(current_user.id),
            session=db,
            unit_code=body.unit_code or "STUB",
            protheus_group_code=body.protheus_group_code or "T01",
            protheus_branch_code=body.protheus_branch_code or "01",
        )
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    return ProtheusExportQueuePreflightResponse(**result)


@router.post(
    "/pre-admission/cases/{case_id}/protheus-export-requests",
    response_model=ProtheusExportQueueCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_protheus_export_request(
    case_id: UUID,
    body: ProtheusExportQueueCreateRequest,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> ProtheusExportQueueCreateResponse:
    from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel

    case = await db.get(PreAdmissionCaseModel, case_id)
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caso de pré-admissão não encontrado.",
        )

    try:
        was_existing, export_req = await _pq.enqueue(
            case_id=case_id,
            requested_by=str(current_user.id),
            session=db,
            unit_code=body.unit_code or "STUB",
            protheus_group_code=body.protheus_group_code or "T01",
            protheus_branch_code=body.protheus_branch_code or "01",
        )
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueDuplicateError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe solicitação ativa para este caso. ID existente: {exc.existing_id}",
        )
    except _pq.ProtheusExportQueueValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": exc.message,
                "pending_requirements": exc.pending_requirements,
                "payload_status": exc.payload_status,
                "shape_debug": exc.shape_debug,
                "safe_error_code": exc.safe_error_code,
                "safe_error_message": exc.safe_error_message,
            },
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    http_status = status.HTTP_200_OK if was_existing else status.HTTP_201_CREATED
    result = ProtheusExportQueueCreateResponse(
        was_existing=was_existing,
        export_request=ProtheusExportQueueStatusResponse(**export_req),
    )
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=http_status, content=result.model_dump(mode="json"))


@router.get(
    "/pre-admission/cases/{case_id}/protheus-export-requests/latest",
    response_model=ProtheusExportQueueStatusResponse,
)
async def get_latest_protheus_export_request(
    case_id: UUID,
    _current_user: PreAdmissionReadStaff,
    db: AsyncSession = Depends(get_db),
) -> ProtheusExportQueueStatusResponse:
    from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel

    case = await db.get(PreAdmissionCaseModel, case_id)
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caso de pré-admissão não encontrado.",
        )

    try:
        item = await _pq.get_latest_by_case_id(case_id=case_id, session=db)
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhuma solicitação de exportação encontrada para este caso.",
        )

    return ProtheusExportQueueStatusResponse(**item)


@router.post(
    "/pre-admission/cases/{case_id}/protheus-export-requests/request-new",
    response_model=ProtheusExportQueueCreateResponse,
)
async def request_new_protheus_export_request(
    case_id: UUID,
    body: ProtheusExportQueueCreateRequest,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> ProtheusExportQueueCreateResponse:
    from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel

    case = await db.get(PreAdmissionCaseModel, case_id)
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caso de pré-admissão não encontrado.",
        )

    try:
        was_existing, export_req = await _pq.request_new(
            case_id=case_id,
            requested_by=str(current_user.id),
            session=db,
            unit_code=body.unit_code or "STUB",
            protheus_group_code=body.protheus_group_code or "T01",
            protheus_branch_code=body.protheus_branch_code or "01",
        )
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhuma solicitação anterior de exportação encontrada para este caso.",
        )
    except _pq.ProtheusExportQueueRequestNewNotAllowedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Nova solicitação segura não permitida no estado atual: {exc.status}",
        )
    except _pq.ProtheusExportQueueValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": exc.message,
                "pending_requirements": exc.pending_requirements,
                "payload_status": exc.payload_status,
                "shape_debug": exc.shape_debug,
                "safe_error_code": exc.safe_error_code,
                "safe_error_message": exc.safe_error_message,
            },
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    http_status = status.HTTP_200_OK if was_existing else status.HTTP_201_CREATED
    result = ProtheusExportQueueCreateResponse(
        was_existing=was_existing,
        export_request=ProtheusExportQueueStatusResponse(**export_req),
    )
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=http_status, content=result.model_dump(mode="json"))


@router.post(
    "/pre-admission/cases/{case_id}/protheus-export-requests/{export_id}/cancel",
    response_model=ProtheusExportQueueStatusResponse,
)
async def cancel_protheus_export_request(
    case_id: UUID,
    export_id: str,
    current_user: PreAdmissionWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> ProtheusExportQueueStatusResponse:
    from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel

    case = await db.get(PreAdmissionCaseModel, case_id)
    if case is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Caso de pré-admissão não encontrado.",
        )

    try:
        item = await _pq.cancel(
            export_id=export_id,
            cancelled_by=str(current_user.id),
        )
    except _pq.ProtheusExportQueueDisabledError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração Protheus Bridge desativada neste ambiente.",
        )
    except _pq.ProtheusExportQueueNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitação de exportação não encontrada.",
        )
    except _pq.ProtheusExportQueueNotCancellableError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Solicitação não pode ser cancelada no estado atual: {exc.status}",
        )
    except _pq.ProtheusExportQueueUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=exc.message,
        )

    return ProtheusExportQueueStatusResponse(**item)
