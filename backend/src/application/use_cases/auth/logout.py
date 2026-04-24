import hashlib

import structlog

from src.application.dtos.auth_dtos import LogoutCommand
from src.infrastructure.cache.redis_client import get_redis

logger = structlog.get_logger(__name__)


class LogoutUseCase:
    async def execute(self, command: LogoutCommand) -> None:
        redis = get_redis()
        token_hash = hashlib.sha256(command.refresh_token.encode()).hexdigest()
        await redis.delete(f"session:refresh:{token_hash}")
        logger.info("user.logout", user_id=str(command.user_id))
