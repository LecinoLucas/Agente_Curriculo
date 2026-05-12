from __future__ import annotations

from src.core.settings import Settings


def test_skill_catalog_source_defaults_to_database() -> None:
    settings = Settings(
        APP_SECRET_KEY="secret",
        DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
        JWT_SECRET_KEY="jwt-secret",
    )

    assert settings.SKILL_CATALOG_SOURCE == "database"


def test_skill_catalog_source_can_be_overridden_for_staging(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("SKILL_CATALOG_SOURCE", "database")

    settings = Settings(
        APP_SECRET_KEY="secret",
        DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/db",
        JWT_SECRET_KEY="jwt-secret",
    )

    assert settings.APP_ENV == "staging"
    assert settings.SKILL_CATALOG_SOURCE == "database"
