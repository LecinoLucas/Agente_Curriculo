from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import (
    AIModelUnavailableError,
    AnalysisNotCompletedError,
    AnalysisNotFoundError,
    AnalysisResultDetails,
    AnalysisResultNotFoundError,
    AnalysisService,
    JobNotFoundError,
    PromptTemplateUnavailableError,
    ResumeVersionNotFoundError,
    ResumeVersionNotReadyError,
)
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.interface.api.dependencies import CurrentUser, RecruiterOrAdmin, get_db
from src.interface.api.schemas.analysis_schemas import (
    AnalysisGlobalItemResponse,
    AnalysisMatchResponse,
    AnalysisPipelineResponse,
    AnalysisRequestResponse,
    AnalysisResponse,
    AnalysisResultResponse,
    AnalysisStatusResponse,
)
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.workers.analysis_dispatcher import enqueue_analysis

router = APIRouter(prefix="/analyses", tags=["analyses"])


def _analysis_service(db: AsyncSession) -> AnalysisService:
    return AnalysisService(SQLAlchemyAnalysisRepository(db))


async def _resolve_requestor_name(db: AsyncSession, user_id: UUID) -> str | None:
    user = await SQLAlchemyUserRepository(db).find_by_id(user_id)
    return user.full_name if user is not None else None


async def _resolve_analysis_resume_context(
    db: AsyncSession,
    resume_version_id: UUID,
) -> dict[str, UUID | str | None]:
    row = await db.execute(
        sa.select(
            ResumeVersionModel.id.label("resume_version_id"),
            ResumeVersionModel.original_file_name.label("resume_file_name"),
            ResumeModel.id.label("resume_id"),
            ResumeModel.title.label("resume_title"),
            CandidateModel.id.label("candidate_id"),
            CandidateModel.full_name.label("candidate_name"),
        )
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
        .where(ResumeVersionModel.id == resume_version_id)
    )
    mapped = row.mappings().first()
    return dict(mapped) if mapped is not None else {}


async def _analysis_response(db: AsyncSession, analysis) -> AnalysisResponse:
    resume_context = await _resolve_analysis_resume_context(db, analysis.resume_version_id)
    return AnalysisResponse(
        id=analysis.id,
        resume_id=resume_context.get("resume_id"),
        resume_version_id=analysis.resume_version_id,
        candidate_id=resume_context.get("candidate_id"),
        candidate_name=resume_context.get("candidate_name"),
        resume_title=resume_context.get("resume_title"),
        resume_file_name=resume_context.get("resume_file_name"),
        job_id=analysis.job_id,
        status=analysis.status,
        priority=analysis.priority,
        retry_count=analysis.retry_count,
        requested_by=analysis.requested_by,
        requested_by_name=await _resolve_requestor_name(db, analysis.requested_by),
        failure_reason=analysis.failure_reason,
        created_at=analysis.created_at,
        updated_at=analysis.updated_at,
    )


