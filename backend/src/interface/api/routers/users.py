from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.user_dtos import CreateUserCommand
from src.application.services.user_admin_service import (
    CannotModifySelfError,
    InvalidUserTextError,
    UserAdminService,
    UserNotFoundError,
)
from src.application.services.user_profile_service import (
    InvalidProfileTextError,
    UserProfileService,
)
from src.application.use_cases.users.create_user import CreateUserUseCase
from src.core.settings import settings
from src.domain.exceptions import ConflictException
from src.infrastructure.repositories.sqlalchemy_user_admin_repository import SQLAlchemyUserAdminRepository
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.interface.api.dependencies import AdminOnly, CurrentUser, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.user_schemas import (
    CreateUserRequest,
    PatchMyProfileRequest,
    PatchUserRequest,
    UserResponse,
)

router = APIRouter(prefix="/users", tags=["users"])


def _user_admin_service(db: AsyncSession) -> UserAdminService:
    return UserAdminService(SQLAlchemyUserAdminRepository(db))


def _handle_user_admin_error(exc: Exception) -> None:
    if isinstance(exc, UserNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    if isinstance(exc, CannotModifySelfError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Não é possível modificar o próprio usuário nesta ação")
    if isinstance(exc, InvalidUserTextError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome não pode estar em branco")
    raise exc


def _handle_user_profile_error(exc: Exception) -> None:
    if isinstance(exc, InvalidProfileTextError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome não pode estar em branco")
    raise exc


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: CreateUserRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    use_case = CreateUserUseCase(SQLAlchemyUserRepository(db))
    try:
        result = await use_case.execute(
            CreateUserCommand(
                email=body.email,
                password=body.password,
                full_name=body.full_name,
                role=body.role,
            )
        )
    except ConflictException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)
    except Exception:
        await db.rollback()
        raise

    await db.commit()

    return UserResponse(
        id=result.id,
        email=result.email,
        full_name=result.full_name,
        role=result.role,
        status=result.status,
        real_ai_token_spend_enabled=settings.ALLOW_AI_TOKEN_SPEND,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser) -> UserResponse:
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        status=current_user.status,
        real_ai_token_spend_enabled=settings.ALLOW_AI_TOKEN_SPEND,
    )


@router.patch("/me", response_model=UserResponse)
async def patch_me(
    body: PatchMyProfileRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    service = UserProfileService(SQLAlchemyUserRepository(db))
    try:
        updated = await service.update_me(current_user, body.full_name)
        await db.commit()
        return UserResponse(
            id=updated.id,
            email=updated.email,
            full_name=updated.full_name,
            role=updated.role,
            status=updated.status,
            real_ai_token_spend_enabled=settings.ALLOW_AI_TOKEN_SPEND,
        )
    except Exception as exc:
        await db.rollback()
        _handle_user_profile_error(exc)
        raise


@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_users(
    current_user: AdminOnly,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, description="Busca por nome ou e-mail"),
    role: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[UserResponse]:
    users, total_items = await _user_admin_service(db).list(page, page_size, search, role)

    return PaginatedResponse[UserResponse](
        data=[UserResponse.model_validate(u) for u in users],
        total=total_items,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_items + page_size - 1) // page_size),
    )


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    try:
        return UserResponse.model_validate(await _user_admin_service(db).get(user_id))
    except Exception as exc:
        _handle_user_admin_error(exc)
        raise


@router.patch("/{user_id}", response_model=UserResponse)
async def patch_user(
    user_id: UUID,
    body: PatchUserRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    try:
        user = await _user_admin_service(db).patch(user_id, body)
        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)
    except Exception as exc:
        await db.rollback()
        _handle_user_admin_error(exc)
        raise


@router.patch("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    try:
        user = await _user_admin_service(db).activate(user_id)
        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)
    except Exception as exc:
        await db.rollback()
        _handle_user_admin_error(exc)
        raise


@router.patch("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    try:
        user = await _user_admin_service(db).deactivate(user_id, current_user)
        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)
    except Exception as exc:
        await db.rollback()
        _handle_user_admin_error(exc)
        raise


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await _user_admin_service(db).soft_delete(user_id, current_user)
        await db.commit()
    except Exception as exc:
        await db.rollback()
        _handle_user_admin_error(exc)
        raise
