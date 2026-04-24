from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.user_model import UserModel


class SQLAlchemyUserAdminRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_active(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        role: str | None = None,
    ) -> tuple[list[UserModel], int]:
        filters = [UserModel.deleted_at.is_(None)]
        if search:
            term = f"%{search.lower().strip()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(UserModel.full_name).like(term),
                    sa.func.lower(UserModel.email).like(term),
                )
            )
        if role:
            filters.append(UserModel.role == role)

        total = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count()).select_from(UserModel).where(*filters)
                )
            )
            or 0
        )
        offset = (page - 1) * page_size
        result = await self._session.execute(
            sa.select(UserModel)
            .where(*filters)
            .order_by(UserModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def find_active_by_id(self, user_id: UUID) -> UserModel | None:
        return await self._session.scalar(
            sa.select(UserModel).where(
                UserModel.id == user_id,
                UserModel.deleted_at.is_(None),
            )
        )

    async def save(self, user: UserModel) -> UserModel:
        await self._session.flush()
        await self._session.refresh(user)
        return user
