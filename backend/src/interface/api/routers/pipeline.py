from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
import sqlalchemy as sa
import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pipeline_service import (
    PipelineCandidateAlreadyActiveInAnotherJobError,
    PipelineCandidateAlreadyActiveInSameJobError,
    PipelineDestinationJobUnavailableError,
    PipelineCandidateNotFoundError,
    PipelineCandidateWithoutActiveJobError,
    PipelineConcurrentModificationError,
    PipelineDuplicateEntryError,
    PipelineEntryNotFoundError,
    PipelineInvalidTransitionError,
    PipelineJobNotFoundError,
    PipelineSameStageError,
    PipelineService,
    PipelineTerminalStageError,
    PipelineTransferNotAllowedError,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.pipeline_schemas import (
    AddCandidateToJobRequest,
    AddCandidateToJobResponse,
    CandidatePipelineHistoryResponse,
    MoveCandidateByJobBody,
    MoveCandidateRequest,
    MoveCandidateResponse,
    PipelineBoardResponse,
    PipelineJobSummaryResponse,
    TransferCandidateJobRequest,
    TransferCandidateJobResponse,
)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])
logger = structlog.get_logger(__name__)

_ANALYSIS_QUEUE = "analysis"


def _service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db), db)


async def _enqueue_latest_pending_analysis_for_candidate_job(
    db: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
) -> None:
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
    from src.interface.workers.analysis_tasks import process_analysis

    query = (
        sa.select(AnalysisModel)
        .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            AnalysisModel.job_id == job_id,
            AnalysisModel.status == "pending",
            AnalysisModel.task_id.is_(None),
        )
        .order_by(AnalysisModel.created_at.desc())
        .limit(1)
    )
    latest_analysis = await db.scalar(query)

    if latest_analysis is None:
        return

    analysis_id = latest_analysis.id
    queue_name = _ANALYSIS_QUEUE
    task_id = f"analysis:{analysis_id}"

    logger.info(
        "analysis_pending_created",
        analysis_id=str(analysis_id),
        candidate_id=str(candidate_id),
        job_id=str(job_id),
        queue_name=latest_analysis.queue_name,
        status=latest_analysis.status,
    )

    try:
        logger.info(
            "analysis_enqueue_requested",
            analysis_id=str(analysis_id),
            candidate_id=str(candidate_id),
            job_id=str(job_id),
            queue_name=queue_name,
            task_id=task_id,
        )
        async_result = process_analysis.apply_async(
            args=[str(analysis_id)],
            queue=queue_name,
            priority=latest_analysis.priority,
            task_id=task_id,
        )
        persisted_task_id = str(async_result.id or task_id)
        latest_analysis.task_id = persisted_task_id
        latest_analysis.queue_name = queue_name
        latest_analysis.updated_at = datetime.now(UTC)
        latest_analysis.failure_reason = None
        await db.commit()
        logger.info(
            "analysis_enqueue_succeeded",
            analysis_id=str(analysis_id),
            candidate_id=str(candidate_id),
            job_id=str(job_id),
            queue_name=queue_name,
            task_id=persisted_task_id,
        )
    except Exception as exc:
        await db.rollback()
        try:
            await db.execute(
                sa.update(AnalysisModel)
                .where(AnalysisModel.id == analysis_id)
                .values(
                    failure_reason=f"enqueue_failed: {exc}",
                    updated_at=datetime.now(UTC),
                )
            )
            await db.commit()
        except Exception:
            await db.rollback()
        logger.error(
            "analysis_enqueue_failed",
            analysis_id=str(analysis_id),
            candidate_id=str(candidate_id),
            job_id=str(job_id),
            queue_name=queue_name,
            error=str(exc),
        )


