import structlog

from src.application.dtos.user_dtos import CreateUserCommand, UserResult
from src.domain.entities.user import User, UserRole
from src.domain.exceptions import ConflictException
from src.domain.repositories.user_repository import UserRepository
from src.infrastructure.security.password_service import hash_password

logger = structlog.get_logger(__name__)


class CandidateUserNotAllowedError(ConflictException):
    """Raised when attempting to create a User with role="candidate" without Candidate portal."""
    pass


class CreateUserUseCase:
    def __init__(self, user_repository: UserRepository) -> None:
        self._user_repo = user_repository

    async def execute(self, command: CreateUserCommand) -> UserResult:
        """
        Create a new internal User.

        Guardrail (Phase 20.3):
        ──────────────────────
        Users with role="candidate" cannot be created via this endpoint.
        role="candidate" represents candidate portal access and should be linked
        to Candidate via CandidateAccount (Phase 20.3+), not created independently.

        Allowed roles: ADMIN, RECRUITER, VIEWER
        Blocked role: CANDIDATE (reserved for portal)

        See: docs/user-candidate-boundary.md
        """
        # GUARDRAIL: Block role="candidate" creation
        if command.role == UserRole.CANDIDATE:
            raise CandidateUserNotAllowedError(
                "Não é permitido criar usuários com role=candidate via API administrativo. "
                "O vínculo com candidato será feito via portal do candidato (Phase 20.3+)."
            )

        if await self._user_repo.exists_by_email(command.email):
            raise ConflictException("Email já está em uso")

        user = User.create(
            email=command.email,
            password_hash=hash_password(command.temporary_password),
            full_name=command.full_name,
            role=command.role,
            is_active=command.is_active,
            must_change_password=command.must_change_password,
        )

        await self._user_repo.save(user)
        logger.info("user.created", user_id=str(user.id), email=user.email, role=user.role.value)

        return UserResult(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=user.role,
            status=user.status,
            must_change_password=user.must_change_password,
        )
