from uuid import UUID
from datetime import UTC, datetime

import sqlalchemy as sa
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_limit_override_service import (
    AIDailyLimitExceededError,
    AILimitOverrideService,
)
from src.application.services.analysis_retry_policy import (
    RateLimitCooldown,
    rate_limit_cooldown_for_analysis,
)
from src.core.analysis_observability import record_analysis_audit_event
from src.application.services.analysis_service import (
    AnalysisDiscardBlockedError,
    AnalysisNotCompletedError,
    AnalysisNotFoundError,
    AnalysisResultDetails,
    AnalysisResultNotFoundError,
    AnalysisService,
    JobNotFoundError,
)
from src.application.services.audit_service import AuditService
from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
from src.application.dtos.analysis_dtos import RequestAnalysisCommand
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_resume_repository import SQLAlchemyResumeRepository
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.interface.api.dependencies import (
    AdminOnly,
    AnalysisReadStaff,
    AnalysisWriteStaff,
    RecruiterOrAdmin,
    get_db,
)
from src.interface.api.rate_limiting import rate_limit_analysis_request, rate_limit_analysis_retry
from src.interface.api.schemas.analysis_schemas import (
    AnalysisGlobalItemResponse,
    AnalysisMatchResponse,
    AnalysisPipelineResponse,
    AnalysisRequestResponse,
    AnalysisResponse,
    AnalysisResultResponse,
    DiscardAnalysisRequest,
    AnalysisStatusResponse,
    BulkAnalysisActionRequest,
    BulkAnalysisActionResponse,
)
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.workers.analysis_dispatcher import enqueue_analysis
from src.interface.workers.analysis_dispatcher import ANALYSIS_QUEUE
from src.interface.workers.resume_extraction_dispatcher import enqueue_resume_extraction

router = APIRouter(prefix="/analyses", tags=["analyses"])

logger = structlog.get_logger(__name__)
_FORCE_FAIL_REASON = "Encerrada manualmente pelo usuário"
_STUCK_ANALYSIS_REASONS = {
    "analysis_stuck_pending_timeout",
    "analysis_stuck_processing_timeout",
    "analysis_worker_claim_expired",
}


async def _mark_analysis_enqueue_failed(
    db: AsyncSession,
    analysis_id: UUID,
    *,
    reason: str = "analysis_enqueue_failed",
) -> None:
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    now = datetime.now(UTC)
    analysis = await db.scalar(sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id))
    if analysis is None:
        return
    analysis.status = "failed"
    analysis.failure_reason = reason
    analysis.provider_error_type = "enqueue_failed"
    analysis.failed_at = now
    analysis.next_retry_at = None
    analysis.worker_claim_id = None
    analysis.claimed_at = None
    analysis.stale_at = None
    analysis.updated_at = now
    await db.commit()


async def _enqueue_requested_analysis(db: AsyncSession, analysis_id: UUID) -> None:
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    analysis = await db.scalar(sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id))
    if not analysis:
        logger.warning("analysis.enqueue_skipped_not_found", analysis_id=str(analysis_id))
        return

    now = datetime.now(UTC)
    analysis.task_id = f"analysis:{analysis.id}"
    analysis.queue_name = ANALYSIS_QUEUE
    analysis.failure_reason = None
    analysis.updated_at = now
    await db.commit()

    try:
        enqueue_analysis(analysis_id)
    except Exception as exc:
        await db.rollback()
        logger.error("analysis.enqueue_failed", analysis_id=str(analysis_id), error=str(exc))
        await _mark_analysis_enqueue_failed(db, analysis_id)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "analysis_enqueue_failed",
                "message": "Não foi possível enfileirar a análise. Tente novamente.",
            },
        ) from exc


def _analysis_service(db: AsyncSession) -> AnalysisService:
    return AnalysisService(SQLAlchemyAnalysisRepository(db), audit_service=AuditService(db))


_WAITING_EXTRACTION_DETAIL = {
    "code": "analysis_waiting_extraction",
    "message": (
        "A extração do currículo ainda não foi concluída. "
        "Reprocesse a extração ou aguarde."
    ),
    "retry_target": "extraction",
}


