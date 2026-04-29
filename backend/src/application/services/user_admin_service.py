from datetime import datetime, timezone
from uuid import UUID

from src.domain.entities.user import User, UserStatus
from src.domain.exceptions import ConflictException
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_user_admin_repository import SQLAlchemyUserAdminRepository, UserStats
from src.interface.api.schemas.user_schemas import PatchUserRequest, ResetUserPasswordRequest


class UserNotFoundError(Exception):
    pass


class CannotModifySelfError(Exception):
    pass


class InvalidUserTextError(Exception):
    pass


class UserAdminService:
    def __init__(self, repository: SQLAlchemyUserAdminRepository) -> None:
        self._repository = repository

    async def get_stats(self) -> UserStats:
        return await self._repository.get_stats()

    async def list(
        self,
        page: int,
        page_size: int,
        search: str | None,
        role: str | None,
        status: str | None = None,
    ) -> tuple[list[UserModel], int]:
        return await self._repository.list_active(page, page_size, search, role, status)

    async def get(self, user_id: UUID) -> UserModel:
        user = await self._repository.find_active_by_id(user_id)
        if user is None:
            raise UserNotFoundError
        return user

    async def patch(self, user_id: UUID, body: PatchUserRequest) -> UserModel:
        user = await self.get(user_id)

        if body.email is not None:
            email = body.email.lower().strip()
            if email != user.email and await self._repository.exists_active_by_email(email, exclude_user_id=user.id):
                raise ConflictException("Email já está em uso")
            user.email = email
        if body.role is not None:
            user.role = body.role.value
        if body.is_active is not None:
            user.status = UserStatus.ACTIVE.value if body.is_active else UserStatus.INACTIVE.value
            if body.is_active and user.email_verified_at is None:
                user.email_verified_at = datetime.now(timezone.utc)
        if body.full_name is not None:
            user.full_name = self._clean_required_text(body.full_name)

        user.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(user)

    async def reset_password(self, user_id: UUID, body: ResetUserPasswordRequest) -> UserModel:
        user = await self.get(user_id)
        user.password_hash = hash_password(body.temporary_password)
        user.must_change_password = body.must_change_password
        user.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(user)

    async def activate(self, user_id: UUID) -> UserModel:
        user = await self.get(user_id)
        now = datetime.now(timezone.utc)
        user.status = UserStatus.ACTIVE.value
        if user.email_verified_at is None:
            user.email_verified_at = now
        user.updated_at = now
        return await self._repository.save(user)

    async def deactivate(self, user_id: UUID, current_user: User) -> UserModel:
        self._ensure_not_self(user_id, current_user)
        user = await self.get(user_id)
        user.status = UserStatus.INACTIVE.value
        user.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(user)

    async def soft_delete(self, user_id: UUID, current_user: User) -> None:
        self._ensure_not_self(user_id, current_user)
        user = await self.get(user_id)
        now = datetime.now(timezone.utc)
        user.status = UserStatus.INACTIVE.value
        user.deleted_at = now
        user.updated_at = now
        await self._repository.save(user)

    @staticmethod
    def _ensure_not_self(user_id: UUID, current_user: User) -> None:
        if user_id == current_user.id:
            raise CannotModifySelfError

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidUserTextError
        return cleaned
