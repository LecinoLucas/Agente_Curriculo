"""Bootstrap seguro para banco novo de desenvolvimento.

Orquestra o preparo de um banco dev sem apagar dados existentes:

1. Valida APP_ENV e DATABASE_URL
2. Aplica `alembic upgrade head`
3. Cria diretórios locais necessários
4. Exibe `alembic current`
5. Roda os seeds de desenvolvimento existentes

Uso:
    python scripts/bootstrap_dev.py
    python scripts/bootstrap_dev.py --skip-jobs
    python scripts/bootstrap_dev.py --verbose
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import traceback
from contextlib import suppress
from dataclasses import dataclass
from importlib import import_module
from pathlib import Path

import sqlalchemy as sa
from dotenv import load_dotenv
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from alembic import command
from alembic.config import Config

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env", override=False)

SECTION = "=" * 60
SAFE_APP_ENVS = {"development", "test"}
BLOCKED_NAME_TOKENS = (
    "prod",
    "production",
    "staging",
    "live",
    "amazonaws",
    "render",
    "railway",
    "heroku",
)
REQUIRED_TABLES = [
    "users",
    "ai_models",
    "score_model_versions",
    "skill_catalog",
    "job_areas",
    "jobs",
]
REQUIRED_DIRECTORIES = [
    ROOT_DIR / "uploads",
    ROOT_DIR / "private_uploads",
    ROOT_DIR / "reports",
]
_ENGINE = None


class BootstrapError(RuntimeError):
    """Erro controlado do bootstrap."""


@dataclass(frozen=True)
class SeedStep:
    label: str
    module_name: str
    file_name: str
    optional: bool = False


SEED_STEPS = [
    SeedStep("AI Models", "scripts.seed_ai_models", "seed_ai_models.py"),
    SeedStep("Scoring Version", "scripts.seed_scoring_version", "seed_scoring_version.py"),
    SeedStep("Admin Dev", "scripts.seed_dev_admin", "seed_dev_admin.py", optional=True),
    SeedStep(
        "Skill Catalog",
        "scripts.seed_skill_catalog_from_json",
        "seed_skill_catalog_from_json.py",
    ),
    SeedStep("Skills legadas", "scripts.seed_skills", "seed_skills.py"),
    SeedStep("Áreas de vagas", "scripts.seed_job_areas", "seed_job_areas.py"),
    SeedStep("Vagas demo", "scripts.seed_jobs", "seed_jobs.py", optional=True),
]


def _print(message: str) -> None:
    print(message)


def _debug(enabled: bool, message: str) -> None:
    if enabled:
        _print(f"[verbose] {message}")


def _fail(message: str) -> None:
    raise BootstrapError(message)


def _safe_database_url(url: str) -> str:
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<DATABASE_URL inválida>"


def _load_runtime_config(verbose: bool) -> tuple[str, str]:
    app_env = (os.getenv("APP_ENV") or "development").strip().lower()
    database_url = (os.getenv("DATABASE_URL") or "").strip()

    if not database_url:
        _fail(
            "DATABASE_URL não configurada. Defina a variável no ambiente ou em "
            f"{ROOT_DIR / '.env'}."
        )

    try:
        parsed_url = make_url(database_url)
    except Exception as exc:
        _fail(f"DATABASE_URL inválida: {exc}")

    if not parsed_url.drivername.startswith("postgresql"):
        _fail(
            "DATABASE_URL deve apontar para PostgreSQL "
            f"(recebido: {parsed_url.drivername})."
        )

    if app_env not in SAFE_APP_ENVS:
        _fail(
            "Bootstrap dev bloqueado para APP_ENV="
            f"'{app_env}'. Use apenas em development/test."
        )

    host = (parsed_url.host or "").strip().lower()
    database_name = (parsed_url.database or "").strip().lower()

    for value_name, value in (("host", host), ("database", database_name)):
        for token in BLOCKED_NAME_TOKENS:
            if token in value:
                _fail(
                    "Bootstrap dev bloqueado: DATABASE_URL parece apontar para ambiente "
                    f"não seguro ({value_name} contém '{token}')."
                )

    _debug(verbose, f"APP_ENV={app_env}")
    _debug(verbose, f"DATABASE_URL={parsed_url.render_as_string(hide_password=True)}")
    return app_env, database_url


def _alembic_config(database_url: str) -> Config:
    alembic_cfg = Config(str(ROOT_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(ROOT_DIR / "alembic"))
    alembic_cfg.attributes["configure_logger"] = False
    os.environ["DATABASE_URL"] = database_url
    return alembic_cfg


def _get_engine():
    global _ENGINE
    if _ENGINE is None:
        from src.infrastructure.database.connection import engine as backend_engine

        _ENGINE = backend_engine
    return _ENGINE


def _run_alembic_upgrade(alembic_cfg: Config, verbose: bool) -> None:
    _debug(verbose, "Executando alembic upgrade head.")
    try:
        command.upgrade(alembic_cfg, "head")
    except Exception as exc:
        _fail(f"Falha ao aplicar migrations com Alembic: {exc}")


def _show_alembic_current(alembic_cfg: Config, verbose: bool) -> None:
    _print("\n[Alembic] current")
    try:
        command.current(alembic_cfg, verbose=verbose)
    except Exception as exc:
        _fail(f"Falha ao consultar alembic current: {exc}")


async def _table_exists(conn: sa.ext.asyncio.AsyncConnection, name: str) -> bool:
    result = await conn.execute(sa.text("SELECT to_regclass(:table_name)"), {"table_name": name})
    return result.scalar() is not None


async def _check_required_tables() -> None:
    engine = _get_engine()
    try:
        async with engine.connect() as conn:
            missing = [table for table in REQUIRED_TABLES if not await _table_exists(conn, table)]
    except SQLAlchemyError as exc:
        _fail(f"Falha ao validar tabelas após migrations: {exc}")

    if missing:
        _fail(
            "Migrations concluídas, mas tabelas críticas não foram encontradas: "
            f"{', '.join(missing)}."
        )


def _ensure_directories(verbose: bool) -> None:
    for directory in REQUIRED_DIRECTORIES:
        directory.mkdir(parents=True, exist_ok=True)
        _debug(verbose, f"Diretório garantido: {directory}")


async def _run_seed_step(step: SeedStep, verbose: bool) -> None:
    script_path = ROOT_DIR / "scripts" / step.file_name
    if not script_path.exists():
        if step.optional:
            _print(f"[aviso] Seed opcional não encontrado: {script_path.name}.")
            return
        _fail(f"Seed obrigatório não encontrado: {script_path.name}.")

    try:
        module = import_module(step.module_name)
        seed_main = module.main
    except Exception as exc:
        _fail(f"Falha ao carregar {step.file_name}: {exc}")

    if not callable(seed_main):
        _fail(f"{step.file_name} não expõe uma função main() executável.")

    _debug(verbose, f"Executando seed: {step.module_name}.main()")
    previous_argv = sys.argv[:]
    sys.argv = [str(script_path)]
    try:
        result = seed_main()
        if asyncio.iscoroutine(result):
            await result
    except Exception as exc:
        _fail(f"Falha ao executar {step.file_name}: {exc}")
    finally:
        sys.argv = previous_argv


async def _run_seeds(*, skip_jobs: bool, verbose: bool) -> None:
    seeds = [step for step in SEED_STEPS if not (skip_jobs and step.file_name == "seed_jobs.py")]

    for index, step in enumerate(seeds, start=1):
        _print(f"\n[seed {index}/{len(seeds)}] {step.label}")
        await _run_seed_step(step, verbose)

    if skip_jobs:
        _print(f"\n[seed {len(seeds) + 1}/{len(seeds) + 1}] Vagas demo")
        _print("Pulando seed de vagas (--skip-jobs).")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepara um banco novo de desenvolvimento sem resetar nem dropar dados.",
    )
    parser.add_argument(
        "--skip-jobs",
        action="store_true",
        help="Pula o seed de vagas demo.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Exibe detalhes adicionais de execução e diagnóstico.",
    )
    return parser.parse_args()


async def _dispose_engine() -> None:
    try:
        engine = _get_engine()
        await engine.dispose()
    except Exception:
        pass


async def _run_async_steps(*, skip_jobs: bool, verbose: bool) -> None:
    _print("\n[2/5] Validando schema crítico...")
    await _check_required_tables()
    _print("[OK] Tabelas críticas presentes.")

    _print("\n[3/5] Garantindo diretórios locais...")
    _ensure_directories(verbose)
    _print("[OK] uploads, private_uploads e reports disponíveis.")

    _print("\n[4/5] Rodando seeds de desenvolvimento...")
    await _run_seeds(skip_jobs=skip_jobs, verbose=verbose)


def main() -> None:
    args = _parse_args()

    try:
        _, database_url = _load_runtime_config(args.verbose)
        alembic_cfg = _alembic_config(database_url)

        _print(SECTION)
        _print("Bootstrap Dev Seguro — backend")
        _print(SECTION)
        _print(f"APP_ENV........: {(os.getenv('APP_ENV') or 'development').strip().lower()}")
        _print(f"DATABASE_URL...: {_safe_database_url(database_url)}")
        _print("Modo...........: preserva dados, não dropa banco, não apaga registros")

        _print("\n[1/5] Aplicando migrations (alembic upgrade head)...")
        _run_alembic_upgrade(alembic_cfg, args.verbose)

        asyncio.run(_run_async_steps(skip_jobs=args.skip_jobs, verbose=args.verbose))

        _print("\n[5/5] Revisão Alembic aplicada...")
        _show_alembic_current(alembic_cfg, args.verbose)
    except BootstrapError as exc:
        print(f"\n[ERRO] {exc}", file=sys.stderr)
        if args.verbose:
            traceback.print_exc()
        raise SystemExit(1) from exc
    except KeyboardInterrupt as exc:
        print("\n[ERRO] Execução interrompida pelo usuário.", file=sys.stderr)
        raise SystemExit(130) from exc
    except Exception as exc:
        print(f"\n[ERRO] Falha inesperada no bootstrap: {exc}", file=sys.stderr)
        if args.verbose:
            traceback.print_exc()
        raise SystemExit(1) from exc
    finally:
        with suppress(RuntimeError):
            asyncio.run(_dispose_engine())

    _print(f"\n{SECTION}")
    _print("Bootstrap dev concluído com sucesso.")
    _print(SECTION)


if __name__ == "__main__":
    main()
