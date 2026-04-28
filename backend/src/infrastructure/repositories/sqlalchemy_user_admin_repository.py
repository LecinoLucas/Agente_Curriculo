from typing import TypedDict
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.user_model import UserModel


class UserStats(TypedDict):
    total_users: int
    active_users: int
    inactive_users: int
    suspended_users: int
    pending_users: int
    admins: int
    recruiters: int
    viewers: int
    candidates: int


class SQLAlchemyUserAdminRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_active(
        self,
        page: int,
        page_size: int,
        search: str | None = None,
        role: str | None = None,
        status: str | None = None,
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
        if status:
            filters.append(UserModel.status == status)

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

    async def get_stats(self) -> UserStats:
        not_deleted = UserModel.deleted_at.is_(None)

        def _count(cond: sa.ColumnElement) -> sa.Function:  # type: ignore[type-arg]
            return sa.func.count(sa.case((sa.and_(not_deleted, cond), 1)))

        row = (
            await self._session.execute(
                sa.select(
                    sa.func.count(sa.case((not_deleted, 1))).label("total_users"),
                    _count(UserModel.status == "active").label("active_users"),
                    _count(UserModel.status == "inactive").label("inactive_users"),
                    _count(UserModel.status == "suspended").label("suspended_users"),
                    _count(UserModel.status == "pending_verification").label("pending_users"),
                    _count(UserModel.role == "admin").label("admins"),
                    _count(UserModel.role == "recruiter").label("recruiters"),
                    _count(UserModel.role == "viewer").label("viewers"),
                    _count(UserModel.role == "candidate").label("candidates"),
                ).select_from(UserModel)
            )
        ).one()

        return UserStats(
            total_users=row.total_users,
            active_users=row.active_users,
            inactive_users=row.inactive_users,
            suspended_users=row.suspended_users,
            pending_users=row.pending_users,
            admins=row.admins,
            recruiters=row.recruiters,
            viewers=row.viewers,
            candidates=row.candidates,
        )

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
