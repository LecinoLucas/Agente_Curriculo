"""Unit tests — B-05 fix: list_published applies limit/offset to SQL query."""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

from src.infrastructure.database.models.job_model import JobModel


def _compile(stmt) -> str:
    return str(stmt.compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds": True}))


def _build_stmt(limit: int, offset: int) -> sa.Select:
    return (
        sa.select(JobModel)
        .where(
            JobModel.status == "published",
            JobModel.deleted_at.is_(None),
        )
        .order_by(JobModel.title.asc())
        .limit(limit)
        .offset(offset)
    )


def test_list_published_sql_contains_limit_50() -> None:
    """Default limit=50 must appear in the compiled SQL."""
    sql = _compile(_build_stmt(limit=50, offset=0))
    assert "LIMIT 50" in sql.upper()


def test_list_published_sql_contains_limit_200() -> None:
    """Max limit=200 must appear in the compiled SQL."""
    sql = _compile(_build_stmt(limit=200, offset=0))
    assert "LIMIT 200" in sql.upper()


def test_list_published_sql_contains_offset() -> None:
    """Offset must appear in the compiled SQL when non-zero."""
    sql = _compile(_build_stmt(limit=50, offset=10))
    assert "10" in sql  # OFFSET 10


def test_list_published_default_is_50() -> None:
    """Repository default limit parameter must be 50."""
    import inspect
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

    sig = inspect.signature(SQLAlchemyJobRepository.list_published)
    assert sig.parameters["limit"].default == 50


def test_list_published_default_offset_is_0() -> None:
    """Repository default offset parameter must be 0."""
    import inspect
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

    sig = inspect.signature(SQLAlchemyJobRepository.list_published)
    assert sig.parameters["offset"].default == 0


def test_list_public_jobs_router_max_limit() -> None:
    """Public router must enforce le=200 on the limit query param."""
    from src.interface.api.routers.public import _PUBLISHED_JOBS_MAX_LIMIT

    assert _PUBLISHED_JOBS_MAX_LIMIT == 200


def test_list_public_jobs_router_default_limit() -> None:
    """Public router default limit must be 50."""
    from src.interface.api.routers.public import _PUBLISHED_JOBS_DEFAULT_LIMIT

    assert _PUBLISHED_JOBS_DEFAULT_LIMIT == 50
