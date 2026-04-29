from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.dtos.auth_dtos import LoginCommand, LogoutCommand, RefreshTokenCommand
from src.application.use_cases.auth.login import LoginUseCase
from src.application.use_cases.auth.logout import LogoutUseCase
from src.application.use_cases.auth.refresh_token import RefreshTokenUseCase
from src.core.settings import settings
from src.domain.exceptions import AccountInactiveException, AccountLockedException, UnauthorizedException
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.interface.api.dependencies import CurrentUser, get_db
from src.interface.api.schemas.auth_schemas import LoginRequest, RefreshTokenRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_NAME = "refresh_token"
_COOKIE_MAX_AGE = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,           # não acessível via JavaScript
        secure=settings.is_production,
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
        path="/api/v1/auth",     # cookie restrito ao path de auth
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    use_case = LoginUseCase(SQLAlchemyUserRepository(db))
    try:
        result = await use_case.execute(
            LoginCommand(
                email=body.email,
                password=body.password,
                ip_address=request.client.host if request.client else "unknown",
                user_agent=request.headers.get("user-agent", ""),
            )
        )
    except (UnauthorizedException, AccountLockedException, AccountInactiveException) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)

    _set_refresh_cookie(response, result.refresh_token)
    return TokenResponse(
        access_token=result.access_token,
        must_change_password=result.must_change_password,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token ausente")

    use_case = RefreshTokenUseCase(SQLAlchemyUserRepository(db))
    try:
        result = await use_case.execute(
            RefreshTokenCommand(
                refresh_token=refresh_token,
                ip_address=request.client.host if request.client else "unknown",
                user_agent=request.headers.get("user-agent", ""),
            )
        )
    except UnauthorizedException as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)

    _set_refresh_cookie(response, result.refresh_token)
    return TokenResponse(
        access_token=result.access_token,
        must_change_password=result.must_change_password,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    current_user: CurrentUser,
    refresh_token: str | None = Cookie(default=None, alias=_COOKIE_NAME),
) -> None:
    if refresh_token:
        use_case = LogoutUseCase()
        await use_case.execute(LogoutCommand(refresh_token=refresh_token, user_id=current_user.id))

    response.delete_cookie(key=_COOKIE_NAME, path="/api/v1/auth")
