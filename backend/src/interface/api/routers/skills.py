from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.skill_service import (
    InvalidSkillTextError,
    SkillNameConflictError,
    SkillNotFoundError,
    SkillService,
)
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository
from src.interface.api.dependencies import AdminOnly, CurrentUser, get_db
from src.interface.api.schemas.skill_schemas import CreateSkillRequest, SkillResponse, UpdateSkillRequest

router = APIRouter(prefix="/skills", tags=["skills"])


def _skill_service(db: AsyncSession) -> SkillService:
    return SkillService(SQLAlchemySkillRepository(db))


def _handle_skill_service_error(exc: Exception) -> None:
    if isinstance(exc, SkillNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill não encontrada")
    if isinstance(exc, SkillNameConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Skill com este nome já existe")
    if isinstance(exc, InvalidSkillTextError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome não pode estar em branco")
    raise exc


@router.post("", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    body: CreateSkillRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> SkillResponse:
    try:
        skill = await _skill_service(db).create(body)
        await db.commit()
        await db.refresh(skill)
        return SkillResponse.model_validate(skill)
    except Exception as exc:
        await db.rollback()
        _handle_skill_service_error(exc)
        raise


@router.get("", response_model=list[SkillResponse])
async def list_skills(
    current_user: CurrentUser,
    search: str | None = Query(default=None, description="Busca por nome ou alias"),
    category: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[SkillResponse]:
    skills = await _skill_service(db).list(search, category, limit)
    return [SkillResponse.model_validate(s) for s in skills]


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(
    skill_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> SkillResponse:
    try:
        return SkillResponse.model_validate(await _skill_service(db).get(skill_id))
    except Exception as exc:
        _handle_skill_service_error(exc)
        raise


@router.patch("/{skill_id}", response_model=SkillResponse)
async def update_skill(
    skill_id: UUID,
    body: UpdateSkillRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> SkillResponse:
    try:
        skill = await _skill_service(db).update(skill_id, body)
        await db.commit()
        await db.refresh(skill)
        return SkillResponse.model_validate(skill)
    except Exception as exc:
        await db.rollback()
        _handle_skill_service_error(exc)
        raise


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _skill_service(db).soft_delete(skill_id)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_skill_service_error(exc)
        raise
