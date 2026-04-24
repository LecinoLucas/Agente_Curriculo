import structlog

from src.application.dtos.user_dtos import CreateUserCommand, UserResult
from src.domain.entities.user import User
from src.domain.exceptions import ConflictException
from src.domain.repositories.user_repository import UserRepository
from src.infrastructure.security.password_service import hash_password

logger = structlog.get_logger(__name__)


class CreateUserUseCase:
    def __init__(self, user_repository: UserRepository) -> None:
        self._user_repo = user_repository

    async def execute(self, command: CreateUserCommand) -> UserResult:
        if await self._user_repo.exists_by_email(command.email):
            raise ConflictException("Email já está em uso")

        user = User.create(
            email=command.email,
            password_hash=hash_password(command.password),
            full_name=command.full_name,
            role=command.role,
        )

        await self._user_repo.save(user)
        logger.info("user.created", user_id=str(user.id), email=user.email, role=user.role.value)

        return UserResult(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            status=user.status,
        )
