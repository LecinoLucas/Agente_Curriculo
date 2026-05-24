from __future__ import annotations

import base64

import pytest

import scripts.production_preflight as preflight


@pytest.fixture(autouse=True)
def clear_preflight_state(monkeypatch: pytest.MonkeyPatch):
    preflight._ERRORS.clear()
    preflight._WARNINGS.clear()
    for name in (
        "APP_ENV",
        "ENVIRONMENT",
        "ENV",
        "DATABASE_URL",
        "APP_SECRET_KEY",
        "JWT_SECRET_KEY",
        "FIELD_ENCRYPTION_KEY",
        "REDIS_URL",
    ):
        monkeypatch.delenv(name, raising=False)
    yield
    preflight._ERRORS.clear()
    preflight._WARNINGS.clear()


def _fernet_key() -> str:
    return base64.urlsafe_b64encode(b"1" * 32).decode("ascii")


def test_check_environment_accepts_deployment_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "staging")

    preflight.check_environment()

    assert preflight._ERRORS == []


def test_check_environment_rejects_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")

    preflight.check_environment()

    assert any("Ambiente inválido" in error for error in preflight._ERRORS)


def test_check_database_url_rejects_sqlite(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///local.db")

    result = preflight.check_database_url()

    assert result is None
    assert any("PostgreSQL" in error for error in preflight._ERRORS)


def test_check_database_url_masks_password(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:super-secret@db.example.com:5432/app",
    )

    result = preflight.check_database_url()

    assert result is not None
    output = capsys.readouterr().out
    assert "***" in output
    assert "super-secret" not in output


def test_check_required_secrets_validates_strength_without_printing_values(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    app_secret = "app-secret-value-with-enough-entropy-123456"
    jwt_secret = "jwt-secret-value-with-enough-entropy-654321"
    monkeypatch.setenv("APP_SECRET_KEY", app_secret)
    monkeypatch.setenv("JWT_SECRET_KEY", jwt_secret)
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", _fernet_key())

    preflight.check_required_secrets()

    assert preflight._ERRORS == []
    output = capsys.readouterr().out
    assert app_secret not in output
    assert jwt_secret not in output


def test_check_required_secrets_rejects_weak_and_reused_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_SECRET_KEY", "secret")
    monkeypatch.setenv("JWT_SECRET_KEY", "secret")
    monkeypatch.setenv("FIELD_ENCRYPTION_KEY", "not-a-fernet-key")

    preflight.check_required_secrets()

    assert len(preflight._ERRORS) >= 3


def test_check_redis_url_requires_redis_unless_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    preflight.check_redis_url(skip_redis=False)

    assert any("REDIS_URL não configurada" in error for error in preflight._ERRORS)

    preflight._ERRORS.clear()
    preflight.check_redis_url(skip_redis=True)

    assert preflight._ERRORS == []
    assert preflight._WARNINGS


def test_check_required_directories_validates_all_paths(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    directories = [
        tmp_path / "uploads",
        tmp_path / "private_uploads",
        tmp_path / "reports",
        tmp_path / "logs",
    ]
    for directory in directories:
        directory.mkdir()
    monkeypatch.setattr(preflight, "REQUIRED_DIRECTORIES", directories)

    preflight.check_required_directories()

    assert preflight._ERRORS == []


def test_parse_args_reads_skip_redis_and_verbose(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        preflight.sys,
        "argv",
        ["production_preflight.py", "--skip-redis", "--verbose"],
    )

    args = preflight._parse_args()

    assert args.skip_redis is True
    assert args.verbose is True