def _analysis_cooldown(analysis) -> RateLimitCooldown:
    """Rate-limit/quota cooldown covering both retry_scheduled and failed states."""
    return rate_limit_cooldown_for_analysis(analysis)


def _is_rate_limited_analysis_blocked(analysis) -> bool:
    """Backward-compatible boolean wrapper over the cooldown policy."""
    return _analysis_cooldown(analysis).blocked


def _rate_limited_detail(cooldown: RateLimitCooldown) -> dict:
    return {
        "code": "ai_provider_rate_limited",
        "message": (
            "Limite de uso do provedor IA atingido. "
            "Aguarde o fim da janela de cooldown antes de tentar novamente."
        ),
        "retry_after_seconds": cooldown.retry_after_seconds,
        "blocked_until": (
            cooldown.blocked_until.isoformat() if cooldown.blocked_until else None
        ),
    }


async def _retrigger_resume_extraction(db: AsyncSession, analysis) -> None:
    """Best-effort re-enqueue of resume extraction for a waiting_extraction analysis.

    Never raises: a broker hiccup here must not turn a controlled 409 into a 500.
    The extraction task self-guards (it only claims pending/failed versions), so
    a duplicate enqueue is a no-op when extraction is already running/completed.
    """
    try:
        enqueue_resume_extraction(analysis.resume_version_id)
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning(
            "analysis.retry_extraction_reenqueue_failed",
            analysis_id=str(analysis.id),
            resume_version_id=str(analysis.resume_version_id),
            error=str(exc),
        )


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
        discarded_at=analysis.discarded_at,
        discarded_by=analysis.discarded_by,
        discard_reason=analysis.discard_reason,
        discard_reason_note=analysis.discard_reason_note,
        created_at=analysis.created_at,
        updated_at=analysis.updated_at,
    )


def _handle_analysis_service_error(exc: Exception) -> None:
    if isinstance(exc, ValidationException):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    if isinstance(exc, NotFoundException):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
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
    if isinstance(exc, AnalysisDiscardBlockedError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
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
    current_user: RecruiterOrAdmin,
    job_id: UUID | None = Query(default=None),
    force: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_analysis_request),
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
            AILimitOverrideService(db),
        )
        result = await use_case.execute(
            RequestAnalysisCommand(
                resume_version_id=resume_version_id,
                requested_by=current_user.id,
                job_id=job_id,
                force_reanalyze=force,
                priority=5,
            )
        )

        if result.created:
            candidate_id = await db.scalar(
                sa.select(ResumeModel.candidate_id)
                .join(ResumeVersionModel, ResumeVersionModel.resume_id == ResumeModel.id)
                .where(ResumeVersionModel.id == resume_version_id)
            )
            if candidate_id is not None:
                await SQLAlchemyPipelineRepository(db).attach_analysis_to_entry(
                    candidate_id=candidate_id,
                    job_id=job_id,
                    resume_version_id=resume_version_id,
                    analysis_id=result.analysis_id,
                    updated_at=datetime.now(UTC),
                )

        if result.enqueue_required and str(result.status) == "pending":
            await _enqueue_requested_analysis(db, result.analysis_id)
        else:
            await db.commit()
        return AnalysisRequestResponse(
            analysis_id=result.analysis_id,
            status=result.status,
            created=result.created,
            blocked=result.blocked,
            reused=result.reused,
            stuck=result.stuck,
            reason=result.reason,
        )
    except AIDailyLimitExceededError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "ai_daily_limit_exceeded",
                "message": "Limite diário de análises atingido.",
                "scope": exc.scope,
                "limit": exc.limit,
                "used": exc.used,
                "reset_at": exc.reset_at.isoformat(),
            },
        )
    except Exception as exc:
        await db.rollback()
        _handle_analysis_service_error(exc)
        raise


@router.get("", response_model=PaginatedResponse[AnalysisResponse])
async def list_analyses(
    current_user: AnalysisReadStaff,
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
    current_user: AnalysisReadStaff,
    db: AsyncSession = Depends(get_db),
) -> AnalysisResponse:
    try:
        analysis = await _analysis_service(db).get(analysis_id, current_user)
        return await _analysis_response(db, analysis)
    except Exception as exc:
        _handle_analysis_service_error(exc)
        raise


