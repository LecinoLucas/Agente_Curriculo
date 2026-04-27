from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_service import (
    CandidateEmailConflictError,
    CandidateNotFoundError,
    CandidateService,
    InvalidCandidateTextError,
)
from src.application.services.pipeline_service import (
    PipelineCandidateNotFoundError,
    PipelineEntryNotFoundError,
    PipelineJobNotFoundError,
    PipelineService,
)
from src.infrastructure.repositories.sqlalchemy_candidate_repository import (
    SQLAlchemyCandidateRepository,
)
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import (
    SQLAlchemyPipelineRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.candidate_schemas import (
    CandidateOverviewResponse,
    CandidateResponse,
    CreateCandidateRequest,
    UpdateCandidateRequest,
)
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.pipeline_schemas import (
    UpdateCandidateStageRequest,
    UpdateCandidateStageResponse,
)

router = APIRouter(prefix="/candidates", tags=["candidates"])


def _candidate_service(db: AsyncSession) -> CandidateService:
    return CandidateService(SQLAlchemyCandidateRepository(db))


def _pipeline_service(db: AsyncSession) -> PipelineService:
    return PipelineService(SQLAlchemyPipelineRepository(db))


def _handle_candidate_service_error(exc: Exception) -> None:
    if isinstance(exc, CandidateNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    if isinstance(exc, CandidateEmailConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Candidato com este e-mail já existe",
        )
    if isinstance(exc, InvalidCandidateTextError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nome não pode estar em branco",
        )
    if isinstance(exc, PipelineCandidateNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não encontrado",
        )
    if isinstance(exc, PipelineJobNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vaga não encontrada",
        )
    if isinstance(exc, PipelineEntryNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidato não está no pipeline da vaga",
        )
    raise exc


@router.post("", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    body: CreateCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        candidate = await _candidate_service(db).create(body, current_user.id)
        await db.commit()
        await db.refresh(candidate)
        return CandidateResponse.model_validate(candidate)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.get("", response_model=PaginatedResponse[CandidateResponse])
async def list_candidates(
    current_user: RecruiterOrAdmin,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, description="Busca por nome ou e-mail"),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CandidateResponse]:
    candidates, total_items = await _candidate_service(db).list(page, page_size, search)

    return PaginatedResponse[CandidateResponse](
        data=[CandidateResponse.model_validate(c) for c in candidates],
        total=total_items,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_items + page_size - 1) // page_size),
    )


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        return CandidateResponse.model_validate(await _candidate_service(db).get(candidate_id))
    except Exception as exc:
        _handle_candidate_service_error(exc)
        raise


@router.get("/{candidate_id}/overview", response_model=CandidateOverviewResponse)
async def get_candidate_overview(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateOverviewResponse:
    try:
        return await _candidate_service(db).get_overview(candidate_id)
    except Exception as exc:
        _handle_candidate_service_error(exc)
        raise


@router.patch("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: UUID,
    body: UpdateCandidateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateResponse:
    try:
        candidate = await _candidate_service(db).update(candidate_id, body)
        await db.commit()
        await db.refresh(candidate)
        return CandidateResponse.model_validate(candidate)
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.patch("/{candidate_id}/stage", response_model=UpdateCandidateStageResponse)
async def update_candidate_stage(
    candidate_id: UUID,
    body: UpdateCandidateStageRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> UpdateCandidateStageResponse:
    try:
        updated = await _pipeline_service(db).update_candidate_stage(candidate_id, body)
        await db.commit()
        return updated
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _candidate_service(db).soft_delete(candidate_id)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_candidate_service_error(exc)
        raise
