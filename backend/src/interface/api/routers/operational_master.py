from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.operational_master_service import OperationalMasterService
from src.infrastructure.repositories.sqlalchemy_operational_master_repository import (
    SQLAlchemyOperationalMasterRepository,
)
from src.interface.api.dependencies import AdminOnly, HrRecruiterOrAdmin, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.operational_master_schemas import (
    CreateLocationGroupRequest,
    CreateOperationalGroupRequest,
    CreateOperationalUnitRequest,
    LocationGroupResponse,
    OperationalGroupResponse,
    OperationalUnitResponse,
    UpdateLocationGroupRequest,
    UpdateOperationalGroupRequest,
    UpdateOperationalUnitRequest,
)

router = APIRouter(tags=["operational-master"])


def _get_service(db: AsyncSession = Depends(get_db)) -> OperationalMasterService:
    return OperationalMasterService(SQLAlchemyOperationalMasterRepository(db))


def _paginate_response(data: list, total: int, page: int, page_size: int):
    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
    }


@router.get("/operational-groups", response_model=PaginatedResponse[OperationalGroupResponse])
async def list_operational_groups(
    current_user: HrRecruiterOrAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    active: bool | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    service: OperationalMasterService = Depends(_get_service),
):
    items, total = await service.list_groups(
        page=page,
        page_size=page_size,
        active=active,
        search=search,
    )
    return _paginate_response(
        [OperationalGroupResponse.model_validate(item, from_attributes=True) for item in items],
        total,
        page,
        page_size,
    )


@router.post(
    "/operational-groups",
    response_model=OperationalGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_operational_group(
    body: CreateOperationalGroupRequest,
    current_user: AdminOnly,
    service: OperationalMasterService = Depends(_get_service),
) -> OperationalGroupResponse:
    group = await service.create_group(
        code=body.code,
        name=body.name,
        description=body.description,
        is_active=body.is_active,
    )
    return OperationalGroupResponse.model_validate(group, from_attributes=True)


@router.patch("/operational-groups/{group_id}", response_model=OperationalGroupResponse)
async def update_operational_group(
    group_id: UUID,
    body: UpdateOperationalGroupRequest,
    current_user: AdminOnly,
    service: OperationalMasterService = Depends(_get_service),
) -> OperationalGroupResponse:
    group = await service.update_group(
        group_id=group_id,
        **body.model_dump(exclude_unset=True),
    )
    return OperationalGroupResponse.model_validate(group, from_attributes=True)


@router.get("/location-groups", response_model=PaginatedResponse[LocationGroupResponse])
async def list_location_groups(
    current_user: HrRecruiterOrAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    active: bool | None = Query(default=None),
    type: Literal["city", "district", "corporate", "other"] | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    service: OperationalMasterService = Depends(_get_service),
):
    items, total = await service.list_location_groups(
        page=page,
        page_size=page_size,
        active=active,
        type=type,
        search=search,
    )
    return _paginate_response(
        [LocationGroupResponse.model_validate(item, from_attributes=True) for item in items],
        total,
        page,
        page_size,
    )


@router.post(
    "/location-groups",
    response_model=LocationGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_location_group(
    body: CreateLocationGroupRequest,
    current_user: AdminOnly,
    service: OperationalMasterService = Depends(_get_service),
) -> LocationGroupResponse:
    location_group = await service.create_location_group(
        name=body.name,
        state=body.state,
        city=body.city,
        type=body.type,
        is_active=body.is_active,
    )
    return LocationGroupResponse.model_validate(location_group, from_attributes=True)


@router.patch("/location-groups/{location_group_id}", response_model=LocationGroupResponse)
async def update_location_group(
    location_group_id: UUID,
    body: UpdateLocationGroupRequest,
    current_user: AdminOnly,
    service: OperationalMasterService = Depends(_get_service),
) -> LocationGroupResponse:
    location_group = await service.update_location_group(
        location_group_id=location_group_id,
        **body.model_dump(exclude_unset=True),
    )
    return LocationGroupResponse.model_validate(location_group, from_attributes=True)


@router.get("/operational-units", response_model=PaginatedResponse[OperationalUnitResponse])
async def list_operational_units(
    current_user: HrRecruiterOrAdmin,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    active: bool | None = Query(default=None),
    group_id: UUID | None = Query(default=None),
    location_group_id: UUID | None = Query(default=None),
    type: Literal["office", "gas_station", "store", "other"] | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=255),
    service: OperationalMasterService = Depends(_get_service),
):
    items, total = await service.list_units(
        page=page,
        page_size=page_size,
        active=active,
        group_id=group_id,
        location_group_id=location_group_id,
        type=type,
        search=search,
    )
    return _paginate_response(
        [OperationalUnitResponse.model_validate(item, from_attributes=True) for item in items],
        total,
        page,
        page_size,
    )


@router.post(
    "/operational-units",
    response_model=OperationalUnitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_operational_unit(
    body: CreateOperationalUnitRequest,
    current_user: AdminOnly,
    service: OperationalMasterService = Depends(_get_service),
) -> OperationalUnitResponse:
    unit = await service.create_unit(
        group_id=body.group_id,
        location_group_id=body.location_group_id,
        code=body.code,
        name=body.name,
        public_name=body.public_name,
        type=body.type,
        reference_point=body.reference_point,
        address=body.address,
        city=body.city,
        state=body.state,
        is_active=body.is_active,
    )
    return OperationalUnitResponse.model_validate(unit, from_attributes=True)


@router.patch("/operational-units/{unit_id}", response_model=OperationalUnitResponse)
async def update_operational_unit(
    unit_id: UUID,
    body: UpdateOperationalUnitRequest,
    current_user: AdminOnly,
    service: OperationalMasterService = Depends(_get_service),
) -> OperationalUnitResponse:
    unit = await service.update_unit(
        unit_id=unit_id,
        **body.model_dump(exclude_unset=True),
    )
    return OperationalUnitResponse.model_validate(unit, from_attributes=True)