@router.patch("/{analysis_id}/discard", response_model=AnalysisResponse)
async def discard_analysis(
    analysis_id: UUID,
    body: DiscardAnalysisRequest,
    current_user: AnalysisWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> AnalysisResponse:
    try:
        analysis = await _analysis_service(db).discard(
            analysis_id,
            current_user=current_user,
            reason=body.reason,
            note=body.note,
        )
        await db.commit()
        return await _analysis_response(db, analysis)
    except Exception as exc:
        await db.rollback()
        _handle_analysis_service_error(exc)
        raise


@router.get("/{analysis_id}/status", response_model=AnalysisStatusResponse)
async def get_analysis_status(
    analysis_id: UUID,
    current_user: AnalysisReadStaff,
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
        stuck=analysis.failure_reason in _STUCK_ANALYSIS_REASONS,
        reason=analysis.failure_reason if analysis.failure_reason in _STUCK_ANALYSIS_REASONS else None,
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
    current_user: AnalysisReadStaff,
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
    current_user: AnalysisReadStaff,
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
    current_user: AnalysisWriteStaff,
    force: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> AnalysisMatchResponse:
    try:
        service = _analysis_service(db)
        if force:
            match = await service.match_completed_analysis_to_job(
                analysis_id,
                job_id,
                force_recompute=True,
            )
        else:
            match = await service.match_to_job(analysis_id, job_id, current_user)
        await db.commit()
        return match
    except Exception as exc:
        await db.rollback()
        _handle_analysis_service_error(exc)
        raise


@router.post("/stuck", status_code=status.HTTP_200_OK)
async def detect_and_mark_stuck_analyses(
    current_user: AdminOnly,
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
    current_user: AnalysisWriteStaff,
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
    TERMINAL = {"completed", "failed", "cancelled", "discarded"}

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
    current_user: AnalysisWriteStaff,
    db: AsyncSession = Depends(get_db),
) -> BulkAnalysisActionResponse:
    """Retry multiple failed analyses.

    Only re-queues analyses in status 'failed'. Analyses in 'waiting_extraction'
    are skipped (they await extraction, not AI). Analyses that failed by provider
    rate-limit/quota inside the cooldown window are blocked (no attempt reset).
    """
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    now = datetime.now(UTC)
    queued_count = 0
    skipped_count = 0
    blocked_count = 0
    skipped_reasons: dict[str, int] = {}
    to_enqueue = []
    extraction_to_retrigger: list = []

    def _record_skip(reason: str) -> None:
        nonlocal skipped_count
        skipped_count += 1
        skipped_reasons[reason] = skipped_reasons.get(reason, 0) + 1

    for analysis_id in body.analysis_ids:
        analysis = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if not analysis:
            _record_skip("not_found")
            continue

        # waiting_extraction never goes to the AI queue — re-trigger extraction.
        if analysis.status == "waiting_extraction":
            extraction_to_retrigger.append(analysis)
            _record_skip("waiting_extraction")
            continue

        # Rate-limit/quota cooldown blocks re-queue AND attempt reset.
        cooldown = _analysis_cooldown(analysis)
        if cooldown.blocked:
            blocked_count += 1
            skipped_reasons["rate_limited"] = skipped_reasons.get("rate_limited", 0) + 1
            continue

        if analysis.status != "failed":
            _record_skip("not_retryable")
            continue

        analysis.status = "pending"
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.started_at = None
        analysis.retry_count = 0
        analysis.attempts = 0
        analysis.next_retry_at = None
        analysis.provider_error_type = None
        analysis.provider_status_code = None
        analysis.worker_claim_id = None
        analysis.claimed_at = None
        analysis.stale_at = None
        analysis.updated_at = now
        to_enqueue.append(analysis.id)
        queued_count += 1

    if queued_count > 0 or extraction_to_retrigger:
        await db.commit()
        for aid in to_enqueue:
            analysis = await db.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == aid)
            )
            if not analysis:
                logger.warning("analysis.enqueue_skipped_not_found", analysis_id=str(aid))
            else:
                enqueue_analysis(aid)
        for analysis in extraction_to_retrigger:
            await _retrigger_resume_extraction(db, analysis)

    skipped_total = skipped_count + blocked_count
    logger.info(
        "analysis.bulk_retried",
        user_id=str(current_user.id),
        queued_count=queued_count,
        skipped_count=skipped_count,
        blocked_count=blocked_count,
        skipped_reasons=skipped_reasons,
    )
    if skipped_total > 0:
        logger.info(
            "analysis.bulk_retry_skipped",
            user_id=str(current_user.id),
            skipped_count=skipped_count,
            blocked_count=blocked_count,
            skipped_reasons=skipped_reasons,
        )
    return BulkAnalysisActionResponse(
        processed=queued_count,
        skipped=skipped_total,
        queued_count=queued_count,
        skipped_count=skipped_count,
        blocked_count=blocked_count,
        skipped_reasons=skipped_reasons,
    )


