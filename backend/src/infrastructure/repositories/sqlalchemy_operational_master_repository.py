from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)


class SQLAlchemyOperationalMasterRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def find_group_by_id(self, group_id: UUID) -> OperationalGroupModel | None:
        return await self._session.scalar(
            sa.select(OperationalGroupModel).where(OperationalGroupModel.id == group_id)
        )

    async def find_group_by_code(self, code: str) -> OperationalGroupModel | None:
        return await self._session.scalar(
            sa.select(OperationalGroupModel).where(OperationalGroupModel.code == code)
        )

    async def find_group_by_normalized_name(
        self,
        normalized_name: str,
    ) -> OperationalGroupModel | None:
        return await self._session.scalar(
            sa.select(OperationalGroupModel).where(
                OperationalGroupModel.normalized_name == normalized_name
            )
        )

    async def list_groups(
        self,
        *,
        page: int,
        page_size: int,
        active: bool | None = None,
        search: str | None = None,
    ) -> tuple[Sequence[OperationalGroupModel], int]:
        stmt = sa.select(OperationalGroupModel)
        if active is not None:
            stmt = stmt.where(OperationalGroupModel.is_active == active)
        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                sa.or_(
                    OperationalGroupModel.code.ilike(pattern),
                    OperationalGroupModel.name.ilike(pattern),
                    OperationalGroupModel.normalized_name.ilike(pattern.lower()),
                )
            )
        return await self._paginate(
            stmt.order_by(OperationalGroupModel.code.asc()),
            page,
            page_size,
        )

    async def create_group(self, group: OperationalGroupModel) -> OperationalGroupModel:
        self._session.add(group)
        await self._session.flush()
        return group

    async def update_group(self, group: OperationalGroupModel) -> OperationalGroupModel:
        await self._session.flush()
        return group

    async def find_location_group_by_id(self, location_group_id: UUID) -> LocationGroupModel | None:
        return await self._session.scalar(
            sa.select(LocationGroupModel).where(LocationGroupModel.id == location_group_id)
        )

    async def find_location_group_by_normalized_state(
        self,
        normalized_name: str,
        state: str,
    ) -> LocationGroupModel | None:
        return await self._session.scalar(
            sa.select(LocationGroupModel).where(
                LocationGroupModel.normalized_name == normalized_name,
                LocationGroupModel.state == state,
            )
        )

    async def list_location_groups(
        self,
        *,
        page: int,
        page_size: int,
        active: bool | None = None,
        type: str | None = None,
        search: str | None = None,
    ) -> tuple[Sequence[LocationGroupModel], int]:
        stmt = sa.select(LocationGroupModel)
        if active is not None:
            stmt = stmt.where(LocationGroupModel.is_active == active)
        if type is not None:
            stmt = stmt.where(LocationGroupModel.type == type)
        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                sa.or_(
                    LocationGroupModel.name.ilike(pattern),
                    LocationGroupModel.normalized_name.ilike(pattern.lower()),
                    LocationGroupModel.city.ilike(pattern),
                    LocationGroupModel.state.ilike(pattern),
                )
            )
        stmt = stmt.order_by(
            LocationGroupModel.state.asc(),
            LocationGroupModel.normalized_name.asc(),
        )
        return await self._paginate(stmt, page, page_size)

    async def create_location_group(self, location_group: LocationGroupModel) -> LocationGroupModel:
        self._session.add(location_group)
        await self._session.flush()
        return location_group

    async def update_location_group(self, location_group: LocationGroupModel) -> LocationGroupModel:
        await self._session.flush()
        return location_group

    async def find_unit_by_id(self, unit_id: UUID) -> OperationalUnitModel | None:
        return await self._session.scalar(
            sa.select(OperationalUnitModel).where(OperationalUnitModel.id == unit_id)
        )

    async def find_unit_by_group_code(
        self,
        group_id: UUID,
        code: str,
    ) -> OperationalUnitModel | None:
        return await self._session.scalar(
            sa.select(OperationalUnitModel).where(
                OperationalUnitModel.group_id == group_id,
                OperationalUnitModel.code == code,
            )
        )

    async def list_units(
        self,
        *,
        page: int,
        page_size: int,
        active: bool | None = None,
        group_id: UUID | None = None,
        location_group_id: UUID | None = None,
        type: str | None = None,
        search: str | None = None,
    ) -> tuple[Sequence[OperationalUnitModel], int]:
        stmt = sa.select(OperationalUnitModel)
        if active is not None:
            stmt = stmt.where(OperationalUnitModel.is_active == active)
        if group_id is not None:
            stmt = stmt.where(OperationalUnitModel.group_id == group_id)
        if location_group_id is not None:
            stmt = stmt.where(OperationalUnitModel.location_group_id == location_group_id)
        if type is not None:
            stmt = stmt.where(OperationalUnitModel.type == type)
        if search:
            pattern = f"%{search.strip()}%"
            stmt = stmt.where(
                sa.or_(
                    OperationalUnitModel.code.ilike(pattern),
                    OperationalUnitModel.name.ilike(pattern),
                    OperationalUnitModel.normalized_name.ilike(pattern.lower()),
                    OperationalUnitModel.public_name.ilike(pattern),
                    OperationalUnitModel.reference_point.ilike(pattern),
                    OperationalUnitModel.city.ilike(pattern),
                    OperationalUnitModel.state.ilike(pattern),
                )
            )
        stmt = stmt.order_by(
            OperationalUnitModel.code.asc(),
            OperationalUnitModel.normalized_name.asc(),
        )
        return await self._paginate(stmt, page, page_size)

    async def create_unit(self, unit: OperationalUnitModel) -> OperationalUnitModel:
        self._session.add(unit)
        await self._session.flush()
        return unit

    async def update_unit(self, unit: OperationalUnitModel) -> OperationalUnitModel:
        await self._session.flush()
        return unit

    async def _paginate(self, stmt: sa.Select, page: int, page_size: int):
        count_stmt = sa.select(sa.func.count()).select_from(stmt.order_by(None).subquery())
        total = await self._session.scalar(count_stmt)
        result = await self._session.execute(stmt.offset((page - 1) * page_size).limit(page_size))
        return result.scalars().all(), total or 0
