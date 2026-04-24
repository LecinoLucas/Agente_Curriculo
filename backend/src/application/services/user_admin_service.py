from datetime import datetime, timezone
from uuid import UUID

from src.domain.entities.user import User, UserStatus
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_user_admin_repository import SQLAlchemyUserAdminRepository
from src.interface.api.schemas.user_schemas import PatchUserRequest


class UserNotFoundError(Exception):
    pass


class CannotModifySelfError(Exception):
    pass


class InvalidUserTextError(Exception):
    pass


class UserAdminService:
    def __init__(self, repository: SQLAlchemyUserAdminRepository) -> None:
        self._repository = repository

    async def list(
        self,
        page: int,
        page_size: int,
        search: str | None,
        role: str | None,
    ) -> tuple[list[UserModel], int]:
        return await self._repository.list_active(page, page_size, search, role)

    async def get(self, user_id: UUID) -> UserModel:
        user = await self._repository.find_active_by_id(user_id)
        if user is None:
            raise UserNotFoundError
        return user

    async def patch(self, user_id: UUID, body: PatchUserRequest) -> UserModel:
        user = await self.get(user_id)

        if body.role is not None:
            user.role = body.role.value
        if body.status is not None:
            user.status = body.status.value
        if body.full_name is not None:
            user.full_name = self._clean_required_text(body.full_name)

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