def _handle_analysis_service_error(exc: Exception) -> None:
    if isinstance(exc, AnalysisNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise não encontrada")
    if isinstance(exc, ResumeVersionNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Versão de currículo não encontrada",
        )
    if isinstance(exc, ResumeVersionNotReadyError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Currículo ainda não possui texto extraído para análise",
        )
    if isinstance(exc, AIModelUnavailableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nenhum modelo de IA disponível",
        )
    if isinstance(exc, PromptTemplateUnavailableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nenhum prompt template disponível. Rode o seed de templates.",
        )
    if isinstance(exc, AnalysisNotCompletedError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Análise ainda não concluída",
        )
    if isinstance(exc, AnalysisResultNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resultado da análise não encontrado",
        )
    if isinstance(exc, JobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    raise exc


async def _analysis_result_response(
    db: AsyncSession,
    details: AnalysisResultDetails,
) -> AnalysisResultResponse:
    result = details.result
    resume_context = await _resolve_analysis_resume_context(db, details.analysis.resume_version_id)
    total_tokens = (
        int(result.input_tokens or 0)
        + int(result.output_tokens or 0)
        + int(result.cache_read_tokens or 0)
        + int(result.cache_write_tokens or 0)
    )
    return AnalysisResultResponse(
        analysis_id=details.analysis.id,
        resume_id=resume_context.get("resume_id"),
        resume_version_id=details.analysis.resume_version_id,
        candidate_id=resume_context.get("candidate_id"),
        candidate_name=resume_context.get("candidate_name"),
        resume_title=resume_context.get("resume_title"),
        resume_file_name=resume_context.get("resume_file_name"),
        requested_by=details.analysis.requested_by,
        requested_by_name=await _resolve_requestor_name(db, details.analysis.requested_by),
        worker_id=details.analysis.worker_id,
        task_id=details.analysis.task_id,
        used_real_ai=total_tokens > 0,
        overall_score=result.overall_score,
        technical_score=result.technical_score,
        experience_score=result.experience_score,
        education_score=result.education_score,
        communication_score=result.communication_score,
        leadership_score=result.leadership_score,
        candidate_summary=result.candidate_summary,
        seniority_level=result.seniority_level,
        total_experience_years=result.total_experience_years,
        strengths=result.strengths or [],
        weaknesses=result.weaknesses or [],
        recommendations=result.recommendations or [],
        keywords=result.keywords or [],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cache_read_tokens=result.cache_read_tokens,
        cache_write_tokens=result.cache_write_tokens,
        processing_time_ms=result.processing_time_ms,
        created_at=result.created_at,
    )


@router.post("", response_model=AnalysisRequestResponse, status_code=status.HTTP_202_ACCEPTED)
async def request_analysis(
    resume_version_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> AnalysisRequestResponse:
    try:
        analysis = await _analysis_service(db).request(resume_version_id, current_user)
        await db.commit()
        await db.refresh(analysis)
        enqueue_analysis(analysis.id)
        return AnalysisRequestResponse(analysis_id=analysis.id, status=analysis.status)
    except Exception as exc:
        await db.rollback()
        _handle_analysis_service_error(exc)
        raise


@router.get("", response_model=PaginatedResponse[AnalysisResponse])
async def list_analyses(
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[AnalysisResponse]:
    analyses, total = await _analysis_service(db).list(current_user, page, page_size, status_filter)

    return PaginatedResponse[AnalysisResponse](
        data=[await _analysis_response(db, item) for item in analyses],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/global", response_model=PaginatedResponse[AnalysisGlobalItemResponse])
async def list_analyses_global(
    current_user: RecruiterOrAdmin,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    used_real_ai: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[AnalysisGlobalItemResponse]:
    items, total = await _analysis_service(db).list_global(
        page, page_size, status_filter, search, used_real_ai
    )
    return PaginatedResponse[AnalysisGlobalItemResponse](
        data=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> AnalysisResponse:
    try:
        analysis = await _analysis_service(db).get(analysis_id, current_user)
        return await _analysis_response(db, analysis)
    except Exception as exc:
        _handle_analysis_service_error(exc)
        raise


@router.get("/{analysis_id}/status", response_model=AnalysisStatusResponse)
async def get_analysis_status(
    analysis_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> AnalysisStatusResponse:
    try:
        analysis = await _analysis_service(db).get(analysis_id, current_user)
    except Exception as exc:
        _handle_analysis_service_error(exc)
        raise

    return AnalysisStatusResponse(
        analysis_id=analysis.id,
        status=analysis.status,
        retry_count=analysis.retry_count,
        failure_reason=analysis.failure_reason,
        next_retry_at=analysis.next_retry_at,
        started_at=analysis.started_at,
        completed_at=analysis.completed_at,
        failed_at=analysis.failed_at,
        updated_at=analysis.updated_at,
    )


@router.get("/{analysis_id}/result", response_model=AnalysisResultResponse)
async def get_analysis_result(
    analysis_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> AnalysisResultResponse:
    try:
        details = await _analysis_service(db).get_result(analysis_id, current_user)
        return await _analysis_result_response(db, details)
    except Exception as exc:
        _handle_analysis_service_error(exc)
        raise


@router.get("/{analysis_id}/pipeline", response_model=AnalysisPipelineResponse)
async def get_analysis_pipeline(
    analysis_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> AnalysisPipelineResponse:
    try:
        return await _analysis_service(db).get_pipeline_status(analysis_id, current_user)
    except Exception as exc:
        _handle_analysis_service_error(exc)
        raise


@router.post("/{analysis_id}/match/{job_id}", response_model=AnalysisMatchResponse)
async def match_analysis_to_job(
    analysis_id: UUID,
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AnalysisMatchResponse:
    try:
        match = await _analysis_service(db).match_to_job(analysis_id, job_id, current_user)
        await db.commit()
        return match
    except Exception as exc:
        await db.rollback()
        _handle_analysis_service_error(exc)
        raise
