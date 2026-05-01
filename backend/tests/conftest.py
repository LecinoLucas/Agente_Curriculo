from collections.abc import AsyncGenerator
import asyncio

import pytest
import pytest_asyncio
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

TestSessionFactory = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    redis = FakeRedis()

    def _get_redis() -> FakeRedis:
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
        yield session
        await session.rollback()  # cada teste parte de estado limpo


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_get_db

    ac = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    try:
        yield ac
    finally:
        app.dependency_overrides.clear()
        try:
            await asyncio.wait_for(ac.aclose(), timeout=2.0)
        except Exception:
            pass
