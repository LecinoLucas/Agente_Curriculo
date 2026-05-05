from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

from src.application.services.job_service import (
    JobSkillConflictError,
    JobSkillLinkNotFoundError,
    InvalidJobTextError,
    InvalidJobSalaryRangeError,
    JobNotFoundError,
    JobPublicationValidationError,
    JobService,
    SkillNotFoundError,
)
from src.application.services.job_bulk_import_service import JobBulkImportService
from src.application.services.job_bulk_payload_normalizer import (
    BulkJobPayloadNormalizationError,
    JobBulkPayloadNormalizer,
)
from src.application.services.job_bulk_update_service import JobBulkUpdateService
from src.application.services.job_score_explanation_service import (
    CandidateNotLinkedToJobError,
    CandidateScoreExplanationNotReadyError,
    JobScoreExplanationService,
)
from src.application.services.matching_observability_service import MatchingObservabilityService
from src.application.services.job_quality_validator_service import (
    JobQualityValidatorService,
    JobNotFoundForQualityError,
)
from src.application.services.pipeline_service import (
    PipelineCandidateAlreadyActiveInAnotherJobError,
    PipelineCandidateAlreadyActiveInSameJobError,
    PipelineCandidateWithoutActiveJobError,
    PipelineConcurrentModificationError,
    PipelineDestinationJobUnavailableError,
    PipelineInvalidTransitionError,
    PipelineJobNotFoundError,
    PipelineService,
)
from src.application.services.scoring_comparison_admin_service import (
    ScoringComparisonAnalysisNotFoundError,
    ScoringComparisonCandidateNotFoundError,
    ScoringComparisonJobNotFoundError,
)
from src.domain.entities.user import UserRole
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.application.services.candidate_ranking_service import (
    CandidateRankingService,
    NoActiveScoreVersionError,
    RankingJobNotFoundError,
)
from src.interface.api.dependencies import CurrentUser, InternalUser, RecruiterOrAdmin, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.job_schemas import (
    AddCandidateToJobRequest,
    BulkImportJobsRequest,
    BulkImportJobsResponse,
    BulkUpdateJobsRequest,
    BulkUpdateJobsResponse,
    CandidateScoreExplanationResponse,
    CreateJobRequest,
    JobQualityResponse,
    JobResponse,
    MatchingFeedbackRequest,
    MatchingFeedbackResponse,
    UpdateJobRequest,
)
from src.interface.api.schemas.pipeline_schemas import (
    AddCandidateToJobRequest as PipelineAddCandidateToJobRequest,
    AddCandidateToJobResponse as PipelineAddCandidateToJobResponse,
    JobMatchCandidateResponse,
)
from src.interface.api.schemas.ranking_schemas import JobRankingResponse, ScoringComputeResponse
from src.interface.api.schemas.skill_schemas import AddJobSkillRequest, JobRequiredSkillResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])
_ANALYSIS_QUEUE = "analysis"


def _job_service(db: AsyncSession) -> JobService:
    return JobService(SQLAlchemyJobRepository(db))


def _job_bulk_import_service(db: AsyncSession) -> JobBulkImportService:
    return JobBulkImportService(db)


def _job_bulk_update_service(db: AsyncSession) -> JobBulkUpdateService:
    return JobBulkUpdateService(db)


def _pipeline_service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db), db)


