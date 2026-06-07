from contextlib import asynccontextmanager
from typing import Any

import pytest

from src.interface.api import main


@pytest.fixture(autouse=True)
def reset_sentry_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "_SENTRY_CONFIGURED", False)


def test_configure_sentry_skips_when_dsn_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    def _fake_init(**_: Any) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(main.settings, "SENTRY_DSN", "")
    monkeypatch.setattr(main.settings, "APP_ENV", "production")
    monkeypatch.setattr(main.sentry_sdk, "init", _fake_init)

    assert main.configure_sentry() is False
    assert called is False


def test_configure_sentry_skips_in_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    def _fake_init(**_: Any) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(main.settings, "SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setattr(main.settings, "APP_ENV", "test")
    monkeypatch.setattr(main.sentry_sdk, "init", _fake_init)

    assert main.configure_sentry() is False
    assert called is False


def test_configure_sentry_calls_init_with_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def _fake_init(**kwargs: Any) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(main.settings, "SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setattr(main.settings, "APP_ENV", "staging")
    monkeypatch.setattr(main.sentry_sdk, "init", _fake_init)

    assert main.configure_sentry() is True
    assert captured["dsn"] == "https://public@example.ingest.sentry.io/1"
    assert captured["environment"] == "staging"
    assert captured["release"] == main.APP_VERSION
    assert captured["traces_sample_rate"] == 0.0


def test_configure_sentry_avoids_duplicate_init(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    def _fake_init(**_: Any) -> None:
        nonlocal calls
        calls += 1

    monkeypatch.setattr(main.settings, "SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setattr(main.settings, "APP_ENV", "production")
    monkeypatch.setattr(main.sentry_sdk, "init", _fake_init)

    assert main.configure_sentry() is True
    assert main.configure_sentry() is False
    assert calls == 1


@pytest.mark.asyncio
async def test_lifespan_starts_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    def _fake_init(**_: Any) -> None:
        nonlocal called
        called = True

    async def _noop() -> None:
        return None

    class _FakeEngine:
        async def dispose(self) -> None:
            return None

    monkeypatch.setattr(main.settings, "SENTRY_DSN", "")
    monkeypatch.setattr(main.settings, "APP_ENV", "development")
    monkeypatch.setattr(main.sentry_sdk, "init", _fake_init)
    monkeypatch.setattr(main, "configure_structured_logging", lambda: None)
    monkeypatch.setattr(main, "validate_ai_credentials_encryption_key", lambda: None)
    monkeypatch.setattr(main, "close_redis", _noop)
    monkeypatch.setattr(main, "engine", _FakeEngine())

    async with main.lifespan(main.app):
        pass

    assert called is False


@pytest.mark.asyncio
async def test_lifespan_starts_with_fake_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def _fake_init(**kwargs: Any) -> None:
        captured.update(kwargs)

    async def _noop() -> None:
        return None

    class _FakeEngine:
        async def dispose(self) -> None:
            return None

    monkeypatch.setattr(main.settings, "SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setattr(main.settings, "APP_ENV", "production")
    monkeypatch.setattr(main.sentry_sdk, "init", _fake_init)
    monkeypatch.setattr(main, "configure_structured_logging", lambda: None)
    monkeypatch.setattr(main, "validate_ai_credentials_encryption_key", lambda: None)
    monkeypatch.setattr(main, "close_redis", _noop)
    monkeypatch.setattr(main, "engine", _FakeEngine())

    async with main.lifespan(main.app):
        pass

    assert captured["environment"] == "production"
    assert captured["release"] == main.APP_VERSION
