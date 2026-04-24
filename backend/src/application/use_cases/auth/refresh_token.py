import hashlib
import secrets
from uuid import UUID

import structlog

from src.application.dtos.auth_dtos import RefreshTokenCommand, RefreshTokenResult
from src.core.settings import settings
from src.domain.exceptions import UnauthorizedException
from src.domain.repositories.user_repository import UserRepository
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.security.jwt_service import create_access_token

logger = structlog.get_logger(__name__)


class RefreshTokenUseCase:
    def __init__(self, user_repository: UserRepository) -> None:
        self._user_repo = user_repository

    async def execute(self, command: RefreshTokenCommand) -> RefreshTokenResult:
        redis = get_redis()
        token_hash = hashlib.sha256(command.refresh_token.encode()).hexdigest()
        redis_key = f"session:refresh:{token_hash}"

        user_id = await redis.get(redis_key)
        if not user_id:
            raise UnauthorizedException("Refresh token inválido ou expirado")

        user = await self._user_repo.find_by_id(UUID(str(user_id)))
        if user is None or not user.is_active:
            await redis.delete(redis_key)
            raise UnauthorizedException("Usuário não encontrado ou inativo")

        # Refresh Token Rotation: invalida o token atual e emite um novo par
        await redis.delete(redis_key)

        new_access_token = create_access_token(str(user.id), user.role.value)
        new_refresh_token = secrets.token_urlsafe(64)
        new_token_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()

        await redis.setex(
            f"session:refresh:{new_token_hash}",
            settings.jwt_refresh_expire_seconds,
            str(user.id),
        )

        logger.info("user.token_refreshed", user_id=str(user.id))

        return RefreshTokenResult(access_token=new_access_token, refresh_token=new_refresh_token)
