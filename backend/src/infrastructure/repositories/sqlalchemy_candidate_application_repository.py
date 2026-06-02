from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_application_model import (
    APPLICATION_ACTIVE_STATUSES,
    CandidateApplicationModel,
    CandidateLocationPreferenceModel,
)


class SQLAlchemyCandidateApplicationRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def create_application(
        self,
        application: CandidateApplicationModel,
    ) -> CandidateApplicationModel:
        self._session.add(application)
        await self._session.flush()
        return application

    async def get_application(self, application_id: UUID) -> CandidateApplicationModel | None:
        return await self._session.scalar(
            sa.select(CandidateApplicationModel).where(
                CandidateApplicationModel.id == application_id,
                CandidateApplicationModel.deleted_at.is_(None),
            )
        )

    async def find_active_application(
        self,
        *,
        candidate_id: UUID,
        job_id: UUID,
        exclude_application_id: UUID | None = None,
    ) -> CandidateApplicationModel | None:
        stmt = sa.select(CandidateApplicationModel).where(
            CandidateApplicationModel.candidate_id == candidate_id,
            CandidateApplicationModel.job_id == job_id,
            CandidateApplicationModel.deleted_at.is_(None),
            CandidateApplicationModel.status.in_(APPLICATION_ACTIVE_STATUSES),
        )
        if exclude_application_id is not None:
            stmt = stmt.where(CandidateApplicationModel.id != exclude_application_id)
        return await self._session.scalar(stmt)

    async def list_applications(
        self,
        *,
        page: int,
        page_size: int,
        candidate_id: UUID | None = None,
        job_id: UUID | None = None,
        status: str | None = None,
        source: str | None = None,
    ) -> tuple[Sequence[CandidateApplicationModel], int]:
        stmt = sa.select(CandidateApplicationModel).where(
            CandidateApplicationModel.deleted_at.is_(None)
        )
        if candidate_id is not None:
            stmt = stmt.where(CandidateApplicationModel.candidate_id == candidate_id)
        if job_id is not None:
            stmt = stmt.where(CandidateApplicationModel.job_id == job_id)
        if status is not None:
            stmt = stmt.where(CandidateApplicationModel.status == status)
        if source is not None:
            stmt = stmt.where(CandidateApplicationModel.source == source)
        stmt = stmt.order_by(CandidateApplicationModel.created_at.desc())
        return await self._paginate(stmt, page, page_size)

    async def update_application(
        self,
        application: CandidateApplicationModel,
    ) -> CandidateApplicationModel:
        await self._session.flush()
        return application

    async def create_location_preference(
        self,
        preference: CandidateLocationPreferenceModel,
    ) -> CandidateLocationPreferenceModel:
        self._session.add(preference)
        await self._session.flush()
        return preference

    async def list_location_preferences(
        self,
        *,
        page: int,
        page_size: int,
        candidate_id: UUID | None = None,
    ) -> tuple[Sequence[CandidateLocationPreferenceModel], int]:
        stmt = sa.select(CandidateLocationPreferenceModel)
        if candidate_id is not None:
            stmt = stmt.where(CandidateLocationPreferenceModel.candidate_id == candidate_id)
        stmt = stmt.order_by(
            CandidateLocationPreferenceModel.priority.asc(),
            CandidateLocationPreferenceModel.created_at.asc(),
        )
        return await self._paginate(stmt, page, page_size)

    async def _paginate(self, stmt: sa.Select, page: int, page_size: int):
        count_stmt = sa.select(sa.func.count()).select_from(stmt.order_by(None).subquery())
        total = await self._session.scalar(count_stmt)
        result = await self._session.execute(stmt.offset((page - 1) * page_size).limit(page_size))
        return result.scalars().all(), total or 0
