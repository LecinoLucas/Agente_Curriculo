from src.domain.entities.user import User
from src.domain.exceptions import ConflictException, UnauthorizedException
from src.domain.repositories.user_repository import UserRepository
from src.infrastructure.security.password_service import hash_password, verify_password


class PasswordReuseError(ConflictException):
    pass


class UserSecurityService:
    def __init__(self, repository: UserRepository) -> None:
        self._repository = repository

    async def change_my_password(
        self,
        current_user: User,
        *,
        current_password: str,
        new_password: str,
    ) -> User:
        if not verify_password(current_password, current_user.password_hash):
            raise UnauthorizedException("Senha atual inválida")

        if verify_password(new_password, current_user.password_hash):
            raise PasswordReuseError("A nova senha deve ser diferente da senha atual")

        current_user.set_password(
            hash_password(new_password),
            must_change_password=False,
        )
        return await self._repository.save(current_user)
