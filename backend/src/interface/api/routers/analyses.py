from uuid import UUID
from datetime import UTC, datetime

import sqlalchemy as sa
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import (
    AnalysisNotCompletedError,
    AnalysisNotFoundError,
    AnalysisResultDetails,
    AnalysisResultNotFoundError,
    AnalysisService,
    JobNotFoundError,
)
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.domain.exceptions import ValidationException
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.interface.api.dependencies import CurrentUser, InternalUser, RecruiterOrAdmin, get_db
from src.interface.api.schemas.analysis_schemas import (
    AnalysisGlobalItemResponse,
    AnalysisMatchResponse,
    AnalysisPipelineResponse,
    AnalysisRequestResponse,
    AnalysisResponse,
    AnalysisResultResponse,
    AnalysisStatusResponse,
    BulkAnalysisActionRequest,
    BulkAnalysisActionResponse,
)
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.workers.analysis_dispatcher import enqueue_analysis

router = APIRouter(prefix="/analyses", tags=["analyses"])

logger = structlog.get_logger(__name__)
_FORCE_FAIL_REASON = "Encerrada manualmente pelo usuário"


def _analysis_service(db: AsyncSession) -> AnalysisService:
    return AnalysisService(SQLAlchemyAnalysisRepository(db))


def _is_rate_limited_analysis_blocked(analysis) -> bool:
    if analysis.next_retry_at is None:
        return False
    if "status_code=429" not in (analysis.failure_reason or ""):
        return False
    return analysis.next_retry_at > datetime.now(UTC)


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
    if isinstance(exc, ValidationException):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    if isinstance(exc, AnalysisNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise não encontrada")
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
        finish_reason=result.finish_reason,
        max_tokens_used=result.max_tokens_used,
        system_prompt_chars=result.system_prompt_chars,
        user_prompt_chars=result.user_prompt_chars,
        prompt_chars_total=result.prompt_chars_total,
        created_at=result.created_at,
    )


@router.post("", response_model=AnalysisRequestResponse, status_code=status.HTTP_202_ACCEPTED)
async def request_analysis(
    resume_version_id: UUID,
    current_user: CurrentUser,
    job_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> AnalysisRequestResponse:
    if job_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="job_id é obrigatório para solicitar análise",
        )
    try:
        use_case = RequestAnalysisUseCase(
            SQLAlchemyAnalysisRepository(db),
            SQLAlchemyResumeRepository(db),
        )
        result = await use_case.execute(
            RequestAnalysisCommand(
                resume_version_id=resume_version_id,
                requested_by=current_user.id,
                job_id=job_id,
                force_reanalyze=False,
                priority=5,
            )
        )
        await db.commit()
        if result.enqueue_required and str(result.status) == "pending":
            from src.infrastructure.database.models.analysis_model import AnalysisModel
            analysis = await db.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == result.analysis_id)
            )
            if not analysis:
                logger.warning("analysis.enqueue_skipped_not_found", analysis_id=str(result.analysis_id))
            else:
                enqueue_analysis(result.analysis_id)
        return AnalysisRequestResponse(analysis_id=result.analysis_id, status=result.status)
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


