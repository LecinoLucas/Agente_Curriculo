from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_application_service import CandidateApplicationService
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.interface.api.dependencies import RecruiterOrAdmin, get_db
from src.interface.api.schemas.candidate_application_schemas import (
    CandidateApplicationCreateRequest,
    CandidateApplicationResponse,
    CandidateApplicationUpdateRequest,
    CandidateLocationPreferenceCreateRequest,
    CandidateLocationPreferenceResponse,
)
from src.interface.api.schemas.common import PaginatedResponse

router = APIRouter(prefix="/applications", tags=["applications"])


def _service(db: AsyncSession) -> CandidateApplicationService:
    return CandidateApplicationService(db, SQLAlchemyCandidateApplicationRepository(db))


@router.post(
    "/location-preferences",
    response_model=CandidateLocationPreferenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_location_preference(
    body: CandidateLocationPreferenceCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateLocationPreferenceResponse:
    preference = await _service(db).create_location_preference(body)
    await db.commit()
    await db.refresh(preference)
    return CandidateLocationPreferenceResponse.model_validate(preference)


@router.get(
    "/location-preferences",
    response_model=PaginatedResponse[CandidateLocationPreferenceResponse],
)
async def list_location_preferences(
    current_user: RecruiterOrAdmin,
    candidate_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CandidateLocationPreferenceResponse]:
    preferences, total = await _service(db).list_location_preferences(
        page=page,
        page_size=page_size,
        candidate_id=candidate_id,
    )
    return PaginatedResponse[CandidateLocationPreferenceResponse](
        data=[CandidateLocationPreferenceResponse.model_validate(item) for item in preferences],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=CandidateApplicationResponse, status_code=status.HTTP_201_CREATED)
async def create_application(
    body: CandidateApplicationCreateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateApplicationResponse:
    application = await _service(db).create_application(body)
    await db.commit()
    await db.refresh(application)
    return CandidateApplicationResponse.model_validate(application)


@router.get("", response_model=PaginatedResponse[CandidateApplicationResponse])
async def list_applications(
    current_user: RecruiterOrAdmin,
    candidate_id: UUID | None = Query(default=None),
    job_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    source: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CandidateApplicationResponse]:
    applications, total = await _service(db).list_applications(
        page=page,
        page_size=page_size,
        candidate_id=candidate_id,
        job_id=job_id,
        status=status,
        source=source,
    )
    return PaginatedResponse[CandidateApplicationResponse](
        data=[CandidateApplicationResponse.model_validate(item) for item in applications],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/{application_id}", response_model=CandidateApplicationResponse)
async def get_application(
    application_id: UUID,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateApplicationResponse:
    application = await _service(db).get_application(application_id)
    return CandidateApplicationResponse.model_validate(application)


@router.patch("/{application_id}", response_model=CandidateApplicationResponse)
async def update_application(
    application_id: UUID,
    body: CandidateApplicationUpdateRequest,
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> CandidateApplicationResponse:
    application = await _service(db).update_application(application_id, body)
    await db.commit()
    await db.refresh(application)
    return CandidateApplicationResponse.model_validate(application)
