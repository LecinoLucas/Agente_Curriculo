from __future__ import annotations

import asyncio

import pytest

import scripts.bootstrap_dev as bootstrap_dev


def test_safe_database_url_masks_sensitive_fields() -> None:
    masked = bootstrap_dev._safe_database_url(
        "postgresql+asyncpg://dev-user:secret-pass@db.internal.example.com:5432/app_db?token=abc123"
    )

    assert masked == "postgresql+asyncpg://***:5432/***"
    assert "dev-user" not in masked
    assert "secret-pass" not in masked
    assert "db.internal.example.com" not in masked
    assert "abc123" not in masked
    assert "app_db" not in masked


def test_load_runtime_config_requires_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(bootstrap_dev.BootstrapError, match="DATABASE_URL não configurada"):
        bootstrap_dev._load_runtime_config(verbose=False)


def test_load_runtime_config_blocks_production_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/dev_db")

    with pytest.raises(bootstrap_dev.BootstrapError, match="APP_ENV='production'"):
        bootstrap_dev._load_runtime_config(verbose=False)


def test_load_runtime_config_blocks_unsafe_remote_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@db.internal.example.com:5432/dev_db",
    )

    with pytest.raises(bootstrap_dev.BootstrapError, match="host local seguro"):
        bootstrap_dev._load_runtime_config(verbose=False)


def test_load_runtime_config_blocks_prod_like_database_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/app_prod")

    with pytest.raises(bootstrap_dev.BootstrapError, match="database contém 'prod'"):
        bootstrap_dev._load_runtime_config(verbose=False)


def test_parse_args_reads_skip_jobs_and_verbose(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        bootstrap_dev.sys,
        "argv",
        ["bootstrap_dev.py", "--skip-jobs", "--verbose"],
    )

    args = bootstrap_dev._parse_args()

    assert args.skip_jobs is True
    assert args.verbose is True


def test_run_seeds_skip_jobs_skips_only_job_seed(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    executed: list[str] = []

    async def fake_run_seed_step(step: bootstrap_dev.SeedStep, verbose: bool) -> None:
        assert verbose is True
        executed.append(step.file_name)

    monkeypatch.setattr(bootstrap_dev, "_run_seed_step", fake_run_seed_step)

    asyncio.run(bootstrap_dev._run_seeds(skip_jobs=True, verbose=True))

    assert "seed_jobs.py" not in executed
    assert executed == [
        "seed_ai_models.py",
        "seed_scoring_version.py",
        "seed_dev_admin.py",
        "seed_skill_catalog_from_json.py",
        "seed_skills.py",
        "seed_job_areas.py",
    ]
    assert "Pulando seed de vagas (--skip-jobs)." in capsys.readouterr().out


def test_optional_missing_seed_warns_and_does_not_fail(
    capsys: pytest.CaptureFixture[str],
) -> None:
    step = bootstrap_dev.SeedStep(
        label="Admin Dev",
        module_name="scripts.seed_dev_admin",
        file_name="definitely_missing_seed.py",
        optional=True,
    )

    asyncio.run(bootstrap_dev._run_seed_step(step, verbose=False))

    assert "Seed opcional não encontrado" in capsys.readouterr().out
