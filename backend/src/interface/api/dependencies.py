import logging
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
from src.application.services.candidate_profile_completion_service import (
    CandidateProfileCompletionService,
    CandidateProfileNotFoundError,
)
from src.application.services.candidate_portal_auth_service import (
    CANDIDATE_PORTAL_COOKIE_NAME,
    CandidatePortalSession,
    CandidatePortalAuthService,
    CandidatePortalSessionError,
)

logger = logging.getLogger(__name__)

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
            logger.warning(
                "access_denied_insufficient_role",
                extra={
                    "user_id": str(current_user.id),
                    "user_role": current_user.role.value,
                    "required_roles": [r.value for r in roles],
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permissão insuficiente para este recurso",
            )
        return current_user

    return _check


# Aliases para uso nos routers

# Single role
CurrentUser = Annotated[User, Depends(get_current_user)]
AdminOnly = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
HrOnly = Annotated[User, Depends(require_roles(UserRole.HR))]
ManagerOnly = Annotated[User, Depends(require_roles(UserRole.MANAGER))]

# Multi-role combinations
RecruiterOrAdmin = Annotated[User, Depends(require_roles(UserRole.RECRUITER, UserRole.ADMIN))]
HrOrAdmin = Annotated[User, Depends(require_roles(UserRole.HR, UserRole.ADMIN))]
ManagerOrAdmin = Annotated[User, Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN))]

# Compatibility: Temporary dual access (RECRUITER still has pre_admission/admission access)
RecruiterHrOrAdmin = Annotated[User, Depends(require_roles(UserRole.RECRUITER, UserRole.HR, UserRole.ADMIN))]
ManagerRecruiterOrAdmin = Annotated[User, Depends(require_roles(UserRole.MANAGER, UserRole.RECRUITER, UserRole.ADMIN))]

# Internal users: all internal roles
InternalUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.RECRUITER, UserRole.VIEWER, UserRole.HR, UserRole.MANAGER))]


async def get_current_candidate_session(
    request: Request,
    candidate_portal_token: str | None = Cookie(default=None, alias=CANDIDATE_PORTAL_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
):
    service = CandidatePortalAuthService(db)
    try:
        session = await service.authenticate(candidate_portal_token)
    except CandidatePortalSessionError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão do candidato inválida ou expirada",
        )

    request.state.candidate_id = session.candidate_id
    return session


async def get_optional_candidate_session(
    request: Request,
    candidate_portal_token: str | None = Cookie(default=None, alias=CANDIDATE_PORTAL_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalSession | None:
    if not candidate_portal_token:
        return None

    service = CandidatePortalAuthService(db)
    try:
        session = await service.authenticate(candidate_portal_token)
    except CandidatePortalSessionError:
        return None

    request.state.candidate_id = session.candidate_id
    return session


def candidate_profile_incomplete_detail(missing_fields: list[str]) -> dict:
    return {
        "code": "candidate_profile_incomplete",
        "message": "Complete seu cadastro para acessar o portal do candidato.",
        "missing_fields": missing_fields,
        "redirect_to": "/candidato/cadastro",
    }


def raise_candidate_profile_incomplete(missing_fields: list[str]) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=candidate_profile_incomplete_detail(missing_fields),
    )


async def require_complete_candidate_profile(
    request: Request,
    candidate_session: CandidatePortalSession = Depends(get_current_candidate_session),
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalSession:
    try:
        state = await CandidateProfileCompletionService(db).get_completion_state(candidate_session.candidate_id)
    except CandidateProfileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão do candidato inválida ou expirada",
        )

    if state.missing_fields:
        raise_candidate_profile_incomplete(state.missing_fields)

    request.state.candidate_id = candidate_session.candidate_id
    return candidate_session


CurrentCandidateSession = Annotated[CandidatePortalSession, Depends(get_current_candidate_session)]
CurrentCompleteCandidateSession = Annotated[CandidatePortalSession, Depends(require_complete_candidate_profile)]
OptionalCandidateSession = Annotated[CandidatePortalSession | None, Depends(get_optional_candidate_session)]
