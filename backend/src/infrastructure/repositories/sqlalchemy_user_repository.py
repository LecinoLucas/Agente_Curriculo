from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole, UserStatus
from src.domain.repositories.user_repository import UserRepository
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.base_soft_delete_repository import BaseSoftDeleteRepository


class SQLAlchemyUserRepository(UserRepository, BaseSoftDeleteRepository[UserModel]):
    def __init__(self, session: AsyncSession) -> None:
        BaseSoftDeleteRepository.__init__(self, session, UserModel)

    async def find_by_id(self, user_id: UUID) -> Optional[User]:
        result = await self._session.execute(
            sa.select(UserModel).where(
                UserModel.id == user_id,
                UserModel.deleted_at.is_(None),
            )
        )
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def find_by_email(self, email: str) -> Optional[User]:
        result = await self._session.execute(
            sa.select(UserModel).where(
                UserModel.email == email.lower().strip(),
                UserModel.deleted_at.is_(None),
            )
        )
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def save(self, user: User) -> User:
        result = await self._session.execute(
            sa.select(UserModel).where(UserModel.id == user.id)
        )
        existing = result.scalar_one_or_none()

        if existing is None:
            model = self._to_model(user)
            self._session.add(model)
        else:
            self._update_model(existing, user)

        await self._session.flush()
        return user

    async def exists_by_email(self, email: str) -> bool:
        result = await self._session.execute(
            sa.select(sa.exists().where(
                UserModel.email == email.lower().strip(),
                UserModel.deleted_at.is_(None),
            ))
        )
        return bool(result.scalar())

    @staticmethod
    def _to_entity(model: UserModel) -> User:
        return User(
            id=model.id,
            email=model.email,
            password_hash=model.password_hash,
            role=UserRole(model.role),
            status=UserStatus(model.status),
            full_name=model.full_name,
            created_at=model.created_at,
            updated_at=model.updated_at,
            email_verified_at=model.email_verified_at,
            avatar_url=model.avatar_url,
            must_change_password=model.must_change_password,
            last_login_at=model.last_login_at,
            login_count=model.login_count,
            failed_login_count=model.failed_login_count,
            locked_until=model.locked_until,
            deleted_at=model.deleted_at,
        )

    @staticmethod
    def _to_model(user: User) -> UserModel:
        return UserModel(
            id=user.id,
            email=user.email,
            password_hash=user.password_hash,
            role=user.role.value,
            status=user.status.value,
            full_name=user.full_name,
            email_verified_at=user.email_verified_at,
            avatar_url=user.avatar_url,
            must_change_password=user.must_change_password,
            last_login_at=user.last_login_at,
            login_count=user.login_count,
            failed_login_count=user.failed_login_count,
            locked_until=user.locked_until,
            created_at=user.created_at,
            updated_at=user.updated_at,
            deleted_at=user.deleted_at,
        )

    @staticmethod
    def _update_model(model: UserModel, user: User) -> None:
        model.email = user.email
        model.password_hash = user.password_hash
        model.role = user.role.value
        model.status = user.status.value
        model.full_name = user.full_name
        model.email_verified_at = user.email_verified_at
        model.avatar_url = user.avatar_url
        model.must_change_password = user.must_change_password
        model.last_login_at = user.last_login_at
        model.login_count = user.login_count
        model.failed_login_count = user.failed_login_count
        model.locked_until = user.locked_until
        model.updated_at = datetime.now(timezone.utc)
        model.deleted_at = user.deleted_at
