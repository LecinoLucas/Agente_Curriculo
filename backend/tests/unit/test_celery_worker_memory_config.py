"""Unit tests — B-07 fix: worker_max_memory_per_child configured and env-overridable."""
from __future__ import annotations

import importlib
import sys

import pytest

_DEFAULT_MAX_MEMORY = 300_000


def _reload_celery_app():
    """Force-reload celery_app to pick up monkeypatched settings."""
    mod = "src.infrastructure.queue.celery_app"
    if mod in sys.modules:
        return importlib.reload(sys.modules[mod])
    return importlib.import_module(mod)


def test_celery_worker_max_memory_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default CELERY_WORKER_MAX_MEMORY_PER_CHILD must be 300 000 KB."""
    from src.core.settings import Settings

    env: dict[str, str] = {
        "APP_SECRET_KEY": "test-secret-key-at-least-32-chars!",
        "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost/db",
    }
    s = Settings(**env)  # type: ignore[call-arg]
    assert s.CELERY_WORKER_MAX_MEMORY_PER_CHILD == _DEFAULT_MAX_MEMORY


def test_celery_worker_max_memory_env_override(monkeypatch: pytest.MonkeyPatch) -> None:
    """CELERY_WORKER_MAX_MEMORY_PER_CHILD must be overridable via environment."""
    from src.core.settings import Settings

    monkeypatch.setenv("CELERY_WORKER_MAX_MEMORY_PER_CHILD", "500000")
    env: dict[str, str] = {
        "APP_SECRET_KEY": "test-secret-key-at-least-32-chars!",
        "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost/db",
    }
    s = Settings(**env)  # type: ignore[call-arg]
    assert s.CELERY_WORKER_MAX_MEMORY_PER_CHILD == 500_000


def test_celery_worker_max_memory_is_int(monkeypatch: pytest.MonkeyPatch) -> None:
    """CELERY_WORKER_MAX_MEMORY_PER_CHILD must always resolve to int."""
    from src.core.settings import Settings

    env: dict[str, str] = {
        "APP_SECRET_KEY": "test-secret-key-at-least-32-chars!",
        "DATABASE_URL": "postgresql+asyncpg://user:pass@localhost/db",
    }
    s = Settings(**env)  # type: ignore[call-arg]
    assert isinstance(s.CELERY_WORKER_MAX_MEMORY_PER_CHILD, int)


def test_celery_app_conf_has_worker_max_memory_per_child(monkeypatch: pytest.MonkeyPatch) -> None:
    """celery_app.conf must expose worker_max_memory_per_child from settings (B-07 fix)."""
    from src.core import settings as settings_module
    from src.infrastructure.queue import celery_app as celery_module

    monkeypatch.setattr(settings_module.settings, "CELERY_WORKER_MAX_MEMORY_PER_CHILD", _DEFAULT_MAX_MEMORY)

    conf_value = celery_module.celery_app.conf.worker_max_memory_per_child
    assert conf_value == _DEFAULT_MAX_MEMORY, (
        f"Expected worker_max_memory_per_child={_DEFAULT_MAX_MEMORY}, got {conf_value}"
    )


def test_celery_app_conf_preserves_max_tasks_per_child() -> None:
    """worker_max_tasks_per_child=50 must be preserved after adding worker_max_memory_per_child."""
    from src.infrastructure.queue.celery_app import celery_app

    assert celery_app.conf.worker_max_tasks_per_child == 50
