from uuid import UUID

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisService
from src.application.services.resume_service import (
    MAX_PDF_UPLOAD_BYTES,
    InvalidResumeFileError,
    InvalidResumeTextError,
    ResumeDetails,
    ResumeNotFoundError,
    ResumeService,
    ResumeUploadCandidateNotFoundError,
    ResumeUploadCandidateRequiredError,
)
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.interface.api.dependencies import CurrentUser, get_db
from src.interface.api.schemas.resume_schemas import (
    ResumeFileUploadResponse,
    ResumeResponse,
    ResumeSummaryResponse,
    ResumeUploadResponse,
    ResumeUploadRequest,
    ResumeVersionResponse,
    UpdateResumeRequest,
)

router = APIRouter(prefix="/resumes", tags=["resumes"])


def _resume_service(db: AsyncSession) -> ResumeService:
    return ResumeService(SQLAlchemyResumeRepository(db))


def _handle_resume_service_error(exc: Exception) -> None:
    if isinstance(exc, ResumeNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Currículo não encontrado",
        )
    if isinstance(exc, ResumeUploadCandidateNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    if isinstance(exc, ResumeUploadCandidateRequiredError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="candidate_id é obrigatório para este perfil",
        )
    if isinstance(exc, InvalidResumeTextError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Título não pode estar em branco",
        )
    if isinstance(exc, InvalidResumeFileError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    raise exc


def _resume_response(details: ResumeDetails) -> ResumeResponse:
    resume = details.resume
    return ResumeResponse(
        id=resume.id,
        candidate_id=resume.candidate_id,
        title=resume.title,
        status=resume.status,
        current_version=resume.current_version,
        created_at=resume.created_at,
        updated_at=resume.updated_at,
        versions=[ResumeVersionResponse.model_validate(v) for v in details.versions],
    )


@router.get("", response_model=list[ResumeSummaryResponse])
async def list_resumes(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[ResumeSummaryResponse]:
    rows = await _resume_service(db).list_summaries(current_user)

    return [
        ResumeSummaryResponse(
            id=row["id"],
            candidate_id=row["candidate_id"],
            candidate_name=row.get("candidate_name"),
            title=row["title"],
            status=row["status"],
            current_version=row["current_version"],
            current_version_id=row["current_version_id"],
            current_file_name=row["current_file_name"],
            extraction_status=row["extraction_status"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


@router.post("", response_model=ResumeUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def initiate_resume_upload(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    body: ResumeUploadRequest = Body(default_factory=ResumeUploadRequest),
) -> ResumeUploadResponse:
    try:
        upload = await _resume_service(db).initiate_dev_upload(
            current_user,
            candidate_id=body.candidate_id if body else None,
        )
        await db.commit()
        return ResumeUploadResponse(
            resume_id=upload.resume.id,
            candidate_id=upload.resume.candidate_id,
            version_id=upload.version.id,
            upload_url=upload.upload_url,
            upload_fields=upload.upload_fields,
        )
    except Exception as exc:
        await db.rollback()
        _handle_resume_service_error(exc)
        raise


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ResumeResponse:
    try:
        return _resume_response(await _resume_service(db).get_details(resume_id, current_user))
    except Exception as exc:
        _handle_resume_service_error(exc)
        raise


@router.post("/{resume_id}/upload", response_model=ResumeFileUploadResponse)
async def upload_resume_pdf(
    resume_id: UUID,
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ResumeFileUploadResponse:
    try:
        uploaded = await _resume_service(db).upload_pdf(
            resume_id,
            file_name=file.filename or "resume.pdf",
            content_type=file.content_type,
            content=await file.read(MAX_PDF_UPLOAD_BYTES + 1),
            current_user=current_user,
        )
        await db.commit()

        return ResumeFileUploadResponse(
            resume_id=uploaded.resume.id,
            candidate_id=uploaded.candidate.id,
            candidate_full_name=uploaded.candidate.full_name,
            version_id=uploaded.version.id,
            analysis_auto_requested=False,
            analysis_id=None,
            analysis_status=None,
            original_file_name=uploaded.version.original_file_name,
            file_size_bytes=uploaded.version.file_size_bytes,
            file_hash_sha256=uploaded.version.file_hash_sha256,
            extraction_status=uploaded.version.extraction_status,
            page_count=uploaded.version.page_count,
            word_count=uploaded.version.word_count,
            prefilled_fields=uploaded.prefilled_fields,
        )
    except Exception as exc:
        await db.rollback()
        _handle_resume_service_error(exc)
        raise


@router.patch("/{resume_id}", response_model=ResumeResponse)
async def update_resume(
    resume_id: UUID,
    body: UpdateResumeRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ResumeResponse:
    try:
        resume = await _resume_service(db).update(resume_id, body, current_user)
        await db.commit()
        return _resume_response(await _resume_service(db).get_details(resume.id, current_user))
    except Exception as exc:
        await db.rollback()
        _handle_resume_service_error(exc)
        raise


@router.patch("/{resume_id}/archive", response_model=ResumeResponse)
async def archive_resume(
    resume_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ResumeResponse:
    return await _set_resume_status(resume_id, "archived", current_user, db)


@router.patch("/{resume_id}/activate", response_model=ResumeResponse)
async def activate_resume(
    resume_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ResumeResponse:
    return await _set_resume_status(resume_id, "active", current_user, db)


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _resume_service(db).soft_delete(resume_id, current_user)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_resume_service_error(exc)
        raise


async def _set_resume_status(
    resume_id: UUID,
    next_status: str,
    current_user: CurrentUser,
    db: AsyncSession,
) -> ResumeResponse:
    try:
        resume = await _resume_service(db).set_status(resume_id, next_status, current_user)
        await db.commit()
        return _resume_response(await _resume_service(db).get_details(resume.id, current_user))
    except Exception as exc:
        await db.rollback()
        _handle_resume_service_error(exc)
        raise
