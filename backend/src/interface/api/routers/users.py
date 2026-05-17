from datetime import datetime, timezone
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.user_dtos import CreateUserCommand
from src.application.services.user_admin_service import (
    CannotModifySelfError,
    InvalidUserTextError,
    UserAdminService,
    UserNotFoundError,
)
from src.application.services.user_profile_service import (
    InvalidAvatarError,
    InvalidProfileTextError,
    UserProfileService,
)
from src.application.services.user_security_service import PasswordReuseError, UserSecurityService
from src.application.use_cases.users.create_user import CreateUserUseCase
from src.core.settings import settings
from src.domain.entities.user import DEFAULT_PREFERRED_THEME, User, UserPreferredTheme, UserRole, UserStatus
from src.domain.exceptions import ConflictException, UnauthorizedException
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_user_admin_repository import SQLAlchemyUserAdminRepository
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.interface.api.dependencies import AdminOnly, CurrentUser, RecruiterOrAdmin, get_db
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.user_schemas import (
    ChangeMyPasswordRequest,
    CreateUserRequest,
    ManagerListItemResponse,
    ManagerListResponse,
    PatchMyProfileRequest,
    PatchUserRequest,
    UpdateMyPreferencesRequest,
    UserPreferencesResponse,
    UserResponse,
    UserStatsResponse,
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
    if isinstance(exc, ConflictException):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)
    raise exc


def _handle_user_profile_error(exc: Exception) -> None:
    if isinstance(exc, InvalidProfileTextError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Nome não pode estar em branco")
    raise exc


def _preferred_theme_or_default(user: User) -> UserPreferredTheme:
    return user.preferred_theme or DEFAULT_PREFERRED_THEME


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        real_ai_token_spend_enabled=settings.ALLOW_AI_TOKEN_SPEND,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        avatar_url=user.avatar_url,
        preferred_theme=_preferred_theme_or_default(user),
    )


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
                temporary_password=body.temporary_password,
                full_name=body.full_name,
                role=body.role,
                is_active=body.is_active,
                must_change_password=body.must_change_password,
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
        must_change_password=result.must_change_password,
        last_login_at=None,
        created_at=None,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser) -> UserResponse:
    return _user_response(current_user)


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
        return _user_response(updated)
    except Exception as exc:
        await db.rollback()
        _handle_user_profile_error(exc)
        raise


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    current_user: CurrentUser,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    service = UserProfileService(SQLAlchemyUserRepository(db))
    try:
        content = await file.read()
        content_type = file.content_type or "application/octet-stream"
        updated = await service.upload_avatar(current_user, content, content_type)
        await db.commit()
        return _user_response(updated)
    except InvalidAvatarError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        await db.rollback()
        raise


@router.delete("/me/avatar", response_model=UserResponse)
async def delete_avatar(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    repo = SQLAlchemyUserRepository(db)
    current_user.avatar_url = None
    current_user.updated_at = datetime.now(timezone.utc)
    updated = await repo.save(current_user)
    await db.commit()
    return _user_response(updated)


@router.patch("/me/password", response_model=UserResponse)
async def change_my_password(
    body: ChangeMyPasswordRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    service = UserSecurityService(SQLAlchemyUserRepository(db))
    try:
        updated = await service.change_my_password(
            current_user,
            current_password=body.current_password,
            new_password=body.new_password,
        )
        await db.commit()
        return _user_response(updated)
    except UnauthorizedException as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)
    except PasswordReuseError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except Exception:
        await db.rollback()
        raise


@router.patch("/me/preferences", response_model=UserPreferencesResponse)
async def update_my_preferences(
    body: UpdateMyPreferencesRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> UserPreferencesResponse:
    repo = SQLAlchemyUserRepository(db)
    current_user.preferred_theme = body.preferred_theme
    current_user.updated_at = datetime.now(timezone.utc)
    updated = await repo.save(current_user)
    await db.commit()
    return UserPreferencesResponse(preferred_theme=_preferred_theme_or_default(updated))


@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_users(
    current_user: AdminOnly,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, description="Busca por nome ou e-mail"),
    role: str | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[UserResponse]:
    users, total_items = await _user_admin_service(db).list(page, page_size, search, role, status)

    return PaginatedResponse[UserResponse](
        data=[UserResponse.model_validate(u) for u in users],
        total=total_items,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total_items + page_size - 1) // page_size),
    )


@router.get("/stats", response_model=UserStatsResponse)
async def get_user_stats(
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserStatsResponse:
    stats = await _user_admin_service(db).get_stats()
    return UserStatsResponse(**stats)


@router.get("/managers", response_model=ManagerListResponse)
async def list_managers(
    current_user: RecruiterOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ManagerListResponse:
    result = await db.execute(
        sa.select(
            UserModel.id,
            UserModel.full_name,
            UserModel.email,
            UserModel.role,
        )
        .where(
            UserModel.role == UserRole.MANAGER.value,
            UserModel.status == UserStatus.ACTIVE.value,
            UserModel.deleted_at.is_(None),
        )
        .order_by(UserModel.full_name.asc(), UserModel.email.asc())
    )
    rows = result.fetchall()
    return ManagerListResponse(
        managers=[
            ManagerListItemResponse(
                id=row.id,
                name=row.full_name,
                email=row.email,
                role=UserRole(row.role),
            )
            for row in rows
        ]
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