@router.post("/stuck", status_code=status.HTTP_200_OK)
async def detect_and_mark_stuck_analyses(
    current_user: InternalUser,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Detect analyses stuck in processing/pending and mark them as failed.

    This is a housekeeping endpoint to clean up zombie tasks.
    - Analyses in 'processing' for 30+ minutes are marked failed
    - Analyses in 'pending' for 2+ hours are marked failed
    """
    try:
        from src.infrastructure.database.connection import create_celery_async_sessionmaker
        from src.interface.workers.analysis_tasks import mark_stuck_analyses_as_failed

        celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()
        try:
            count = await mark_stuck_analyses_as_failed(
                sessionmaker=celery_sessionmaker,
            )
        finally:
            await celery_engine.dispose()
        return {"success": True, "analyses_marked_failed": count}
    except Exception as exc:
        _handle_analysis_service_error(exc)
        raise


@router.post("/bulk-force-fail", response_model=BulkAnalysisActionResponse)
async def bulk_force_fail_analyses(
    body: BulkAnalysisActionRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BulkAnalysisActionResponse:
    """Force-fail multiple analyses immediately.

    Skips analyses that are already in terminal state (completed, failed, cancelled).
    """
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    processed = 0
    skipped = 0
    TERMINAL = {"completed", "failed", "cancelled"}

    for analysis_id in body.analysis_ids:
        analysis = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if not analysis or analysis.status in TERMINAL:
            skipped += 1
            continue

        analysis.status = "failed"
        analysis.failure_reason = _FORCE_FAIL_REASON
        analysis.failed_at = now
        analysis.updated_at = now
        processed += 1

    if processed > 0:
        await db.commit()

    logger.info(
        "analysis.bulk_force_failed",
        user_id=str(current_user.id),
        processed=processed,
        skipped=skipped,
    )
    return BulkAnalysisActionResponse(processed=processed, skipped=skipped)


@router.post("/bulk-retry", response_model=BulkAnalysisActionResponse)
async def bulk_retry_analyses(
    body: BulkAnalysisActionRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BulkAnalysisActionResponse:
    """Retry multiple failed analyses.

    Only processes analyses with status 'failed'.
    """
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    now = datetime.now(UTC)
    processed = 0
    skipped = 0
    to_enqueue = []

    for analysis_id in body.analysis_ids:
        analysis = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if not analysis or analysis.status != "failed":
            skipped += 1
            continue
        if _is_rate_limited_analysis_blocked(analysis):
            skipped += 1
            continue

        analysis.status = "pending"
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.started_at = None
        analysis.retry_count = 0
        analysis.next_retry_at = None
        analysis.updated_at = now
        to_enqueue.append(analysis.id)
        processed += 1

    if processed > 0:
        await db.commit()
        from src.infrastructure.database.models.analysis_model import AnalysisModel
        for aid in to_enqueue:
            analysis = await db.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == aid)
            )
            if not analysis:
                logger.warning("analysis.enqueue_skipped_not_found", analysis_id=str(aid))
            else:
                enqueue_analysis(aid)

    logger.info(
        "analysis.bulk_retried",
        user_id=str(current_user.id),
        processed=processed,
        skipped=skipped,
    )
    return BulkAnalysisActionResponse(processed=processed, skipped=skipped)


@router.post("/{analysis_id}/retry", response_model=AnalysisRequestResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_analysis(
    analysis_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AnalysisRequestResponse:
    """Reprocess a failed or stuck analysis.

    Can only retry analyses with status 'failed' or 'cancelled'.
    """
    try:
        from src.infrastructure.database.models.analysis_model import AnalysisModel
        from src.interface.workers.analysis_dispatcher import enqueue_analysis

        analysis = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )

        if not analysis:
            raise AnalysisNotFoundError

        if analysis.status not in {"failed", "cancelled"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot retry analysis in status '{analysis.status}'. Only 'failed' or 'cancelled' analyses can be retried.",
            )

        if _is_rate_limited_analysis_blocked(analysis):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe bloqueio temporário por limite da IA. Aguarde até o fim da janela de retry.",
            )

        # Reset to pending and requeue
        now = datetime.now(UTC)
        analysis.status = "pending"
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.started_at = None
        analysis.retry_count = 0
        analysis.next_retry_at = None
        analysis.updated_at = now

        await db.commit()
        await db.refresh(analysis)

        refetched = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis.id)
        )
        if not refetched:
            logger.warning("analysis.enqueue_skipped_not_found", analysis_id=str(analysis.id))
        else:
            enqueue_analysis(refetched.id)

        logger.info(
            "analysis.retried",
            user_id=str(current_user.id),
            analysis_id=str(analysis_id),
        )

        return AnalysisRequestResponse(analysis_id=analysis.id, status=analysis.status)
    except AnalysisNotFoundError as exc:
        _handle_analysis_service_error(exc)
        raise
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        _handle_analysis_service_error(exc)
        raise


@router.post("/{analysis_id}/force-fail", status_code=status.HTTP_200_OK)
async def force_fail_analysis(
    analysis_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Force-fail an analysis immediately.

    Cannot force-fail analyses that are already in terminal state (completed, failed, cancelled).
    """
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    from datetime import UTC, datetime

    analysis = await db.scalar(
        sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
    )

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Análise não encontrada.",
        )

    if analysis.status in {"completed", "failed", "cancelled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Não é possível encerrar análise com status '{analysis.status}'.",
        )

    now = datetime.now(UTC)
    analysis.status = "failed"
    analysis.failure_reason = _FORCE_FAIL_REASON
    analysis.failed_at = now
    analysis.updated_at = now
    await db.commit()

    logger.info(
        "analysis.force_failed",
        user_id=str(current_user.id),
        analysis_id=str(analysis_id),
        reason=_FORCE_FAIL_REASON,
    )
    return {"status": "failed"}
