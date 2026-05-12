from typing import Optional, Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.job_area_model import JobAreaModel
from src.infrastructure.database.models.job_model import JobModel

class SQLAlchemyJobAreaRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def find_by_id(self, area_id: UUID) -> Optional[JobAreaModel]:
        stmt = sa.select(JobAreaModel).where(JobAreaModel.id == area_id)
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def find_by_normalized_name(self, normalized_name: str) -> Optional[JobAreaModel]:
        stmt = sa.select(JobAreaModel).where(JobAreaModel.normalized_name == normalized_name)
        result = await self._session.execute(stmt)
        return result.scalars().first()

    async def list_areas(
        self,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        is_active: Optional[bool] = True,
    ) -> tuple[Sequence[JobAreaModel], int]:
        stmt = sa.select(JobAreaModel)
        
        if is_active is not None:
            stmt = stmt.where(JobAreaModel.is_active == is_active)
        
        if search:
            # Simple normalization for search
            search_pattern = f"%{search.lower().strip()}%"
            stmt = stmt.where(
                sa.or_(
                    JobAreaModel.name.ilike(search_pattern),
                    JobAreaModel.normalized_name.ilike(search_pattern)
                )
            )

        # Count total
        count_stmt = sa.select(sa.func.count()).select_from(stmt.subquery())
        total_result = await self._session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Pagination
        stmt = stmt.order_by(JobAreaModel.normalized_name.asc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self._session.execute(stmt)
        return result.scalars().all(), total

    async def create_area(self, area: JobAreaModel) -> JobAreaModel:
        self._session.add(area)
        await self._session.flush()
        return area

    async def update_area(self, area: JobAreaModel) -> JobAreaModel:
        # Changes are assumed to be already made to the model instance
        await self._session.flush()
        return area

    async def activate_area(self, area: JobAreaModel) -> JobAreaModel:
        area.is_active = True
        await self._session.flush()
        return area

    async def deactivate_area(self, area: JobAreaModel) -> JobAreaModel:
        area.is_active = False
        await self._session.flush()
        return area

    async def count_jobs_using_area(self, area_name: str) -> int:
        # Normalize name for comparison
        normalized_target = area_name.lower().strip()
        
        # We use trim and lower comparison to avoid false negatives
        stmt = sa.select(sa.func.count()).select_from(JobModel).where(
            sa.func.trim(sa.func.lower(JobModel.job_area)) == normalized_target
        )
        result = await self._session.execute(stmt)
        return result.scalar() or 0

    async def delete_area(self, area_id: UUID) -> None:
        stmt = sa.delete(JobAreaModel).where(JobAreaModel.id == area_id)
        await self._session.execute(stmt)
        await self._session.flush()
