from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pipeline_service import (
    PipelineCandidateNotFoundError,
    PipelineConcurrentModificationError,
    PipelineEntryNotFoundError,
    PipelineInvalidTransitionError,
    PipelineJobNotFoundError,
    PipelineSameStageError,
    PipelineService,
    PipelineTerminalStageError,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.pipeline_schemas import (
    CandidatePipelineHistoryResponse,
    MoveCandidateByJobBody,
    MoveCandidateRequest,
    MoveCandidateResponse,
    PipelineBoardResponse,
    PipelineJobSummaryResponse,
)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def _service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db))


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
    if isinstance(exc, PipelineSameStageError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já está neste estágio",
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