async def _enqueue_latest_pending_analysis_for_candidate_job(
    db: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
    requested_by: UUID,
) -> None:
    from src.application.dtos.analysis_dtos import RequestAnalysisCommand
    from src.application.use_cases.analyses.request_analysis import RequestAnalysisUseCase
    from src.infrastructure.database.models.analysis_model import AnalysisModel
    from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )
    from src.infrastructure.repositories.sqlalchemy_resume_repository import (
        SQLAlchemyResumeRepository,
    )
    from src.interface.workers.analysis_dispatcher import enqueue_analysis

    latest_resume_version = await db.scalar(
        sa.select(ResumeVersionModel.id)
        .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
        .where(
            ResumeModel.candidate_id == candidate_id,
            ResumeModel.deleted_at.is_(None),
        )
        .order_by(ResumeVersionModel.uploaded_at.desc())
        .limit(1)
    )
    if latest_resume_version is None:
        return

    try:
        use_case = RequestAnalysisUseCase(
            SQLAlchemyAnalysisRepository(db),
            SQLAlchemyResumeRepository(db),
        )
        await use_case.execute(
            RequestAnalysisCommand(
                resume_version_id=latest_resume_version,
                requested_by=requested_by,
                job_id=job_id,
                force_reanalyze=False,
                priority=5,
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
        return

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

    if latest_analysis is not None:
        task_id = f"analysis:{latest_analysis.id}"
        latest_analysis.task_id = task_id
        latest_analysis.queue_name = _ANALYSIS_QUEUE
        latest_analysis.updated_at = datetime.now(UTC)
        latest_analysis.failure_reason = None
        await db.commit()

        refetched = await db.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == latest_analysis.id)
        )
        if not refetched:
            logger.warning("analysis.enqueue_skipped_not_found", analysis_id=str(latest_analysis.id))
        else:
            enqueue_analysis(refetched.id)


def _quality_validator_service(db: AsyncSession) -> JobQualityValidatorService:
    return JobQualityValidatorService(SQLAlchemyJobRepository(db))


