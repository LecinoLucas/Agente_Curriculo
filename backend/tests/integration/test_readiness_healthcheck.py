from __future__ import annotations

import pytest
from httpx import AsyncClient

from src.interface.api import main as api_main


class _FakeRedis:
    def __init__(self, *, ping_result: bool = True, error: Exception | None = None) -> None:
        self._ping_result = ping_result
        self._error = error

    async def ping(self) -> bool:
        if self._error is not None:
            raise self._error
        return self._ping_result

    async def aclose(self) -> None:
        return None


@pytest.mark.asyncio
async def test_liveness_healthcheck_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health/live")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "version" in response.json()


@pytest.mark.asyncio
async def test_readiness_returns_ok_when_database_and_redis_are_available(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check_database_health() -> bool:
        return True

    async def _get_redis() -> _FakeRedis:
        return _FakeRedis(ping_result=True)

    monkeypatch.setattr(api_main, "check_database_health", _check_database_health)
    monkeypatch.setattr(api_main, "get_redis", _get_redis)

    response = await client.get("/health/ready")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"]["connected"] is True
    assert body["redis"]["connected"] is True
    assert body["redis"]["status"] == "ok"


@pytest.mark.asyncio
async def test_health_alias_uses_same_readiness_contract(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check_database_health() -> bool:
        return True

    async def _get_redis() -> _FakeRedis:
        return _FakeRedis(ping_result=True)

    monkeypatch.setattr(api_main, "check_database_health", _check_database_health)
    monkeypatch.setattr(api_main, "get_redis", _get_redis)

    response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"]["connected"] is True
    assert body["redis"]["connected"] is True


@pytest.mark.asyncio
async def test_readiness_returns_503_when_redis_is_unavailable(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check_database_health() -> bool:
        return True

    async def _get_redis() -> _FakeRedis:
        return _FakeRedis(
            error=RuntimeError("Error connecting to redis://user:super-secret@redis.example.com:6379/0")
        )

    monkeypatch.setattr(api_main, "check_database_health", _check_database_health)
    monkeypatch.setattr(api_main, "get_redis", _get_redis)

    response = await client.get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"]["connected"] is True
    assert body["redis"]["connected"] is False
    assert body["redis"]["status"] == "down"
    assert body["redis"]["message"] == "Redis indisponível"
    assert "super-secret" not in response.text
    assert "redis://" not in response.text


@pytest.mark.asyncio
async def test_readiness_returns_503_when_database_is_unavailable(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _check_database_health() -> bool:
        return False

    async def _get_redis() -> _FakeRedis:
        return _FakeRedis(ping_result=True)

    monkeypatch.setattr(api_main, "check_database_health", _check_database_health)
    monkeypatch.setattr(api_main, "get_redis", _get_redis)

    response = await client.get("/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"]["connected"] is False
    assert body["database"]["status"] == "down"
    assert body["redis"]["connected"] is True

