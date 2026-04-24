import hashlib
import secrets

import structlog

from src.application.dtos.auth_dtos import LoginCommand, LoginResult
from src.core.settings import settings
from src.domain.exceptions import AccountInactiveException, AccountLockedException, UnauthorizedException
from src.domain.repositories.user_repository import UserRepository
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.security.jwt_service import create_access_token
from src.infrastructure.security.password_service import verify_password

logger = structlog.get_logger(__name__)


class LoginUseCase:
    def __init__(self, user_repository: UserRepository) -> None:
        self._user_repo = user_repository

    async def execute(self, command: LoginCommand) -> LoginResult:
        user = await self._user_repo.find_by_email(command.email)

        # Validação com mensagem genérica: não revelamos se o email existe
        if user is None or not verify_password(command.password, user.password_hash):
            if user is not None:
                user.record_failed_login()
                await self._user_repo.save(user)
            raise UnauthorizedException("Credenciais inválidas")

        if user.is_locked:
            raise AccountLockedException("Conta temporariamente bloqueada. Tente novamente mais tarde.")

        if not user.is_active:
            raise AccountInactiveException("Conta inativa ou pendente de verificação.")

        access_token = create_access_token(str(user.id), user.role.value)
        refresh_token = secrets.token_urlsafe(64)
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

        redis = get_redis()
        await redis.setex(
            f"session:refresh:{token_hash}",
            settings.jwt_refresh_expire_seconds,
            str(user.id),
        )

        user.record_successful_login()
        await self._user_repo.save(user)

        logger.info("user.login", user_id=str(user.id), ip=command.ip_address)

        return LoginResult(access_token=access_token, refresh_token=refresh_token)
