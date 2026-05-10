"""Base repository class that auto-filters soft-deleted records."""
from datetime import UTC, datetime
from typing import TypeVar, Generic, Type

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import DeclarativeBase

T = TypeVar("T", bound=DeclarativeBase)


class BaseSoftDeleteRepository(Generic[T]):
    """Base repository that automatically filters deleted_at IS NULL.

    Usage:
        class JobRepository(BaseSoftDeleteRepository[JobModel]):
            async def list_active_jobs(self) -> list[JobModel]:
                stmt = select(JobModel).where(...)
                stmt = self._apply_soft_delete_filter(stmt)
                return await self._session.execute(stmt)
    """

    def __init__(self, session: AsyncSession, model: Type[T]):
        self._session = session
        self._model = model

    def _apply_soft_delete_filter(self, stmt):
        """Apply deleted_at IS NULL filter to query."""
        if not hasattr(self._model, "deleted_at"):
            return stmt

        return stmt.where(self._model.deleted_at.is_(None))

    @classmethod
    def _is_soft_delete_model(cls, model: Type[T]) -> bool:
        """Check if model has deleted_at column."""
        return hasattr(model, "deleted_at")


class SoftDeleteTestHelper:
    """Helper for tests to verify soft-delete filters are applied."""

    @staticmethod
    async def assert_no_deleted_records_in_results(
        session: AsyncSession,
        results: list[T],
        model: Type[T],
    ) -> None:
        """Verify that results contain no soft-deleted records."""
        if not BaseSoftDeleteRepository._is_soft_delete_model(model):
            return

        for item in results:
            if item.deleted_at is not None:
                raise AssertionError(
                    f"Found soft-deleted {model.__name__} in query results: {item.id}"
                )

    @staticmethod
    async def count_deleted_records(
        session: AsyncSession,
        model: Type[T],
    ) -> int:
        """Count total soft-deleted records in table."""
        if not BaseSoftDeleteRepository._is_soft_delete_model(model):
            return 0

        stmt = sa.select(sa.func.count()).select_from(model).where(
            model.deleted_at.isnot(None)
        )
        return await session.scalar(stmt) or 0
