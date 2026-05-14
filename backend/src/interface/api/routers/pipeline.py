from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_dispatch_service import CandidateJobAnalysisDispatcher
from src.application.services.pipeline_service import (
    PipelineCandidateAlreadyActiveInAnotherJobError,
    PipelineCandidateAlreadyActiveInSameJobError,
    PipelineCandidateAlreadyHiredError,
    PipelineCandidateReconsiderationNotAllowedError,
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
    PipelineTransferBlockedAdvancedStageError,
    PipelineTransferNotAllowedError,
)
from src.application.services.interview_schedule_service import (
    InterviewScheduleConflictError,
    InterviewScheduleService,
    InterviewScheduleValidationError,
)
from src.infrastructure.repositories.sqlalchemy_interview_schedule_repository import (
    SQLAlchemyInterviewScheduleRepository,
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
    PipelineAnalysisDecisionResponse,
    PipelineBoardResponse,
    PipelineJobSummaryResponse,
    ReconsiderCandidateRequest,
    ReconsiderCandidateResponse,
    SchedulePipelineInterviewRequest,
    TransferCandidateJobRequest,
    TransferCandidateJobResponse,
)
from src.interface.api.schemas.interview_schedule_schemas import InterviewScheduleResponse

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def _service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db), db)


def _analysis_response(decision) -> PipelineAnalysisDecisionResponse:
    return PipelineAnalysisDecisionResponse.model_validate(decision.as_dict())


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
            detail="A transferência só pode ser feita para vagas publicadas.",
        )
    if isinstance(exc, PipelineTransferBlockedAdvancedStageError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já avançou no processo. Reprove ou encerre o vínculo atual antes de transferir.",
        )
    if isinstance(exc, PipelineCandidateAlreadyHiredError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato já está contratado nesta vaga e não pode ser transferido.",
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
    if isinstance(exc, PipelineCandidateReconsiderationNotAllowedError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só é possível reconsiderar candidaturas encerradas para esta vaga.",
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
    include_closed: bool = False,
    db: AsyncSession = Depends(get_db),
) -> list[PipelineJobSummaryResponse]:
    return await _service(db).list_pipeline_jobs(include_closed=include_closed)


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
        analysis_decision = await CandidateJobAnalysisDispatcher(db).request_auto_analysis(
            candidate_id=candidate_id,
            job_id=job_id,
            requested_by=current_user.id,
        )
        return result.model_copy(update={"analysis": _analysis_response(analysis_decision)})
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise


@router.post(
    "/{job_id}/{candidate_id}/interviews",
    response_model=InterviewScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def schedule_pipeline_interview(
    job_id: UUID,
    candidate_id: UUID,
    body: SchedulePipelineInterviewRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> InterviewScheduleResponse:
    try:
        pipeline_repository = SQLAlchemyPipelineRepository(db)
        entry = await pipeline_repository.find_active_entry(candidate_id, job_id)
        if entry is None:
            raise PipelineEntryNotFoundError

        if entry.pipeline_stage not in {"hr_interview", "technical_interview", "final", "offer"}:
            await PipelineService(pipeline_repository, db).move_candidate(
                candidate_id=candidate_id,
                body=MoveCandidateRequest(
                    job_id=job_id,
                    stage="hr_interview",
                    notes="Entrevista agendada pela agenda.",
                    reason=None,
                ),
                moved_by=current_user.id,
            )

        interview_service = InterviewScheduleService(SQLAlchemyInterviewScheduleRepository(db))
        title = body.title or "Entrevista com candidato"
        schedule = await interview_service.create_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=entry.candidate_job_pipeline_id,
            title=title,
            description=body.internal_notes,
            public_notes=body.public_notes,
            internal_notes=body.internal_notes,
            scheduled_start=body.scheduled_start,
            scheduled_end=body.scheduled_end,
            timezone=body.timezone,
            interview_type=body.interview_type,
            interview_format=body.interview_format,
            status="scheduled",
            location=body.location,
            meeting_url=body.meeting_url,
            interviewer_name=None,
            interviewer_email=None,
        )
        details = await interview_service.get_interview_details(schedule.id)
        await db.commit()
        return InterviewScheduleResponse(**details)
    except (InterviewScheduleConflictError, PipelineSameStageError) as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except InterviewScheduleValidationError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
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
        analysis_decision = await CandidateJobAnalysisDispatcher(db).request_auto_analysis(
            candidate_id=candidate_id,
            job_id=body.job_id,
            requested_by=current_user.id,
        )
        return result.model_copy(update={"analysis": _analysis_response(analysis_decision)})
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
        analysis_decision = await CandidateJobAnalysisDispatcher(db).request_auto_analysis(
            candidate_id=candidate_id,
            job_id=body.to_job_id,
            requested_by=current_user.id,
        )
        return result.model_copy(update={"analysis": _analysis_response(analysis_decision)})
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise


@router.post(
    "/{candidate_id}/reconsider-job",
    response_model=ReconsiderCandidateResponse,
)
async def reconsider_candidate_job(
    candidate_id: UUID,
    body: ReconsiderCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ReconsiderCandidateResponse:
    try:
        result = await _service(db).reconsider_candidate(
            candidate_id=candidate_id,
            body=body,
            moved_by=current_user.id,
        )
        await db.commit()
        analysis_decision = await CandidateJobAnalysisDispatcher(db).request_auto_analysis(
            candidate_id=candidate_id,
            job_id=body.job_id,
            requested_by=current_user.id,
        )
        return result.model_copy(update={"analysis": _analysis_response(analysis_decision)})
    except Exception as exc:
        await db.rollback()
        _handle(exc)
        raise
