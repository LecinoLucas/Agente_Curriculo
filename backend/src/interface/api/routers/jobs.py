from typing import Any
from uuid import UUID

import sqlalchemy as sa
import structlog
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_dispatch_service import CandidateJobAnalysisDispatcher
from src.application.services.analysis_service import (
    AnalysisNotCompletedError,
    AnalysisResultNotFoundError,
    AnalysisService,
)
from src.application.services.audit_service import AuditService
from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
from src.application.services.candidate_ranking_service import (
    CandidateNotInActivePipelineError,
    CandidateRankingService,
    NoActiveScoreVersionError,
    RankingJobNotFoundError,
)
from src.application.services.job_ai_draft_service import (
    AiDraftAIError,
    AiDraftParseError,
    AiDraftValidationError,
    JobAiDraftService,
)
from src.application.services.job_image_text_extraction_service import (
    JobImageExtractionNoTextError,
    JobImageExtractionUnavailableError,
    JobImageTextExtractionService,
)
from src.application.services.job_bulk_import_service import JobBulkImportService
from src.application.services.job_bulk_payload_normalizer import (
    BulkJobPayloadNormalizationError,
    JobBulkPayloadNormalizer,
)
from src.application.services.job_bulk_update_service import JobBulkUpdateService
from src.application.services.job_ocr_service import (
    MAX_OCR_IMAGE_BYTES,
    JobOcrService,
    OcrImageTooLargeError,
    OcrProcessingError,
    OcrValidationError,
)
from src.application.services.job_quality_validator_service import (
    JobNotFoundForQualityError,
    JobQualityValidatorService,
)
from src.application.services.job_score_explanation_service import (
    CandidateNotLinkedToJobError,
    CandidateScoreExplanationNotReadyError,
    JobScoreExplanationService,
)
from src.application.services.job_service import (
    InvalidJobSalaryRangeError,
    InvalidJobTextError,
    JobNotFoundError,
    JobPublicationValidationError,
    JobService,
    JobSkillConflictError,
    JobSkillLinkNotFoundError,
    SkillNotFoundError,
)
from src.application.services.matching_observability_service import MatchingObservabilityService
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
from src.core.log_sanitizer import sanitize_log_text
from src.domain.entities.user import UserRole
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models.scoring_model import CandidateJobScoreSnapshotModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
    SQLAlchemyBehavioralAssignmentRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.interface.api.dependencies import (
    AdminOnly,
    CurrentUser,
    InternalUser,
    RecruiterOrAdmin,
    get_db,
)
from src.interface.api.rate_limiting import rate_limit_ai_draft_generate, rate_limit_ai_draft_ocr
from src.interface.api.schemas.analysis_schemas import ForceRecomputeResponse
from src.interface.api.schemas.behavioral_assignment_schemas import (
    BehavioralAssignmentDetailResponse,
    RecruiterBehavioralAssessmentStatusResponse,
)
from src.interface.api.schemas.job_schemas import (
    AddCandidateToJobRequest,
    AiDraftFieldsResponse,
    AiDraftGenerateRequest,
    AiDraftGenerateResponse,
    AiDraftSafetyCheckResponse,
    AiDraftSafetyFindingResponse,
    AiDraftSourceResponse,
    AiDraftUsageResponse,
    ArchiveJobRequest,
    BulkImportJobsResponse,
    BulkUpdateJobsResponse,
    CandidateScoreExplanationResponse,
    CreateJobRequest,
    JobListResponse,
    JobQualityResponse,
    JobResponse,
    JobStatusSummaryResponse,
    MatchingFeedbackRequest,
    MatchingFeedbackResponse,
    OcrExtractResponse,
    OcrSourceInfo,
    UpdateJobRequest,
)
from src.interface.api.schemas.pipeline_schemas import (
    AddCandidateToJobRequest as PipelineAddCandidateToJobRequest,
)
from src.interface.api.schemas.pipeline_schemas import (
    AddCandidateToJobResponse as PipelineAddCandidateToJobResponse,
)
from src.interface.api.schemas.pipeline_schemas import (
    JobMatchCandidateResponse,
    PipelineAnalysisDecisionResponse,
)
from src.interface.api.schemas.ranking_schemas import (
    CandidateRankingEntry,
    JobRankingResponse,
    ScoringComputeResponse,
    SingleCandidateScoringResponse,
)
from src.interface.api.schemas.skill_schemas import (
    AddJobSkillRequest,
    JobRequiredSkillResponse,
    UpdateJobSkillRequest,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _build_ai_draft_response(
    result: Any,
    *,
    extracted_text: str | None = None,
    extraction_confidence: float | None = None,
    extra_warnings: list[str] | None = None,
    extra_needs_review: list[str] | None = None,
) -> AiDraftGenerateResponse:
    warnings = list(dict.fromkeys([*(result.warnings or []), *(extra_warnings or [])]))
    needs_review = list(dict.fromkeys([*(result.needs_review or []), *(extra_needs_review or [])]))

    safety_check = None
    if result.safety_check is not None:
        safety_check = AiDraftSafetyCheckResponse(
            status=result.safety_check.status,
            highest_severity=result.safety_check.highest_severity,
            findings=[
                AiDraftSafetyFindingResponse(
                    field=finding.field,
                    severity=finding.severity,
                    code=finding.code,
                    message=finding.message,
                    term=finding.term,
                )
                for finding in result.safety_check.findings
            ],
        )

    return AiDraftGenerateResponse(
        draft=AiDraftFieldsResponse(
            title=result.draft.title,
            area=result.draft.area,
            seniority=result.draft.seniority,
            work_model=result.draft.work_model,
            unit=result.draft.unit,
            salary_min=result.draft.salary_min,
            salary_max=result.draft.salary_max,
            minimum_education_level=result.draft.minimum_education_level,
            minimum_years_experience=result.draft.minimum_years_experience,
            experience_context=result.draft.experience_context,
            description=result.draft.description,
            responsibilities=result.draft.responsibilities,
            requirements=result.draft.requirements,
            mandatory_skills=result.draft.mandatory_skills,
            nice_to_have_skills=result.draft.nice_to_have_skills,
            benefits=result.draft.benefits,
            working_hours=result.draft.working_hours,
            screening_questions=result.draft.screening_questions,
            pipeline_steps=result.draft.pipeline_steps,
            matching_criteria=result.draft.matching_criteria,
            selection_flow_type=result.draft.selection_flow_type,
            requires_manager_review=result.draft.requires_manager_review,
            requires_behavioral_assessment=result.draft.requires_behavioral_assessment,
        ),
        needs_review=needs_review,
        warnings=warnings,
        extracted_text=extracted_text,
        extraction_confidence=extraction_confidence,
        safety_check=safety_check,
        source=AiDraftSourceResponse(
            text_used=result.source.text_used,
            ocr_used=result.source.ocr_used,
            input_character_count=result.source.input_character_count,
        ),
        usage=AiDraftUsageResponse(
            provider=result.usage.provider,
            model=result.usage.model,
            input_tokens=result.usage.input_tokens,
            output_tokens=result.usage.output_tokens,
            total_tokens=result.usage.total_tokens,
            estimated_cost=result.usage.estimated_cost,
        ),
    )


def _job_service(db: AsyncSession) -> JobService:
    return JobService(SQLAlchemyJobRepository(db), audit_service=AuditService(db))


def _job_bulk_import_service(db: AsyncSession) -> JobBulkImportService:
    return JobBulkImportService(db)


def _job_bulk_update_service(db: AsyncSession) -> JobBulkUpdateService:
    return JobBulkUpdateService(db)


def _behavioral_assignment_service(db: AsyncSession) -> BehavioralAssignmentService:
    return BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(db))


