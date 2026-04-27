from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.job_service import (
    JobSkillConflictError,
    JobSkillLinkNotFoundError,
    InvalidJobTextError,
    InvalidJobSalaryRangeError,
    JobNotFoundError,
    JobService,
    SkillNotFoundError,
)
from src.application.services.pipeline_service import (
    PipelineJobNotFoundError,
    PipelineService,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.application.services.candidate_ranking_service import (
    CandidateRankingService,
    NoActiveScoreVersionError,
    RankingJobNotFoundError,
)
from src.interface.api.dependencies import CurrentUser, RecruiterOrAdmin, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.job_schemas import CreateJobRequest, JobResponse, UpdateJobRequest
from src.interface.api.schemas.pipeline_schemas import JobMatchCandidateResponse
from src.interface.api.schemas.ranking_schemas import JobRankingResponse, ScoringComputeResponse
from src.interface.api.schemas.skill_schemas import AddJobSkillRequest, JobRequiredSkillResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _job_service(db: AsyncSession) -> JobService:
    return JobService(SQLAlchemyJobRepository(db))


def _pipeline_service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db))


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
    if isinstance(exc, RankingJobNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vaga não encontrada")
    if isinstance(exc, NoActiveScoreVersionError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nenhuma versão de scoring ativa. Configure uma versão ativa antes de calcular.",
        )
    raise exc


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    body: CreateJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        job = await _job_service(db).create(body, current_user.id)
        await db.commit()
        await db.refresh(job)
        return JobResponse.model_validate(job)
    except Exception as exc:
        await db.rollback()
        _handle_job_service_error(exc)
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


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: UUID,
    body: UpdateJobRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> JobResponse:
    try:
        job = await _job_service(db).update(job_id, body)
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
    return await _transition_job_status(job_id, "published", db)


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