def _handle(exc: Exception) -> None:
    if isinstance(exc, PipelineJobNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vaga não encontrada",
        )
    if isinstance(exc, PipelineCandidateNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    if isinstance(exc, PipelineEntryNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não está no pipeline desta vaga",
        )
    if isinstance(exc, PipelineTerminalStageError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato está em um estágio terminal e não pode ser movido",
        )
    if isinstance(exc, PipelineTransferNotAllowedError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este candidato já avançou no processo. Para preservar o histórico, adicione-o a outra vaga em vez de transferir.",
        )
    if isinstance(exc, PipelineCandidateAlreadyActiveInAnotherJobError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já possui vínculo ativo com outra vaga. Use transferência para mover o candidato.",
        )
    if isinstance(exc, PipelineCandidateAlreadyActiveInSameJobError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já está ativo nesta vaga.",
        )
    if isinstance(exc, PipelineCandidateWithoutActiveJobError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato não possui vaga ativa. Use adicionar a uma vaga.",
        )
    if isinstance(exc, PipelineSameStageError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já está neste estágio",
        )
    if isinstance(exc, PipelineDuplicateEntryError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já está vinculado à vaga destino",
        )
    if isinstance(exc, PipelineDestinationJobUnavailableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vaga destino precisa estar ativa/publicada",
        )
    if isinstance(exc, PipelineInvalidTransitionError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    if isinstance(exc, PipelineConcurrentModificationError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
    if isinstance(exc, IntegrityError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não foi possível concluir a operação porque o vínculo já existe ou foi alterado. Recarregue e tente novamente.",
        )
    raise exc


# ---------------------------------------------------------------------------
# GET /pipeline/jobs — list active jobs with pipeline stats
# Must be declared before /{job_id} to avoid route shadowing.
# ---------------------------------------------------------------------------


@router.get("/jobs", response_model=list[PipelineJobSummaryResponse])
async def list_pipeline_jobs(
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[PipelineJobSummaryResponse]:
    return await _service(db).list_pipeline_jobs()


# ---------------------------------------------------------------------------
# GET /pipeline/{job_id} — kanban board for a specific job (existing)
# ---------------------------------------------------------------------------


@router.get("/{job_id}", response_model=PipelineBoardResponse)
async def get_pipeline_board(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PipelineBoardResponse:
    try:
        return await _service(db).get_board(job_id)
    except Exception as exc:
        _handle(exc)
        raise


# ---------------------------------------------------------------------------
# GET /pipeline/{job_id}/{candidate_id}/history — full stage history
# ---------------------------------------------------------------------------


@router.get(
    "/{job_id}/{candidate_id}/history",
    response_model=CandidatePipelineHistoryResponse,
)
async def get_candidate_pipeline_history(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidatePipelineHistoryResponse:
    try:
        return await _service(db).get_candidate_history(candidate_id, job_id)
    except Exception as exc:
        _handle(exc)
        raise


# ---------------------------------------------------------------------------
# PATCH /pipeline/{job_id}/{candidate_id}/stage — unambiguous move (new)
# job_id in the path removes ambiguity for candidates in multiple jobs.
# ---------------------------------------------------------------------------


@router.patch(
    "/{job_id}/{candidate_id}/stage",
    response_model=MoveCandidateResponse,
)
async def move_candidate_stage_v2(
    job_id: UUID,
    candidate_id: UUID,
    body: MoveCandidateByJobBody,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> MoveCandidateResponse:
    try:
        request = MoveCandidateRequest(job_id=job_id, stage=body.stage, notes=body.notes, reason=body.reason)
        result = await _service(db).move_candidate(
            candidate_id=candidate_id,
            body=request,
            moved_by=current_user.id,
        )
        await db.commit()
        return result
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise


# ---------------------------------------------------------------------------
# PATCH /pipeline/{candidate_id}/stage — move candidate (legacy, kept for compat)
# ---------------------------------------------------------------------------


@router.patch(
    "/{candidate_id}/stage",
    response_model=MoveCandidateResponse,
)
async def move_candidate_stage(
    candidate_id: UUID,
    body: MoveCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> MoveCandidateResponse:
    try:
        result = await _service(db).move_candidate(
            candidate_id=candidate_id,
            body=body,
            moved_by=current_user.id,
        )
        await db.commit()
        return result
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise


@router.post(
    "/{candidate_id}/add-to-job",
    response_model=AddCandidateToJobResponse,
)
async def add_candidate_to_job(
    candidate_id: UUID,
    body: AddCandidateToJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AddCandidateToJobResponse:
    try:
        result = await _service(db).add_candidate_to_job(
            candidate_id=candidate_id,
            body=body,
            moved_by=current_user.id,
        )
        await db.commit()
        await _enqueue_latest_pending_analysis_for_candidate_job(
            db,
            candidate_id=candidate_id,
            job_id=body.job_id,
        )

        return result
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise


@router.patch(
    "/{candidate_id}/transfer-job",
    response_model=TransferCandidateJobResponse,
)
async def transfer_candidate_job(
    candidate_id: UUID,
    body: TransferCandidateJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> TransferCandidateJobResponse:
    try:
        result = await _service(db).transfer_candidate_job(
            candidate_id=candidate_id,
            body=body,
            moved_by=current_user.id,
        )
        await db.commit()
        await _enqueue_latest_pending_analysis_for_candidate_job(
            db,
            candidate_id=candidate_id,
            job_id=body.to_job_id,
        )
        return result
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise
