import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.audit_service import AuditService
from src.application.services.candidate_service import (
    CandidateCpfConflictError,
    CandidateCriticalHistoryError,
    CandidateDeleteConfirmationError,
    CandidateDeleteReasonRequiredError,
    CandidateArchiveReasonRequiredError,
    CandidateEmailConflictError,
    CandidateNotAllowedUserIdError,
    CandidateNotFoundError,
    CandidateService,
    InvalidCandidateCpfError,
    InvalidCandidateTextError,
)
from src.application.services.candidate_note_service import (
    CandidateNoteCandidateNotFoundError,
    CandidateNoteForbiddenError,
    CandidateNoteNotFoundError,
    CandidateNoteService,
    CandidateNoteValidationError,
)
from src.application.services.pipeline_service import (
    PipelineCandidateNotFoundError,
    PipelineEntryNotFoundError,
    PipelineJobNotFoundError,
)
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.infrastructure.storage.resume_files import read_resume_file
from src.interface.api.dependencies import AdminOnly, RecruiterOrAdmin, get_db
from src.interface.api.schemas.candidate_schemas import (
    CandidateCheckResponse,
    CandidateListSummaryResponse,
    CandidateResumeDownloadUrlResponse,
    CandidateOverviewResponse,
    CandidateResponse,
    CreateCandidateRequest,
    ArchiveCandidateRequest,
    DeleteCandidateRequest,
    UpdateCandidateRequest,
    CandidateNoteResponse,
    CreateCandidateNoteRequest,
    UpdateCandidateNoteRequest,
)
from src.interface.api.schemas.common import PaginatedResponse


