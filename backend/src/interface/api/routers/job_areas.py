from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.interface.api.dependencies import RecruiterOrAdmin, InternalUser, AdminOnly, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.job_area_schemas import CreateJobAreaRequest, UpdateJobAreaRequest, JobAreaResponse
from src.application.services.job_area_service import JobAreaService
from src.infrastructure.repositories.sqlalchemy_job_area_repository import SQLAlchemyJobAreaRepository
from src.application.services.audit_service import AuditService

router = APIRouter(prefix="/job-areas", tags=["job-areas"])

def _get_service(db: AsyncSession = Depends(get_db)) -> JobAreaService:
    repository = SQLAlchemyJobAreaRepository(db)
    return JobAreaService(repository, audit_service=AuditService(db))

@router.get("", response_model=PaginatedResponse[JobAreaResponse])
async def list_areas(
    current_user: InternalUser, # Require authentication
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    is_active: Optional[bool] = True,
    service: JobAreaService = Depends(_get_service),
) -> PaginatedResponse[JobAreaResponse]:
    items, total = await service.list_areas(
        page=page,
        page_size=page_size,
        search=search,
        is_active=is_active,
    )
    return PaginatedResponse(
        data=[JobAreaResponse.model_validate(item, from_attributes=True) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 1,
    )

@router.post("", response_model=JobAreaResponse, status_code=status.HTTP_201_CREATED)
async def create_area(
    body: CreateJobAreaRequest,
    current_user: RecruiterOrAdmin,
    service: JobAreaService = Depends(_get_service),
) -> JobAreaResponse:
    area = await service.create_area(
        name=body.name,
        description=body.description,
        created_by=current_user.id,
    )
    return JobAreaResponse.model_validate(area, from_attributes=True)

@router.patch("/{area_id}", response_model=JobAreaResponse)
async def update_area(
    area_id: UUID,
    body: UpdateJobAreaRequest,
    current_user: RecruiterOrAdmin,
    service: JobAreaService = Depends(_get_service),
) -> JobAreaResponse:
    area = await service.update_area(
        area_id=area_id,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
        updated_by=current_user.id,
    )
    return JobAreaResponse.model_validate(area, from_attributes=True)

@router.patch("/{area_id}/deactivate", response_model=JobAreaResponse)
async def deactivate_area(
    area_id: UUID,
    current_user: RecruiterOrAdmin,
    service: JobAreaService = Depends(_get_service),
) -> JobAreaResponse:
    area = await service.deactivate_area(area_id=area_id, updated_by=current_user.id)
    return JobAreaResponse.model_validate(area, from_attributes=True)

@router.patch("/{area_id}/activate", response_model=JobAreaResponse)
async def activate_area(
    area_id: UUID,
    current_user: RecruiterOrAdmin,
    service: JobAreaService = Depends(_get_service),
) -> JobAreaResponse:
    area = await service.activate_area(area_id=area_id, updated_by=current_user.id)
    return JobAreaResponse.model_validate(area, from_attributes=True)

@router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_area(
    area_id: UUID,
    current_user: AdminOnly,
    service: JobAreaService = Depends(_get_service),
) -> None:
    await service.delete_area(area_id=area_id, current_user=current_user)