def _pipeline_service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db), db)


def _analysis_response(decision) -> PipelineAnalysisDecisionResponse:
    return PipelineAnalysisDecisionResponse.model_validate(decision.as_dict())


def _analysis_service(db: AsyncSession) -> AnalysisService:
    return AnalysisService(SQLAlchemyAnalysisRepository(db), audit_service=AuditService(db))


async def _get_current_job_behavioral_assignment(
    db: AsyncSession,
    *,
    job_id: UUID,
    candidate_id: UUID,
):
    job = await SQLAlchemyJobRepository(db).find_active_by_id(job_id)
    if job is None or job.behavioral_template_id is None:
        return None
    repo = SQLAlchemyBehavioralAssignmentRepository(db)
    pipeline_id = await repo.get_active_pipeline_id(candidate_id=candidate_id, job_id=job_id)
    return await repo.get_assignment_by_job_candidate(
        job_id=job_id,
        candidate_id=candidate_id,
        template_id=job.behavioral_template_id,
        pipeline_id=pipeline_id,
    )


async def _resolve_force_recompute_analysis_id(
    db: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
) -> UUID:
    pipeline_entry = await SQLAlchemyPipelineRepository(db).find_active_entry(candidate_id, job_id)
    if pipeline_entry is None:
        raise ValidationException(
            "Force recompute só é permitido para candidato com pipeline ativo nesta vaga."
        )

    analysis_repo = SQLAlchemyAnalysisRepository(db)
    if pipeline_entry.current_analysis_id is not None:
        completed = await analysis_repo.find_completed(pipeline_entry.current_analysis_id)
        if completed is not None:
            return completed.id

    if pipeline_entry.resume_version_id is None:
        raise ValidationException(
            "O pipeline ativo não possui análise concluída vinculada para recalcular."
        )

    latest_completed = await analysis_repo.find_latest_completed_for_version(
        resume_version_id=pipeline_entry.resume_version_id,
        job_id=job_id,
    )
    if latest_completed is None:
        raise ValidationException(
            "Nenhuma análise concluída foi encontrada para o pipeline ativo desta vaga."
        )
    return latest_completed.id