def _handle_job_service_error(exc: Exception) -> None:
    if isinstance(exc, JobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, InvalidJobSalaryRangeError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Faixa salarial inválida")
    if isinstance(exc, InvalidJobTextError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Título e descrição não podem estar em branco")
    if isinstance(exc, SkillNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill não encontrada")
    if isinstance(exc, JobSkillConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Skill já vinculada a esta vaga")
    if isinstance(exc, JobSkillLinkNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")
    if isinstance(exc, PipelineJobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
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
    if isinstance(exc, PipelineDestinationJobUnavailableError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vaga destino precisa estar ativa/publicada",
        )
    if isinstance(exc, PipelineInvalidTransitionError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if isinstance(exc, PipelineConcurrentModificationError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, RankingJobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, NoActiveScoreVersionError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nenhuma versão de scoring ativa. Configure uma versão ativa antes de calcular.",
        )
    if isinstance(exc, ScoringComparisonJobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, ScoringComparisonCandidateNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidato não encontrado")
    if isinstance(exc, ScoringComparisonAnalysisNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Análise do candidato não encontrada")
    if isinstance(exc, JobNotFoundForQualityError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, JobPublicationValidationError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "job_publication_validation_failed",
                "message": "Vaga não atende os critérios mínimos para publicação.",
                "missing_fields": exc.missing_fields,
                "quality_score": exc.quality_score,
                "quality_status": exc.quality_status,
                "suggestions": exc.suggestions,
                "warnings": exc.warnings,
            },
        )
    if isinstance(exc, CandidateNotLinkedToJobError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Candidato não está vinculado a esta vaga. Adicione o candidato à vaga antes de visualizar o score.")
    if isinstance(exc, CandidateScoreExplanationNotReadyError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A explicação do score ainda não está disponível para esta vaga.",
        )
    raise exc


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: CreateJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        service = _job_service(db)
        job = await service.create(body, current_user.id)
        if job.status == "published":
            await service.ensure_publishable(job.id)
        await db.commit()
        await db.refresh(job)
        return JobResponse.model_validate(job)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.post("/bulk-import", response_model=BulkImportJobsResponse, status_code=status.HTTP_201_CREATED)
async def bulk_import_jobs(
    current_user: RecruiterOrAdmin,
    body: Any = Body(...),
    db: AsyncSession = Depends(get_db),
) -> BulkImportJobsResponse:
    try:
        import json
        print(f"RAW BULK IMPORT BODY: {json.dumps(body if isinstance(body, dict) else str(body), indent=2)}")
        normalized_body = JobBulkPayloadNormalizer.normalize_import_request(body)
        result = await _job_bulk_import_service(db).import_jobs(normalized_body, current_user.id)
        if normalized_body.options.dry_run:
            await db.rollback()
        else:
            await db.commit()
        return result
    except BulkJobPayloadNormalizationError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        await db.rollback()
        raise


@router.patch("/bulk-update", response_model=BulkUpdateJobsResponse)
async def bulk_update_jobs(
    current_user: RecruiterOrAdmin,
    body: Any = Body(...),
    db: AsyncSession = Depends(get_db),
) -> BulkUpdateJobsResponse:
    try:
        normalized_body = JobBulkPayloadNormalizer.normalize_update_request(body)
        result = await _job_bulk_update_service(db).update_jobs(normalized_body)
        await db.commit()
        return result
    except BulkJobPayloadNormalizationError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception:
        await db.rollback()
        raise


@router.get("", response_model=PaginatedResponse[JobResponse])
async def list_jobs(
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[JobResponse]:
    jobs, total_items = await _job_service(db).list(page, page_size)

    return PaginatedResponse[JobResponse](
        data=[JobResponse.model_validate(job) for job in jobs],
        total=total_items,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_items + page_size - 1) // page_size),
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        return JobResponse.model_validate(await _job_service(db).get(job_id))
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/quality", response_model=JobQualityResponse)
async def get_job_quality(
    job_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> JobQualityResponse:
    try:
        result = await _quality_validator_service(db).validate(job_id)
        return JobQualityResponse(
            job_id=job_id,
            quality_score=result.quality_score,
            status=result.status,
            can_publish=result.can_publish,
            publication_blockers=result.publication_blockers,
            missing_fields=result.missing_fields,
            suggestions=result.suggestions,
            warnings=result.warnings,
        )
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: UUID,
    body: UpdateJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        service = _job_service(db)
        job = await service.update(job_id, body)
        if job.status == "published":
            await service.ensure_publishable(job.id)
        await db.commit()
        await db.refresh(job)
        return JobResponse.model_validate(job)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.patch("/{job_id}/publish", response_model=JobResponse)
async def publish_job(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        return await _transition_job_status(job_id, "published", db)
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.patch("/{job_id}/pause", response_model=JobResponse)
async def pause_job(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    return await _transition_job_status(job_id, "paused", db)


@router.patch("/{job_id}/close", response_model=JobResponse)
async def close_job(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    return await _transition_job_status(job_id, "closed", db)


@router.patch("/{job_id}/cancel", response_model=JobResponse)
async def cancel_job(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    return await _transition_job_status(job_id, "cancelled", db)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _job_service(db).soft_delete(job_id)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


async def _transition_job_status(job_id: UUID, next_status: str, db: AsyncSession) -> JobResponse:
    try:
        job = await _job_service(db).transition_status(job_id, next_status)
        await db.commit()
        await db.refresh(job)
        return JobResponse.model_validate(job)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/skills", response_model=list[JobRequiredSkillResponse])
async def list_job_skills(
    job_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> list[JobRequiredSkillResponse]:
    try:
        return await _job_service(db).list_required_skills(job_id)
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.post("/{job_id}/skills", response_model=JobRequiredSkillResponse, status_code=status.HTTP_201_CREATED)
async def add_job_skill(
    job_id: UUID,
    body: AddJobSkillRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobRequiredSkillResponse:
    try:
        response = await _job_service(db).add_required_skill(job_id, body)
        await db.commit()
        return response
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.delete("/{job_id}/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_job_skill(
    job_id: UUID,
    skill_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _job_service(db).remove_required_skill(job_id, skill_id)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/candidates")
async def list_job_candidates(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        return await _job_service(db).list_candidate_ranking(job_id)
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.post("/{job_id}/candidates", response_model=PipelineAddCandidateToJobResponse, status_code=status.HTTP_201_CREATED)
async def link_candidate_to_job(
    job_id: UUID,
    body: AddCandidateToJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> PipelineAddCandidateToJobResponse:
    try:
        result = await _pipeline_service(db).add_candidate_to_job(
            candidate_id=body.candidate_id,
            body=PipelineAddCandidateToJobRequest(job_id=job_id, initial_stage="entry"),
            moved_by=current_user.id,
        )
        await db.commit()
        try:
            await _enqueue_latest_pending_analysis_for_candidate_job(
                db,
                candidate_id=body.candidate_id,
                job_id=job_id,
                requested_by=current_user.id,
            )
        except Exception:
            pass

        return result
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.delete("/{job_id}/candidates/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_candidate_from_job(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _pipeline_service(db).remove_candidate_from_job(
            candidate_id=candidate_id,
            job_id=job_id,
            moved_by=current_user.id,
        )
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.post(
    "/{job_id}/scoring",
    response_model=ScoringComputeResponse,
    status_code=status.HTTP_200_OK,
)
async def compute_job_scoring(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ScoringComputeResponse:
    """Compute and persist multi-factor scores for all pipeline candidates in this job.

    Safe to call multiple times: re-scoring a candidate with the same active version
    updates the persisted result in-place. After this endpoint completes, GET /ranking
    will reflect the latest computed scores.
    """
    try:
        svc = CandidateRankingService(db)
        count = await svc.compute_and_persist(job_id)
        version = await svc._load_active_version()
        await db.commit()
        from datetime import UTC, datetime
        return ScoringComputeResponse(
            job_id=job_id,
            candidates_scored=count,
            score_version=version.version,
            computed_at=datetime.now(UTC),
        )
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/ranking", response_model=JobRankingResponse)
async def get_job_ranking(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobRankingResponse:
    """Return persisted ranking for this job. Never recomputes scores inline.

    Call POST /jobs/{job_id}/scoring first to ensure scores are up-to-date.
    """
    try:
        result = await CandidateRankingService(db).get_ranking(job_id)
        return JobRankingResponse(**result)
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.get(
    "/{job_id}/candidates/{candidate_id}/score-explanation",
    response_model=CandidateScoreExplanationResponse,
)
async def get_job_candidate_score_explanation(
    job_id: UUID,
    candidate_id: UUID,
    current_user: InternalUser,
    db: AsyncSession = Depends(get_db),
) -> CandidateScoreExplanationResponse:
    try:
        payload = await JobScoreExplanationService(db).get(
            job_id=job_id,
            candidate_id=candidate_id,
            role=UserRole(current_user.role),
        )
        return CandidateScoreExplanationResponse.model_validate(payload.to_dict())
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.post(
    "/{job_id}/candidates/{candidate_id}/matching-feedback",
    response_model=MatchingFeedbackResponse,
)
async def save_job_candidate_matching_feedback(
    job_id: UUID,
    candidate_id: UUID,
    body: MatchingFeedbackRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> MatchingFeedbackResponse:
    try:
        explanation = await JobScoreExplanationService(db).get(
            job_id=job_id,
            candidate_id=candidate_id,
            role=UserRole(current_user.role),
        )
        observation = await MatchingObservabilityService(db).save_feedback(
            job_id=job_id,
            candidate_id=candidate_id,
            analysis_id=explanation.analysis_id,
            liked=body.liked,
            rejected=body.rejected,
            hired=body.hired,
            comment=body.comment,
            feedback_by=current_user.id,
        )
        await db.commit()
        payload = MatchingObservabilityService.feedback_payload(observation)
        if payload is None:
            raise RuntimeError("Feedback não pôde ser persistido")
        return MatchingFeedbackResponse.model_validate(payload.to_dict())
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/matches", response_model=list[JobMatchCandidateResponse])
async def list_job_matches(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> list[JobMatchCandidateResponse]:
    try:
        return await _pipeline_service(db).list_job_matches(job_id)
    except Exception as exc:
        _handle_job_service_error(exc)
        raise
