from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.interface.api.dependencies import AdminOnly, InternalUser, RecruiterOrAdmin, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.skill_catalog_schemas import (
    ArchiveSkillRequest,
    CreateSkillRequest,
    SkillCatalogResponse,
    UpdateSkillRequest,
)
from src.application.services.audit_service import AuditService
from src.application.services.skill_catalog_service import SkillCatalogService
from src.infrastructure.repositories.sqlalchemy_skill_catalog_repository import SQLAlchemySkillCatalogRepository

router = APIRouter(prefix="/skills", tags=["skills"])

def _get_service(db: AsyncSession = Depends(get_db)) -> SkillCatalogService:
    repository = SQLAlchemySkillCatalogRepository(db)
    return SkillCatalogService(repository, audit_service=AuditService(db))

@router.get("", response_model=PaginatedResponse[SkillCatalogResponse])
async def list_skills(
    current_user: InternalUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    catalog_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    archived: bool = False,
    service: SkillCatalogService = Depends(_get_service),
) -> PaginatedResponse[SkillCatalogResponse]:
    items, total = await service.list_skills(
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        catalog_type=catalog_type,
        is_active=is_active,
        archived=archived,
    )
    return PaginatedResponse(
        data=[SkillCatalogResponse.model_validate(item, from_attributes=True) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 1,
    )

@router.post("", response_model=SkillCatalogResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    body: CreateSkillRequest,
    current_user: RecruiterOrAdmin,
    service: SkillCatalogService = Depends(_get_service),
) -> SkillCatalogResponse:
    skill = await service.create_skill(
        name=body.name,
        category=body.category,
        description=body.description,
        aliases=body.aliases,
        created_by=current_user.id,
    )
    return SkillCatalogResponse.model_validate(skill, from_attributes=True)

@router.patch("/{skill_id}", response_model=SkillCatalogResponse)
async def update_skill(
    skill_id: UUID,
    body: UpdateSkillRequest,
    current_user: AdminOnly,
    service: SkillCatalogService = Depends(_get_service),
) -> SkillCatalogResponse:
    skill = await service.update_skill(
        skill_id=skill_id,
        name=body.name,
        category=body.category,
        description=body.description,
        aliases=body.aliases,
        updated_by=current_user.id,
    )
    return SkillCatalogResponse.model_validate(skill, from_attributes=True)

@router.patch("/{skill_id}/deactivate", response_model=SkillCatalogResponse)
async def deactivate_skill(
    skill_id: UUID,
    current_user: AdminOnly,
    service: SkillCatalogService = Depends(_get_service),
) -> SkillCatalogResponse:
    skill = await service.deactivate_skill(skill_id=skill_id, updated_by=current_user.id)
    return SkillCatalogResponse.model_validate(skill, from_attributes=True)

@router.patch("/{skill_id}/activate", response_model=SkillCatalogResponse)
async def activate_skill(
    skill_id: UUID,
    current_user: AdminOnly,
    service: SkillCatalogService = Depends(_get_service),
) -> SkillCatalogResponse:
    skill = await service.activate_skill(skill_id=skill_id, updated_by=current_user.id)
    return SkillCatalogResponse.model_validate(skill, from_attributes=True)

@router.patch("/{skill_id}/archive", response_model=SkillCatalogResponse)
async def archive_skill(
    skill_id: UUID,
    body: ArchiveSkillRequest,
    current_user: AdminOnly,
    service: SkillCatalogService = Depends(_get_service),
) -> SkillCatalogResponse:
    skill = await service.archive_skill(
        skill_id=skill_id,
        updated_by=current_user.id,
        reason=body.reason,
        note=body.note,
    )
    return SkillCatalogResponse.model_validate(skill, from_attributes=True)

@router.patch("/{skill_id}/restore", response_model=SkillCatalogResponse)
async def restore_skill(
    skill_id: UUID,
    current_user: AdminOnly,
    service: SkillCatalogService = Depends(_get_service),
) -> SkillCatalogResponse:
    skill = await service.restore_skill(skill_id=skill_id, updated_by=current_user.id)
    return SkillCatalogResponse.model_validate(skill, from_attributes=True)
