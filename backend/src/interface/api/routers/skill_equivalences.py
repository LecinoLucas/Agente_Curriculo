from fastapi import APIRouter, HTTPException, Query, status

from src.application.services.skill_equivalence_service import (
    InvalidSkillEquivalenceGroupError,
    SkillEquivalenceGroupConflictError,
    SkillEquivalenceGroupNotFoundError,
    SkillEquivalenceService,
)
from src.interface.api.dependencies import AdminOnly, CurrentUser
from src.interface.api.schemas.skill_schemas import (
    CreateSkillEquivalenceGroupRequest,
    SkillEquivalenceGroupResponse,
    UpdateSkillEquivalenceGroupRequest,
)

router = APIRouter(prefix="/skill-equivalences", tags=["skill-equivalences"])


def _service() -> SkillEquivalenceService:
    return SkillEquivalenceService()


def _handle_catalog_error(exc: Exception) -> None:
    if isinstance(exc, SkillEquivalenceGroupNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equivalência não encontrada")
    if isinstance(exc, SkillEquivalenceGroupConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Equivalência com este nome já existe")
    if isinstance(exc, InvalidSkillEquivalenceGroupError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Equivalência inválida")
    raise exc


@router.get("", response_model=list[SkillEquivalenceGroupResponse])
async def list_skill_equivalences(
    current_user: CurrentUser,
    search: str | None = Query(default=None, description="Busca por nome, alias ou domínio"),
    domain: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[SkillEquivalenceGroupResponse]:
    return [SkillEquivalenceGroupResponse(**item) for item in _service().list_groups(search, domain, limit)]


@router.get("/{group_id}", response_model=SkillEquivalenceGroupResponse)
async def get_skill_equivalence(
    group_id: str,
    current_user: CurrentUser,
) -> SkillEquivalenceGroupResponse:
    try:
        return SkillEquivalenceGroupResponse(**_service().get_group(group_id))
    except Exception as exc:
        _handle_catalog_error(exc)
        raise


@router.post("", response_model=SkillEquivalenceGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_skill_equivalence(
    body: CreateSkillEquivalenceGroupRequest,
    current_user: AdminOnly,
) -> SkillEquivalenceGroupResponse:
    try:
        return SkillEquivalenceGroupResponse(**_service().create_group(body.model_dump(exclude_none=True)))
    except Exception as exc:
        _handle_catalog_error(exc)
        raise


@router.patch("/{group_id}", response_model=SkillEquivalenceGroupResponse)
async def update_skill_equivalence(
    group_id: str,
    body: UpdateSkillEquivalenceGroupRequest,
    current_user: AdminOnly,
) -> SkillEquivalenceGroupResponse:
    try:
        return SkillEquivalenceGroupResponse(**_service().update_group(group_id, body.model_dump(exclude_unset=True)))
    except Exception as exc:
        _handle_catalog_error(exc)
        raise


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill_equivalence(
    group_id: str,
    current_user: AdminOnly,
) -> None:
    try:
        _service().delete_group(group_id)
    except Exception as exc:
        _handle_catalog_error(exc)
        raise