@router.post("/{analysis_id}/retry", response_model=AnalysisRequestResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_analysis(
    analysis_id: UUID,
    current_user: AnalysisWriteStaff,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_analysis_retry),
) -> AnalysisRequestResponse:
    """Reprocess a failed or stuck analysis.

    Can only retry analyses with status 'failed', 'cancelled', or 'waiting_extraction'.
    """
    try:
        from src.infrastructure.database.models.analysis_model import AnalysisModel
        from src.interface.workers.analysis_dispatcher import enqueue_analysis

        analysis = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )

        if not analysis:
            raise AnalysisNotFoundError

        # waiting_extraction is an EXTRACTION state, not an AI-analysis state.
        # Never push it to the AI queue (the worker would only bounce it back to
        # waiting_extraction). Re-trigger extraction and return a controlled 409.
        if analysis.status == "waiting_extraction":
            await _retrigger_resume_extraction(db, analysis)
            await record_analysis_audit_event(
                db,
                action="analysis_retry_blocked_waiting_extraction",
                resource_id=analysis.id,
                user_id=current_user.id,
                metadata={
                    "status": analysis.status,
                    "resume_version_id": str(analysis.resume_version_id),
                    "retry_target": "extraction",
                },
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_WAITING_EXTRACTION_DETAIL,
            )

        # Provider rate-limit/quota cooldown — covers BOTH retry_scheduled and
        # failed. A failure by quota must not be retried (and have its attempt
        # budget reset) before the cooldown window elapses.
        cooldown = _analysis_cooldown(analysis)
        if cooldown.blocked:
            await record_analysis_audit_event(
                db,
                action="analysis_retry_blocked_rate_limit",
                resource_id=analysis.id,
                user_id=current_user.id,
                metadata={
                    "status": analysis.status,
                    "provider_error_type": analysis.provider_error_type,
                    "provider_status_code": analysis.provider_status_code,
                    "retry_after_seconds": cooldown.retry_after_seconds,
                    "blocked_until": (
                        cooldown.blocked_until.isoformat()
                        if cooldown.blocked_until
                        else None
                    ),
                },
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=_rate_limited_detail(cooldown),
            )

        if analysis.status not in {"failed", "cancelled"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot retry analysis in status '{analysis.status}'. Only 'failed' or 'cancelled' analyses can be retried.",
            )

        # Reset to pending and requeue. Clear any stale claim so a previously
        # crashed worker's claim cannot block the fresh dispatch.
        now = datetime.now(UTC)
        analysis.status = "pending"
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.started_at = None
        analysis.retry_count = 0
        analysis.attempts = 0
        analysis.next_retry_at = None
        analysis.provider_error_type = None
        analysis.provider_status_code = None
        analysis.worker_claim_id = None
        analysis.claimed_at = None
        analysis.stale_at = None
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

        return AnalysisRequestResponse(
            analysis_id=analysis.id,
            status=analysis.status,
            created=False,
            blocked=False,
            reused=False,
            stuck=False,
            reason="analysis_retry_started",
        )
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
    current_user: AnalysisWriteStaff,
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