async def _load_latest_snapshot_score(
    db: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID,
) -> float | None:
    snapshot_score = await db.scalar(
        sa.select(CandidateJobScoreSnapshotModel.final_score)
        .where(
            CandidateJobScoreSnapshotModel.candidate_id == candidate_id,
            CandidateJobScoreSnapshotModel.job_id == job_id,
        )
        .order_by(
            CandidateJobScoreSnapshotModel.computed_at.desc(),
            CandidateJobScoreSnapshotModel.id.desc(),
        )
        .limit(1)
    )
    return float(snapshot_score) if snapshot_score is not None else None


def _quality_validator_service(db: AsyncSession) -> JobQualityValidatorService:
    return JobQualityValidatorService(SQLAlchemyJobRepository(db))


def _handle_job_service_error(exc: Exception) -> None:
    if isinstance(exc, JobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, InvalidJobSalaryRangeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Faixa salarial inválida"
        )
    if isinstance(exc, InvalidJobTextError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Título e descrição não podem estar em branco",
        )
    if isinstance(exc, ValidationException):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, SkillNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill não encontrada")
    if isinstance(exc, JobSkillConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Skill já vinculada a esta vaga"
        )
    if isinstance(exc, JobSkillLinkNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vínculo não encontrado")
    if isinstance(exc, PipelineJobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, PipelineCandidateAlreadyActiveInAnotherJobError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Candidato já possui vínculo ativo com outra vaga. "
                "Use transferência para mover o candidato."
            ),
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
    if isinstance(exc, CandidateNotInActivePipelineError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato não possui pipeline ativo nesta vaga.",
        )
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
                "validation_errors": exc.validation_errors,
            },
        )
    if isinstance(exc, CandidateNotLinkedToJobError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Candidato não está vinculado a esta vaga. "
                "Adicione o candidato à vaga antes de visualizar o score."
            ),
        )
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
        return JobResponse.model_validate(await service.get(job.id))
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.post(
    "/bulk-import", response_model=BulkImportJobsResponse, status_code=status.HTTP_201_CREATED
)
async def bulk_import_jobs(
    current_user: RecruiterOrAdmin,
    body: Any = Body(...),
    db: AsyncSession = Depends(get_db),
) -> BulkImportJobsResponse:
    try:
        logger.info(
            "job.bulk_import_request",
            body_type=type(body).__name__,
            body_keys=list(body.keys()) if isinstance(body, dict) else None,
        )
        normalized_body = JobBulkPayloadNormalizer.normalize_import_request(body)
        result = await _job_bulk_import_service(db).import_jobs(normalized_body, current_user.id)
        if normalized_body.options.dry_run:
            await db.rollback()
        else:
            await db.commit()
        return result
    except BulkJobPayloadNormalizationError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/ai-draft/ocr",
    response_model=OcrExtractResponse,
    status_code=status.HTTP_200_OK,
    summary="OCR — extração de texto de imagem de vaga (Fase IA Vaga 2)",
)
async def extract_job_image_ocr(
    current_user: RecruiterOrAdmin,
    file: UploadFile = File(...),
    _rl: None = Depends(rate_limit_ai_draft_ocr),
) -> OcrExtractResponse:
    """Recebe uma imagem (PNG/JPEG/WebP), valida, executa OCR local e devolve o texto.

    Não chama IA. Não persiste arquivo. Não cria nem altera vagas.
    Requer autenticação RecruiterOrAdmin.
    """
    content = await file.read(MAX_OCR_IMAGE_BYTES + 1)
    service = JobOcrService()
    try:
        result = service.extract_from_image(
            filename=file.filename or "upload",
            content_type=file.content_type,
            content=content,
        )
    except OcrImageTooLargeError as exc:
        logger.warning(
            "job_ai_ocr.failed",
            reason="file_too_large",
            user_id=str(current_user.id),
            size_bytes=len(content),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except OcrValidationError as exc:
        logger.warning(
            "job_ai_ocr.failed",
            reason="validation_error",
            user_id=str(current_user.id),
            mime_type=file.content_type,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except OcrProcessingError as exc:
        logger.error(
            "job_ai_ocr.processing_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao processar imagem com OCR",
        ) from exc

    logger.info(
        "job_ai_ocr.completed",
        user_id=str(current_user.id),
        mime_type=result.mime_type,
        size_bytes=result.size_bytes,
        character_count=result.character_count,
    )
    return OcrExtractResponse(
        extracted_text=result.extracted_text,
        text_preview=result.text_preview,
        character_count=result.character_count,
        confidence=result.confidence,
        source=OcrSourceInfo(
            filename=result.filename,
            mime_type=result.mime_type,
            size_bytes=result.size_bytes,
        ),
    )


@router.post(
    "/ai-draft/generate",
    response_model=AiDraftGenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Geração de rascunho de vaga com IA (Fase IA Vaga 3)",
)
async def generate_job_ai_draft(
    body: AiDraftGenerateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
    _rl: None = Depends(rate_limit_ai_draft_generate),
) -> AiDraftGenerateResponse:
    """Recebe texto (digitado + OCR), chama a IA e devolve rascunho estruturado.

    A IA jamais recebe imagem. O rascunho é para revisão humana — não cria nem publica vagas.
    Requer autenticação RecruiterOrAdmin.
    """
    service = JobAiDraftService()
    try:
        result = await service.generate(
            text_input=body.text_input,
            ocr_text=body.ocr_text,
            session=db,
        )
    except AiDraftValidationError as exc:
        logger.warning(
            "job_ai_draft.failed",
            reason="validation_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except AiDraftParseError as exc:
        logger.error(
            "job_ai_draft.failed",
            reason="parse_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resposta do provedor de IA inválida. Tente novamente.",
        ) from exc
    except AiDraftAIError as exc:
        logger.error(
            "job_ai_draft.failed",
            reason="ai_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Provedor de IA indisponível. Tente novamente em instantes.",
        ) from exc

    logger.info(
        "job_ai_draft.generated",
        user_id=str(current_user.id),
        provider=result.usage.provider,
        model=result.usage.model,
        input_tokens=result.usage.input_tokens,
        output_tokens=result.usage.output_tokens,
        needs_review_count=len(result.needs_review),
        text_used=result.source.text_used,
        ocr_used=result.source.ocr_used,
    )

    await db.commit()

    return _build_ai_draft_response(
        result,
        extracted_text=body.ocr_text,
        extraction_confidence=None,
    )


@router.post(
    "/ai-draft/from-image",
    response_model=AiDraftGenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Geração de rascunho de vaga com IA a partir de imagem",
)
async def generate_job_ai_draft_from_image(
    current_user: RecruiterOrAdmin,
    file: UploadFile = File(...),
    context_text: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
    _rl_ocr: None = Depends(rate_limit_ai_draft_ocr),
    _rl_generate: None = Depends(rate_limit_ai_draft_generate),
) -> AiDraftGenerateResponse:
    """Recebe uma imagem de vaga, extrai texto e gera um rascunho revisável."""
    content = await file.read(MAX_OCR_IMAGE_BYTES + 1)
    extraction_service = JobImageTextExtractionService()
    draft_service = JobAiDraftService()

    try:
        extraction = extraction_service.extract_from_image(
            filename=file.filename or "upload",
            content_type=file.content_type,
            content=content,
        )
    except OcrImageTooLargeError as exc:
        logger.warning(
            "job_ai_draft_from_image.failed",
            reason="file_too_large",
            user_id=str(current_user.id),
            size_bytes=len(content),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except OcrValidationError as exc:
        logger.warning(
            "job_ai_draft_from_image.failed",
            reason="validation_error",
            user_id=str(current_user.id),
            mime_type=file.content_type,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except JobImageExtractionNoTextError as exc:
        logger.warning(
            "job_ai_draft_from_image.failed",
            reason="no_useful_text",
            user_id=str(current_user.id),
            mime_type=file.content_type,
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except (JobImageExtractionUnavailableError, OcrProcessingError) as exc:
        logger.error(
            "job_ai_draft_from_image.extraction_unavailable",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Extracao de texto de imagem indisponivel no momento.",
        ) from exc

    try:
        result = await draft_service.generate(
            text_input=context_text,
            ocr_text=extraction.extracted_text,
            session=db,
        )
    except AiDraftValidationError as exc:
        logger.warning(
            "job_ai_draft_from_image.failed",
            reason="validation_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except AiDraftParseError as exc:
        logger.error(
            "job_ai_draft_from_image.failed",
            reason="parse_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resposta do provedor de IA invalida. Tente novamente.",
        ) from exc
    except AiDraftAIError as exc:
        logger.error(
            "job_ai_draft_from_image.failed",
            reason="ai_error",
            user_id=str(current_user.id),
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Provedor de IA indisponivel. Tente novamente em instantes.",
        ) from exc

    logger.info(
        "job_ai_draft_from_image.generated",
        user_id=str(current_user.id),
        provider=result.usage.provider,
        model=result.usage.model,
        input_tokens=result.usage.input_tokens,
        output_tokens=result.usage.output_tokens,
        needs_review_count=len(result.needs_review),
        extracted_character_count=len(extraction.extracted_text),
    )

    await db.commit()

    return _build_ai_draft_response(
        result,
        extracted_text=extraction.extracted_text,
        extraction_confidence=extraction.confidence,
        extra_warnings=extraction.warnings,
        extra_needs_review=["extracted_text"],
    )


@router.get("", response_model=JobListResponse)
async def list_jobs(
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    status_filter: str | None = Query(
        default=None, pattern="^(draft|published|paused|closed|cancelled|archived)$"
    ),
    job_area: str | None = Query(default=None),
    work_model: str | None = Query(default=None),
    operational_group_id: UUID | None = Query(default=None),
    location_group_id: UUID | None = Query(default=None),
    operational_unit_id: UUID | None = Query(default=None),
    allocation_mode: str | None = Query(default=None, pattern="^(corporate|operational)$"),
    db: AsyncSession = Depends(get_db),
) -> JobListResponse:
    jobs, total_items, summary = await _job_service(db).list(
        page,
        page_size,
        search=search,
        status=status_filter,
        job_area=job_area,
        work_model=work_model,
        operational_group_id=operational_group_id,
        location_group_id=location_group_id,
        operational_unit_id=operational_unit_id,
        allocation_mode=allocation_mode,
    )

    return JobListResponse(
        data=[JobResponse.model_validate(job) for job in jobs],
        total=total_items,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_items + page_size - 1) // page_size),
        summary=JobStatusSummaryResponse(**summary),
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
            validation_errors=result.validation_errors,
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
        previous_job = await service.get(job_id)
        previous_status = previous_job.status
        job = await service.update(job_id, body)
        is_publish_request = "status" in body.model_fields_set and body.status == "published"
        if is_publish_request and previous_status != "published":
            await service.ensure_publishable(job.id)
        await db.commit()
        return JobResponse.model_validate(await service.get(job.id))
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


@router.patch("/{job_id}/archive", response_model=JobResponse)
async def archive_job(
    job_id: UUID,
    body: ArchiveJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        job = await _job_service(db).archive(
            job_id,
            actor=current_user,
            reason=body.reason,
            note=body.note,
        )
        await db.commit()
        await db.refresh(job)
        return JobResponse.model_validate(job)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.patch("/{job_id}/restore", response_model=JobResponse)
async def restore_job(
    job_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        job = await _job_service(db).restore(job_id, actor=current_user)
        await db.commit()
        await db.refresh(job)
        return JobResponse.model_validate(job)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


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
        if next_status == "archived":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Use a ação específica de arquivar vaga.",
            )
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


@router.post(
    "/{job_id}/skills", response_model=JobRequiredSkillResponse, status_code=status.HTTP_201_CREATED
)
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


@router.patch("/{job_id}/skills/{skill_link_id}", response_model=JobRequiredSkillResponse)
async def update_job_skill(
    job_id: UUID,
    skill_link_id: UUID,
    body: UpdateJobSkillRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobRequiredSkillResponse:
    try:
        response = await _job_service(db).update_required_skill(job_id, skill_link_id, body)
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


@router.post(
    "/{job_id}/candidates",
    response_model=PipelineAddCandidateToJobResponse,
    status_code=status.HTTP_201_CREATED,
)
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
        analysis_decision = await CandidateJobAnalysisDispatcher(db).request_auto_analysis(
            candidate_id=body.candidate_id,
            job_id=job_id,
            requested_by=current_user.id,
        )
        return result.model_copy(update={"analysis": _analysis_response(analysis_decision)})
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


@router.get(
    "/{job_id}/candidates/{candidate_id}/behavioral-assessment",
    response_model=BehavioralAssignmentDetailResponse | RecruiterBehavioralAssessmentStatusResponse,
)
async def get_candidate_behavioral_assessment_status(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> BehavioralAssignmentDetailResponse | RecruiterBehavioralAssessmentStatusResponse:
    return await _behavioral_assignment_service(db).get_recruiter_status(
        job_id=job_id,
        candidate_id=candidate_id,
    )


@router.post(
    "/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluate",
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_behavioral_assessment_evaluation(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    retry_failed: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Trigger IA-assisted evaluation of submitted behavioral assessment.

    Only evaluates SUBMITTED assignments. Returns 400 if pending/in_progress.
    Reuses completed evaluations by default.
    IA analysis is assistive only, never affects decisions or scoring.
    """
    from src.application.services.behavioral_ai_evaluation_service import (
        BehavioralAIEvaluationService,
        BehavioralAIOperationalError,
        behavioral_ai_safe_detail,
    )
    from src.interface.workers.behavioral_ai_dispatcher import enqueue_behavioral_ai_evaluation

    try:
        assignment = await _get_current_job_behavioral_assignment(
            db,
            job_id=job_id,
            candidate_id=candidate_id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Behavioral assessment not found",
            )

        service = BehavioralAIEvaluationService(db)
        evaluation, should_enqueue = await service.request_evaluation(
            job_id=job_id,
            candidate_id=candidate_id,
            assignment_id=assignment.id,
            retry_failed=retry_failed,
        )
        if should_enqueue:
            await service.mark_enqueued(evaluation)
            try:
                enqueue_behavioral_ai_evaluation(evaluation.id)
            except Exception as exc:
                await service.mark_enqueue_failed(evaluation, "behavioral_ai_enqueue_failed")
                await db.commit()
                logger.error(
                    "behavioral_ai.enqueue_failed",
                    evaluation_id=str(evaluation.id),
                    assignment_id=str(evaluation.assignment_id),
                    error=sanitize_log_text(str(exc)) or type(exc).__name__,
                )
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={
                        "code": "enqueue_failed",
                        "message": "Não foi possível enfileirar a IA comportamental.",
                        "evaluation_id": str(evaluation.id),
                    },
                ) from exc

        await db.commit()
        return {
            "evaluation_id": str(evaluation.id),
            "assignment_id": str(evaluation.assignment_id),
            "status": evaluation.status,
            "queued_at": evaluation.queued_at,
            "next_retry_at": evaluation.next_retry_at,
            "retry_count": int(evaluation.retry_count or 0),
            "message": (
                "Avaliação enfileirada"
                if should_enqueue
                else "Avaliação já existente para este assignment"
            ),
        }
    except BehavioralAIOperationalError as exc:
        await db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc
    except ValidationException as exc:
        await db.rollback()
        detail = str(exc)
        code = (
            "behavioral_assessment_not_found"
            if "not found" in detail.lower()
            else "behavioral_assessment_not_submitted"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND
            if code == "behavioral_assessment_not_found"
            else status.HTTP_400_BAD_REQUEST,
            detail=behavioral_ai_safe_detail(
                code,
                message=(
                    "Avaliação comportamental não encontrada."
                    if code == "behavioral_assessment_not_found"
                    else "O teste comportamental ainda não foi concluído."
                ),
            ),
        ) from exc
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.error(
            "behavioral_ai.request_failed",
            error_type=type(exc).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=behavioral_ai_safe_detail("unexpected_error"),
        ) from exc


@router.get(
    "/{job_id}/candidates/{candidate_id}/behavioral-assessment/evaluation",
)
async def get_behavioral_assessment_evaluation(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve IA-assisted evaluation if exists.

    Returns evaluation details if completed, status if pending/processing.
    Returns 404 if no evaluation exists.
    """
    from src.application.services.behavioral_ai_evaluation_service import (
        BehavioralAIEvaluationService,
    )

    try:
        service = BehavioralAIEvaluationService(db)

        assignment = await _get_current_job_behavioral_assignment(
            db,
            job_id=job_id,
            candidate_id=candidate_id,
        )
        if not assignment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Behavioral assessment not found",
            )

        evaluation = await service.get_evaluation(
            job_id=job_id,
            candidate_id=candidate_id,
            assignment_id=assignment.id,
        )

        if not evaluation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No evaluation exists for this assessment",
            )

        # Build response
        result = {
            "id": str(evaluation.id),
            "assignment_id": str(evaluation.assignment_id),
            "status": evaluation.status,
            "queued_at": evaluation.queued_at,
            "started_at": evaluation.started_at,
            "completed_at": evaluation.completed_at,
            "failed_at": evaluation.failed_at,
            "next_retry_at": evaluation.next_retry_at,
            "retry_count": int(evaluation.retry_count or 0),
            "provider": evaluation.provider,
            "model": evaluation.model,
            "provider_error_type": evaluation.provider_error_type,
            "created_at": evaluation.created_at,
            "updated_at": evaluation.updated_at,
        }

        if evaluation.status == "completed":
            result.update(
                {
                    "confidence": evaluation.confidence,
                    "summary": evaluation.summary,
                    "strengths": evaluation.strengths_json or [],
                    "concerns": evaluation.concerns_json or [],
                    "competency_signals": evaluation.competency_signals_json or [],
                    "suggested_interview_questions": evaluation.suggested_interview_questions_json
                    or [],
                    "risk_flags": evaluation.risk_flags_json or [],
                    "completed_at": evaluation.completed_at,
                }
            )
        elif evaluation.status in {"failed", "retry_scheduled"}:
            result["error_message"] = evaluation.error_message

        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error retrieving behavioral evaluation: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve evaluation",
        ) from exc


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
        score_deltas = await svc.compute_and_persist(job_id)
        version = await svc._load_active_version()
        await db.commit()
        from datetime import UTC, datetime

        return ScoringComputeResponse(
            job_id=job_id,
            candidates_scored=len(score_deltas),
            score_version=version.version,
            computed_at=datetime.now(UTC),
            score_deltas=score_deltas,
        )
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.post(
    "/{job_id}/candidates/{candidate_id}/scoring",
    response_model=SingleCandidateScoringResponse,
    status_code=status.HTTP_200_OK,
)
async def compute_single_candidate_scoring(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> SingleCandidateScoringResponse:
    """Compute and persist score for a single candidate with an active pipeline.

    This endpoint explicitly requires the candidate to be actively in the job's pipeline.
    It does not alter the candidate's active job and does not trigger new AI analysis.
    """
    try:
        svc = CandidateRankingService(db)
        await svc.assert_candidate_active_in_job(candidate_id, job_id)

        result = await svc.compute_single_candidate(
            job_id=job_id,
            candidate_id=candidate_id,
            recompute_reason="manual_rescore",
            actor_id=str(current_user.id),
        )
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Não foi possível calcular o score (faltam evidências ou análise inválida).",
            )

        await db.commit()
        return SingleCandidateScoringResponse(**result)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.post(
    "/{job_id}/candidates/{candidate_id}/force-recompute",
    response_model=ForceRecomputeResponse,
    status_code=status.HTTP_200_OK,
)
async def force_recompute_job_candidate(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ForceRecomputeResponse:
    try:
        analysis_id = await _resolve_force_recompute_analysis_id(
            db,
            candidate_id=candidate_id,
            job_id=job_id,
        )
        old_score = await _load_latest_snapshot_score(
            db,
            candidate_id=candidate_id,
            job_id=job_id,
        )

        logger.info(
            "analysis.force_recompute_requested",
            candidate_id=str(candidate_id),
            job_id=str(job_id),
            analysis_id=str(analysis_id),
            requested_by=str(current_user.id),
            safe_mode=True,
        )

        match = await _analysis_service(db).match_completed_analysis_to_job(
            analysis_id=analysis_id,
            job_id=job_id,
            force_recompute=True,
        )
        await db.commit()

        new_score = float(match.job_fit_score) if match.job_fit_score is not None else None
        score_delta = None
        if old_score is not None and new_score is not None:
            score_delta = round(new_score - old_score, 2)

        return ForceRecomputeResponse(
            candidate_id=candidate_id,
            job_id=job_id,
            analysis_id=analysis_id,
            old_score=old_score,
            new_score=new_score,
            score_delta=score_delta,
            ranking_refresh_status=match.ranking_refresh_status,
            ranking_freshness_status=match.ranking_freshness_status,
            ranking_refreshed_at=match.ranking_refreshed_at,
        )
    except AnalysisNotCompletedError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A análise vinculada ao pipeline ativo ainda não foi concluída.",
        ) from exc
    except AnalysisResultNotFoundError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O resultado da análise vinculada ao pipeline ativo não está disponível.",
        ) from exc
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/ranking", response_model=JobRankingResponse)
async def get_job_ranking(
    job_id: UUID,
    current_user: RecruiterOrAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> JobRankingResponse:
    """Return paginated ranking for this job with consistency auto-repair.

    Default page_size=20, max=100.
    """
    try:
        result = await CandidateRankingService(db).get_ranking(
            job_id=job_id,
            page=page,
            page_size=page_size,
        )
        return JobRankingResponse(**result)
    except Exception as exc:
        _handle_job_service_error(exc)
        raise


@router.get("/{job_id}/ranking/{candidate_id}", response_model=CandidateRankingEntry)
async def get_candidate_ranking_entry(
    job_id: UUID,
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateRankingEntry:
    """Return ranking entry for a specific candidate, avoiding full list fetch.

    Returns candidate's position and score in the full ranking.
    """
    try:
        result = await CandidateRankingService(db).get_ranking_entry(
            job_id=job_id,
            candidate_id=candidate_id,
        )
        return CandidateRankingEntry(**result)
    except CandidateNotInActivePipelineError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "candidate_score_not_ready",
                "message": "Score ainda não disponível para este candidato nesta vaga.",
                "action": "request_analysis",
            },
        ) from exc
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
