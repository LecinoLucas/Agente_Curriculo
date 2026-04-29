from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.user_admin_service import (
    CannotModifySelfError,
    InvalidUserTextError,
    UserAdminService,
    UserNotFoundError,
)
from src.domain.exceptions import ConflictException
from src.infrastructure.repositories.sqlalchemy_user_admin_repository import SQLAlchemyUserAdminRepository
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.user_schemas import ResetUserPasswordRequest, UserResponse

router = APIRouter(prefix="/internal-users", tags=["internal-users"])


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


@router.patch("/{user_id}/password", response_model=UserResponse)
async def reset_internal_user_password(
    user_id: UUID,
    body: ResetUserPasswordRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    try:
        user = await _user_admin_service(db).reset_password(user_id, body)
        await db.commit()
        await db.refresh(user)
        return UserResponse.model_validate(user)
    except Exception as exc:
        await db.rollback()
        _handle_user_admin_error(exc)
        raise