def _sanitize_filename(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    safe = re.sub(r"[^\w\s\-.]", "", ascii_name).strip().replace(" ", "_")
    return safe or "curriculo.pdf"


def _sanitize_content_disposition(disposition: str) -> str:
    if disposition not in {"attachment", "inline"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Disposição de conteúdo inválida",
        )
    return disposition

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _candidate_service(db: AsyncSession) -> CandidateService:
    return CandidateService(
        SQLAlchemyCandidateRepository(db),
        audit_service=AuditService(db),
    )


def _candidate_note_service(db: AsyncSession) -> CandidateNoteService:
    return CandidateNoteService(db)


def _handle_candidate_service_error(exc: Exception) -> None:
    if isinstance(exc, IntegrityError):
        message = str(exc.orig)
        if "uq_candidates_active_email" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Candidato com este e-mail já existe",
            )
        if "uq_candidates_active_cpf" in message:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Candidato com este CPF já existe",
            )
    if isinstance(exc, CandidateNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    if isinstance(exc, CandidateEmailConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato com este e-mail já existe",
        )
    if isinstance(exc, CandidateCpfConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato com este CPF já existe",
        )
    if isinstance(exc, InvalidCandidateTextError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nome não pode estar em branco",
        )
    if isinstance(exc, InvalidCandidateCpfError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CPF deve conter 11 dígitos",
        )
    if isinstance(exc, CandidateNotAllowedUserIdError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Não é permitido especificar user_id durante criação de candidato",
        )
    if isinstance(exc, CandidateDeleteReasonRequiredError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o motivo da exclusão definitiva.",
        )
    if isinstance(exc, CandidateDeleteConfirmationError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Digite EXCLUIR para confirmar a exclusão definitiva.",
        )
    if isinstance(exc, CandidateArchiveReasonRequiredError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe o motivo do arquivamento.",
        )
    if isinstance(exc, CandidateCriticalHistoryError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    if isinstance(exc, PipelineCandidateNotFoundError | PipelineJobNotFoundError | PipelineEntryNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recurso não encontrado")
    raise exc


def _handle_candidate_note_service_error(exc: Exception) -> None:
    if isinstance(exc, CandidateNoteCandidateNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    if isinstance(exc, CandidateNoteNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Observação não encontrada",
        )
    if isinstance(exc, CandidateNoteForbiddenError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permissão insuficiente para este recurso",
        )
    if isinstance(exc, CandidateNoteValidationError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    raise exc


@router.post("", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    body: CreateCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        candidate = await _candidate_service(db).create(body, current_user.id)
        await db.commit()
        await db.refresh(candidate)
        return CandidateResponse.model_validate(candidate)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.get("", response_model=PaginatedResponse[CandidateResponse])
async def list_candidates(
    current_user: RecruiterOrAdmin,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, description="Busca por nome, e-mail, CPF, telefone ou skill"),
    archived: bool = Query(default=False),
    application_source: str | None = Query(default=None),
    city: str | None = Query(default=None),
    state: str | None = Query(default=None),
    salary_min: float | None = Query(default=None, ge=0),
    salary_max: float | None = Query(default=None, ge=0),
    desired_contract_type: str | None = Query(default=None),
    link_status_filter: str | None = Query(default=None),
    has_resume: bool | None = Query(default=None),
    skill: str | None = Query(default=None),
    seniority: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CandidateResponse]:
    candidates, total_items = await _candidate_service(db).list(
        page,
        page_size,
        search,
        archived,
        application_source,
        city,
        state,
        salary_min,
        salary_max,
        desired_contract_type,
        link_status_filter,
        has_resume,
        skill,
        seniority,
    )

    return PaginatedResponse[CandidateResponse](
        data=[CandidateResponse.model_validate(c) for c in candidates],
        total=total_items,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_items + page_size - 1) // page_size),
    )


@router.get("/summaries", response_model=PaginatedResponse[CandidateListSummaryResponse])
async def list_candidate_summaries(
    current_user: RecruiterOrAdmin,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    has_resume: bool | None = Query(default=None),
    ai_status: list[str] | None = Query(default=None),
    archived: bool = Query(default=False),
    application_source: str | None = Query(default=None),
    city: str | None = Query(default=None),
    state: str | None = Query(default=None),
    salary_min: float | None = Query(default=None, ge=0),
    salary_max: float | None = Query(default=None, ge=0),
    desired_contract_type: str | None = Query(default=None),
    link_status_filter: str | None = Query(default=None),
    skill: str | None = Query(default=None),
    seniority: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CandidateListSummaryResponse]:
    items, total = await _candidate_service(db).list_summaries(
        page,
        page_size,
        search,
        has_resume,
        ai_status,
        archived,
        application_source,
        city,
        state,
        salary_min,
        salary_max,
        desired_contract_type,
        link_status_filter,
        skill,
        seniority,
    )
    return PaginatedResponse[CandidateListSummaryResponse](
        data=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/search", response_model=CandidateCheckResponse)
async def search_candidate_duplicate(
    current_user: RecruiterOrAdmin,
    email: str | None = Query(default=None),
    cpf: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> CandidateCheckResponse:
    if not email and not cpf:
        return CandidateCheckResponse(exists=False)
    return await _candidate_service(db).check_duplicate(email, cpf)


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        return CandidateResponse.model_validate(await _candidate_service(db).get(candidate_id))
    except Exception as exc:
        _handle_candidate_service_error(exc)
        raise


@router.get("/{candidate_id}/overview", response_model=CandidateOverviewResponse)
async def get_candidate_overview(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateOverviewResponse:
    try:
        return await _candidate_service(db).get_overview(candidate_id)
    except Exception as exc:
        _handle_candidate_service_error(exc)
        raise


@router.get("/{candidate_id}/notes", response_model=list[CandidateNoteResponse])
async def list_candidate_notes(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[CandidateNoteResponse]:
    try:
        rows = await _candidate_note_service(db).list_notes(
            candidate_id=candidate_id,
            current_user=current_user,
        )
        return [CandidateNoteResponse.model_validate(item) for item in rows]
    except Exception as exc:
        _handle_candidate_note_service_error(exc)
        raise


@router.post(
    "/{candidate_id}/notes",
    response_model=CandidateNoteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_candidate_note(
    candidate_id: UUID,
    body: CreateCandidateNoteRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateNoteResponse:
    try:
        note = await _candidate_note_service(db).create_note(
            candidate_id=candidate_id,
            current_user=current_user,
            note_text=body.note_text,
        )
        await db.commit()
        return CandidateNoteResponse.model_validate(note)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_note_service_error(exc)
        raise


@router.patch("/{candidate_id}/notes/{note_id}", response_model=CandidateNoteResponse)
async def update_candidate_note(
    candidate_id: UUID,
    note_id: UUID,
    body: UpdateCandidateNoteRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateNoteResponse:
    try:
        note = await _candidate_note_service(db).update_note(
            candidate_id=candidate_id,
            note_id=note_id,
            current_user=current_user,
            note_text=body.note_text,
        )
        await db.commit()
        return CandidateNoteResponse.model_validate(note)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_note_service_error(exc)
        raise


@router.delete("/{candidate_id}/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate_note(
    candidate_id: UUID,
    note_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _candidate_note_service(db).delete_note(
            candidate_id=candidate_id,
            note_id=note_id,
            current_user=current_user,
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_candidate_note_service_error(exc)
        raise


@router.patch("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: UUID,
    body: UpdateCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        candidate = await _candidate_service(db).update(candidate_id, body)
        await db.commit()
        await db.refresh(candidate)
        return CandidateResponse.model_validate(candidate)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.patch("/{candidate_id}/archive", response_model=CandidateResponse)
async def archive_candidate(
    candidate_id: UUID,
    body: ArchiveCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        candidate = await _candidate_service(db).archive(
            candidate_id,
            actor=current_user,
            reason=body.reason,
            note=body.note,
        )
        await db.commit()
        await db.refresh(candidate)
        return CandidateResponse.model_validate(candidate)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.patch("/{candidate_id}/restore", response_model=CandidateResponse)
async def restore_candidate(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        candidate = await _candidate_service(db).restore(candidate_id, actor=current_user)
        await db.commit()
        await db.refresh(candidate)
        return CandidateResponse.model_validate(candidate)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: UUID,
    current_user: AdminOnly,
    body: DeleteCandidateRequest | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        payload = body or DeleteCandidateRequest()
        await _candidate_service(db).hard_delete(
            candidate_id,
            actor=current_user,
            reason=payload.reason,
            note=payload.note,
            confirmation=payload.confirmation,
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.get("/{candidate_id}/resume/download")
async def download_candidate_resume(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """
    Download the original resume file for a candidate.

    Access: recruiter or admin only.
    Writes an audit log entry on every successful download.
    """
    resume_repo = SQLAlchemyResumeRepository(db)
    row = await resume_repo.find_latest_resume_version_for_candidate(candidate_id)

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currículo não encontrado para este candidato",
        )

    try:
        file_bytes = read_resume_file(row["s3_key"])
    except (FileNotFoundError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo do currículo não encontrado no servidor",
        )

    await AuditService(db).log_event(
        action="resume.download",
        resource_type="resume_version",
        resource_id=row["version_id"],
        user_id=current_user.id,
        metadata={
            "candidate_id": str(candidate_id),
            "actor_role": current_user.role.value,
            "resume_id": str(row["resume_id"]),
        },
    )
    await db.commit()

    raw_name = row.get("original_file_name") or "curriculo.pdf"
    safe_name = _sanitize_filename(raw_name)
    content_type = row.get("mime_type") or "application/pdf"

    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
        },
    )


@router.get(
    "/{candidate_id}/resumes/{resume_id}/download-url",
    response_model=CandidateResumeDownloadUrlResponse,
)
async def get_candidate_resume_download_url(
    candidate_id: UUID,
    resume_id: UUID,
    request: Request,
    current_user: RecruiterOrAdmin,
    version_id: UUID | None = Query(default=None),
    disposition: str = Query(default="inline"),
    db: AsyncSession = Depends(get_db),
) -> CandidateResumeDownloadUrlResponse:
    del current_user
    safe_disposition = _sanitize_content_disposition(disposition)
    row = await _resolve_resume_version_row(
        db=db,
        candidate_id=candidate_id,
        resume_id=resume_id,
        version_id=version_id,
    )

    file_url = request.url_for(
        "download_candidate_resume_by_id",
        candidate_id=str(candidate_id),
        resume_id=str(resume_id),
    )
    query_params = {
        "disposition": safe_disposition,
        "version_id": str(row["version_id"]),
    }
    return CandidateResumeDownloadUrlResponse(
        url=str(file_url.include_query_params(**query_params)),
        expires_at=None,
        content_type=row.get("mime_type") or "application/pdf",
        filename=_sanitize_filename(row.get("original_file_name") or "curriculo.pdf"),
    )


@router.get("/{candidate_id}/resumes/{resume_id}/download")
async def download_candidate_resume_by_id(
    candidate_id: UUID,
    resume_id: UUID,
    current_user: RecruiterOrAdmin,
    version_id: UUID | None = Query(default=None),
    disposition: str = Query(default="attachment"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    safe_disposition = _sanitize_content_disposition(disposition)
    row = await _resolve_resume_version_row(
        db=db,
        candidate_id=candidate_id,
        resume_id=resume_id,
        version_id=version_id,
    )

    try:
        file_bytes = read_resume_file(row["s3_key"])
    except (FileNotFoundError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arquivo do currículo não encontrado no servidor",
        )

    await AuditService(db).log_event(
        action="resume.download",
        resource_type="resume_version",
        resource_id=row["version_id"],
        user_id=current_user.id,
        metadata={
            "candidate_id": str(candidate_id),
            "actor_role": current_user.role.value,
            "resume_id": str(resume_id),
            "version_id": str(row["version_id"]),
            "disposition": safe_disposition,
        },
    )
    await db.commit()

    safe_name = _sanitize_filename(row.get("original_file_name") or "curriculo.pdf")
    content_type = row.get("mime_type") or "application/pdf"
    return Response(
        content=file_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'{safe_disposition}; filename="{safe_name}"',
            "Cache-Control": "no-store",
        },
    )


async def _resolve_resume_version_row(
    *,
    db: AsyncSession,
    candidate_id: UUID,
    resume_id: UUID,
    version_id: UUID | None,
) -> dict:
    resume_repo = SQLAlchemyResumeRepository(db)
    candidate = await resume_repo.find_candidate_by_id(candidate_id)
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )

    row = await resume_repo.find_resume_version_for_candidate(
        candidate_id=candidate_id,
        resume_id=resume_id,
        version_id=version_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currículo não encontrado para este candidato",
        )
    return row
