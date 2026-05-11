from __future__ import annotations

import asyncio
import os
import subprocess
from collections.abc import AsyncGenerator, Generator
from pathlib import Path
from urllib.parse import urlparse

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.infrastructure.database.connection import get_db_session
from src.interface.api.main import app


BACKEND_DIR = Path(__file__).resolve().parents[3]


def _resolve_test_database_url() -> str | None:
    return os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL_TEST")


def _is_explicit_postgres_run(config: pytest.Config) -> bool:
    markexpr = getattr(config.option, "markexpr", "") or ""
    return "postgres" in markexpr


def _assert_dedicated_test_database(database_url: str) -> None:
    parsed = urlparse(database_url)
    database_name = parsed.path.rsplit("/", 1)[-1]
    if "test" not in database_name.casefold():
        pytest.skip(
            "PostgreSQL tests require TEST_DATABASE_URL or DATABASE_URL_TEST pointing to a dedicated test database."
        )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if _is_explicit_postgres_run(config):
        return

    skip_reason = pytest.mark.skip(reason="PostgreSQL tests require explicit '-m postgres'.")
    for item in items:
        if item.get_closest_marker("postgres") is not None:
            item.add_marker(skip_reason)


@pytest.fixture(scope="session")
def postgres_database_url() -> str:
    database_url = _resolve_test_database_url()
    if not database_url:
        pytest.skip(
            "Set TEST_DATABASE_URL or DATABASE_URL_TEST to run PostgreSQL tests."
        )
    _assert_dedicated_test_database(database_url)
    return database_url


@pytest.fixture(scope="session")
def postgres_alembic_env(postgres_database_url: str) -> dict[str, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = postgres_database_url
    return env


@pytest.fixture(scope="session")
def postgres_schema_ready(
    postgres_database_url: str,
    postgres_alembic_env: dict[str, str],
) -> Generator[None, None, None]:
    subprocess.run(
        ["./.venv/bin/alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=postgres_alembic_env,
        check=True,
    )
    yield


@pytest_asyncio.fixture(scope="session")
async def postgres_engine(
    postgres_schema_ready: None,
    postgres_database_url: str,
) -> AsyncGenerator:
    engine = create_async_engine(
        postgres_database_url,
        pool_pre_ping=True,
        poolclass=NullPool,
    )
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def postgres_session_factory(postgres_engine) -> AsyncGenerator[async_sessionmaker[AsyncSession], None]:
    yield async_sessionmaker(postgres_engine, class_=AsyncSession, expire_on_commit=False)


async def _truncate_postgres_database(session: AsyncSession) -> None:
    result = await session.execute(
        sa.text(
            """
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename <> 'alembic_version'
            ORDER BY tablename
            """
        )
    )
    table_names = [row[0] for row in result.fetchall()]
    if not table_names:
        return

    quoted = ", ".join(f'"public"."{name}"' for name in table_names)
    await session.execute(sa.text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
    await session.commit()


@pytest.fixture(autouse=True)
def use_test_audit_session(
    monkeypatch: pytest.MonkeyPatch,
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    monkeypatch.setattr(
        "src.interface.api.middlewares.audit_middleware.AsyncSessionFactory",
        postgres_session_factory,
    )


@pytest_asyncio.fixture
async def db_session(
    postgres_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncSession, None]:
    async with postgres_session_factory() as session:
        await _truncate_postgres_database(session)
        try:
            yield session
        finally:
            await session.rollback()
            await _truncate_postgres_database(session)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    fastapi_app = app.app if hasattr(app, "app") else app

    from src.interface.api.dependencies import get_db

    fastapi_app.dependency_overrides[get_db] = override_get_db
    fastapi_app.dependency_overrides[get_db_session] = override_get_db

    ac = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        yield ac
    finally:
        fastapi_app.dependency_overrides.clear()
        try:
            await asyncio.wait_for(ac.aclose(), timeout=2.0)
        except Exception:
            pass
