from collections.abc import AsyncGenerator
import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
import sqlalchemy as sa
from sqlalchemy import event
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from src.infrastructure.database.base import Base
from src.infrastructure.database.connection import get_db_session
from src.interface.api.main import app


class FakeRedis:
    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def setex(self, key: str, seconds: int, value: str) -> None:
        self._store[key] = value

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def delete(self, key: str) -> int:
        existed = key in self._store
        self._store.pop(key, None)
        return int(existed)

# ── Engine em memória para testes ────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine.sync_engine, "connect")
def _register_sqlite_functions(dbapi_connection: object, _connection_record: object) -> None:
    # Emular NOW() do PostgreSQL para defaults server-side nos modelos.
    if hasattr(dbapi_connection, "create_function"):
        dbapi_connection.create_function(
            "NOW",
            0,
            lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
        )

TestSessionFactory = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


async def _clear_database(session: AsyncSession) -> None:
    # Isola os testes mesmo quando chamam commit(), limpando o estado global
    # do banco em memória compartilhado pelo StaticPool.
    for table in reversed(Base.metadata.sorted_tables):
        await session.execute(sa.delete(table))
    await session.commit()


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()

    async def _get_redis() -> FakeRedis:
        return redis

    monkeypatch.setattr("src.infrastructure.cache.redis_client.get_redis", _get_redis)
    monkeypatch.setattr("src.application.use_cases.auth.login.get_redis", _get_redis)
    monkeypatch.setattr("src.application.use_cases.auth.refresh_token.get_redis", _get_redis)
    monkeypatch.setattr("src.application.use_cases.auth.logout.get_redis", _get_redis)
    return redis


@pytest.fixture(autouse=True)
def use_test_audit_session(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.interface.api.middlewares.audit_middleware.AsyncSessionFactory",
        TestSessionFactory,
    )


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables() -> AsyncGenerator[None, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionFactory() as session:
        await _clear_database(session)
        try:
            yield session
        finally:
            await session.rollback()
            await _clear_database(session)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    # app is wrapped by CORSMiddleware, access the underlying FastAPI instance
    fastapi_app = app.app if hasattr(app, "app") else app
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
