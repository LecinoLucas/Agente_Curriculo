from typing import Annotated
from uuid import UUID

from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.domain.exceptions import ForbiddenException, UnauthorizedException
from src.infrastructure.database.connection import get_db_session
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.jwt_service import decode_access_token

_bearer = HTTPBearer(auto_error=False)


async def get_db(session: AsyncSession = Depends(get_db_session)) -> AsyncSession:
    return session


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token não fornecido")

    try:
        payload = decode_access_token(credentials.credentials)
    except UnauthorizedException as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)

    user_id = UUID(payload["sub"])
    repo = SQLAlchemyUserRepository(db)
    user = await repo.find_by_id(user_id)

    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inválido")

    # Disponibiliza user_id para o middleware de auditoria
    request.state.user_id = user.id
    return user


def require_roles(*roles: UserRole):
    """Factory de dependência para controle de acesso baseado em role."""

    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão insuficiente para este recurso",
            )
        return current_user

    return _check


# Aliases para uso nos routers
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminOnly = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
RecruiterOrAdmin = Annotated[User, Depends(require_roles(UserRole.RECRUITER, UserRole.ADMIN))]
InternalUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.VIEWER))]
