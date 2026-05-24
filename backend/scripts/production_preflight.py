"""Read-only production preflight checks.

Run after ``alembic upgrade head`` and before starting the application.
This script intentionally does not import the application engine/settings, create
tables, run seeds, create users, or insert demo data.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import binascii
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import sqlalchemy as sa
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

SECTION = "=" * 60
_ERRORS: list[str] = []
_WARNINGS: list[str] = []

DEPLOYMENT_ENV_VARS = ("APP_ENV", "ENVIRONMENT", "ENV")
DEPLOYMENT_ENV_VALUES = {
    "production",
    "prod",
    "staging",
    "homologation",
    "homolog",
    "homol",
    "hml",
}
MIN_SECRET_LENGTH = 32
WEAK_SECRET_TOKENS = {
    "changeme",
    "change-me",
    "secret",
    "jwt-secret",
    "development",
    "dev",
    "test",
    "password",
}
REQUIRED_DIRECTORIES = [
    ROOT_DIR / "uploads",
    ROOT_DIR / "private_uploads",
    ROOT_DIR / "reports",
    ROOT_DIR / "logs",
]


def _fail(msg: str) -> None:
    _ERRORS.append(msg)
    print(f"  [FAIL] {msg}")


def _warn(msg: str) -> None:
    _WARNINGS.append(msg)
    print(f"  [WARN] {msg}")


def _ok(msg: str) -> None:
    print(f"  [OK]   {msg}")


def _render_safe_url(url: str) -> str:
    try:
        return make_url(url).render_as_string(hide_password=True)
    except Exception:
        return "<DATABASE_URL inválida>"


def create_readonly_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url,
        poolclass=NullPool,
        connect_args={"server_settings": {"default_transaction_read_only": "on"}},
    )


def _verbose(enabled: bool, msg: str) -> None:
    if enabled:
        print(f"  [verbose] {msg}")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Valida um banco e ambiente de produção/homologação após "
            "`alembic upgrade head`, sem escrever no banco."
        ),
    )
    parser.add_argument(
        "--skip-redis",
        action="store_true",
        help="Pula a validação obrigatória de REDIS_URL.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Exibe detalhes adicionais sem imprimir secrets.",
    )
    return parser.parse_args()


def check_environment(verbose: bool = False) -> None:
    configured = {
        name: os.getenv(name, "").strip().lower()
        for name in DEPLOYMENT_ENV_VARS
        if os.getenv(name, "").strip()
    }

    if not configured:
        _fail(
            "Nenhuma variável de ambiente de deployment encontrada "
            "(APP_ENV, ENVIRONMENT ou ENV)."
        )
        return

    invalid = {
        name: value
        for name, value in configured.items()
        if value not in DEPLOYMENT_ENV_VALUES
    }
    if invalid:
        _fail(
            "Ambiente inválido para production_preflight: "
            + ", ".join(f"{name}={value}" for name, value in sorted(invalid.items()))
        )
        return

    _ok(
        "Ambiente de deployment válido: "
        + ", ".join(f"{name}={value}" for name, value in sorted(configured.items()))
    )
    if len(set(configured.values())) > 1:
        _warn(
            "Variáveis de ambiente de deployment têm valores diferentes; "
            "confirme se isso é intencional."
        )
    _verbose(
        verbose,
        "Ambientes aceitos: production/prod, staging, homologation/homolog/homol/hml.",
    )


def check_database_url(verbose: bool = False) -> tuple[str, URL] | None:
    url = os.getenv("DATABASE_URL")
    if not url:
        _fail("DATABASE_URL não encontrada nas variáveis de ambiente.")
        return None

    try:
        parsed = make_url(url)
    except Exception as exc:
        _fail(f"DATABASE_URL inválida: {exc}")
        return None

    if not parsed.drivername.startswith("postgresql"):
        _fail(
            "DATABASE_URL deve apontar para PostgreSQL "
            f"(driver recebido: {parsed.drivername})."
        )
        return None

    _ok(f"DATABASE_URL configurada: {_render_safe_url(url)}")
    _verbose(verbose, f"Driver PostgreSQL validado: {parsed.drivername}")
    return url, parsed


def check_not_dev_seed_safe(url: str) -> None:
    dev_patterns = ["localhost", "127.0.0.1", "dev", "test", "local"]
    is_dev = any(p in url.lower() for p in dev_patterns)
    if is_dev:
        _warn(
            "DATABASE_URL parece ser de desenvolvimento (contém 'localhost'/'dev'/'test'). "
            "Este script é pensado para produção."
        )
    else:
        _ok("DATABASE_URL não contém padrões de desenvolvimento.")


def _has_minimum_secret_strength(value: str) -> bool:
    stripped = value.strip()
    lowered = stripped.lower()
    if len(stripped) < MIN_SECRET_LENGTH:
        return False
    if lowered in WEAK_SECRET_TOKENS:
        return False
    if any(token in lowered for token in ("changeme", "change_me", "replace-me")):
        return False
    return len(set(stripped)) >= 8


def _is_valid_fernet_key(value: str) -> bool:
    try:
        decoded = base64.urlsafe_b64decode(value.encode("ascii"))
    except (UnicodeEncodeError, binascii.Error):
        return False
    return len(decoded) == 32


def check_required_secrets(verbose: bool = False) -> None:
    app_secret = os.getenv("APP_SECRET_KEY", "").strip()
    jwt_secret = os.getenv("JWT_SECRET_KEY", "").strip()
    field_key = os.getenv("FIELD_ENCRYPTION_KEY", "").strip()

    for name, value in (
        ("APP_SECRET_KEY", app_secret),
        ("JWT_SECRET_KEY", jwt_secret),
    ):
        if not value:
            _fail(f"{name} não configurada.")
        elif not _has_minimum_secret_strength(value):
            _fail(
                f"{name} deve ter pelo menos {MIN_SECRET_LENGTH} caracteres, "
                "não pode ser placeholder e precisa ter entropia mínima."
            )
        else:
            _ok(f"{name} configurada com força mínima.")

    if app_secret and jwt_secret and app_secret == jwt_secret:
        _fail("APP_SECRET_KEY e JWT_SECRET_KEY devem ser diferentes.")

    if not field_key:
        _fail("FIELD_ENCRYPTION_KEY não configurada.")
    elif not _is_valid_fernet_key(field_key):
        _fail("FIELD_ENCRYPTION_KEY deve ser uma chave Fernet válida de 32 bytes.")
    else:
        _ok("FIELD_ENCRYPTION_KEY configurada e válida.")

    _verbose(verbose, "Secrets foram validados sem imprimir valores.")


def check_redis_url(*, skip_redis: bool, verbose: bool = False) -> None:
    if skip_redis:
        _warn("Validação de REDIS_URL pulada por --skip-redis.")
        return

    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        _fail("REDIS_URL não configurada. Use --skip-redis somente com justificativa operacional.")
        return

    parsed = urlparse(redis_url)
    if parsed.scheme not in {"redis", "rediss"}:
        _fail(f"REDIS_URL deve usar redis:// ou rediss:// (scheme recebido: {parsed.scheme}).")
        return
    if not parsed.hostname:
        _fail("REDIS_URL deve conter host.")
        return

    _ok(f"REDIS_URL configurada: {parsed.scheme}://{parsed.hostname}:***")
    _verbose(verbose, "REDIS_URL validada sintaticamente; conectividade Redis não é testada.")


def check_required_directories(verbose: bool = False) -> None:
    for directory in REQUIRED_DIRECTORIES:
        if not directory.exists():
            _fail(
                f"Diretório obrigatório ausente: {directory}. "
                "Crie-o no deploy antes de iniciar a aplicação."
            )
            continue
        if not directory.is_dir():
            _fail(f"Caminho obrigatório não é diretório: {directory}.")
            continue
        if not os.access(directory, os.R_OK | os.W_OK | os.X_OK):
            _fail(f"Diretório obrigatório sem permissão de leitura/escrita: {directory}.")
            continue

        try:
            display_path = directory.relative_to(ROOT_DIR)
        except ValueError:
            display_path = directory
        _ok(f"Diretório disponível: {display_path}")
        _verbose(verbose, f"Permissões básicas OK para {directory}.")


async def check_db_connectivity(engine: AsyncEngine) -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(sa.text("SELECT 1"))
        _ok("Banco acessível.")
        return True
    except Exception as exc:
        _fail(f"Não foi possível conectar ao banco: {exc}")
        return False


async def check_readonly_guard(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text("SELECT current_setting('default_transaction_read_only')")
        )
        value = result.scalar_one()

    if value == "on":
        _ok("Sessões do preflight estão em modo read-only.")
    else:
        _fail("Sessões do preflight não estão em modo read-only.")


REQUIRED_EXTENSIONS = ["uuid-ossp", "pg_trgm", "pgcrypto", "unaccent"]


async def check_extensions(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        result = await conn.execute(sa.text("SELECT extname FROM pg_extension"))
        installed = {row[0] for row in result.fetchall()}

    for ext in REQUIRED_EXTENSIONS:
        if ext in installed:
            _ok(f"Extensão '{ext}' instalada.")
        else:
            _fail(
                f"Extensão '{ext}' NÃO instalada. "
                "Ela deve ser criada pelo Alembic em `alembic upgrade head`."
            )


async def check_alembic_head(engine: AsyncEngine) -> None:
    try:
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        alembic_cfg = Config(str(ROOT_DIR / "alembic.ini"))
        script = ScriptDirectory.from_config(alembic_cfg)
        heads = set(script.get_heads())

        async with engine.connect() as conn:
            current = await conn.run_sync(
                lambda sync_conn: set(
                    MigrationContext.configure(sync_conn).get_current_heads()
                )
            )

        if current == heads:
            _ok(f"Alembic está no head: {heads}")
        else:
            _fail(
                f"Alembic NÃO está no head. "
                f"Atual: {current}, Head esperado: {heads}. "
                "Execute: python -m alembic upgrade head"
            )
    except Exception as exc:
        _fail(f"Não foi possível verificar alembic heads: {exc}")


REQUIRED_TABLES = [
    "ai_models",
    "analyses",
    "analysis_results",
    "audit_logs",
    "candidate_job_match",
    "candidate_job_pipeline",
    "candidate_job_scores",
    "candidates",
    "job_areas",
    "jobs",
    "pipeline_stage_transitions",
    "resumes",
    "score_model_versions",
    "users",
]


async def check_required_tables(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_type='BASE TABLE'"
            )
        )
        existing = {row[0] for row in result.fetchall()}

    missing = [t for t in REQUIRED_TABLES if t not in existing]
    if missing:
        _fail(f"Tabelas obrigatórias faltando: {missing}")
    else:
        _ok(f"{len(REQUIRED_TABLES)} tabelas obrigatórias presentes.")


def check_no_dev_seed_in_prod() -> None:
    print(
        "\n  [INFO] Este preflight não roda bootstrap_dev.py, seed_dev_admin.py,\n"
        "         seed_jobs.py nem qualquer seed/demo de desenvolvimento.\n"
        "         A criação do primeiro admin de produção deve seguir um processo\n"
        "         operacional separado e auditável.\n"
        "         Nunca use seeds de dev em produção."
    )


async def main() -> int:
    args = _parse_args()

    print(SECTION)
    print("  Production Preflight — Agente Currículo")
    print(SECTION)

    print("\n[1] Ambiente")
    check_environment(args.verbose)

    print("\n[2] DATABASE_URL")
    database_config = check_database_url(args.verbose)
    if not database_config:
        return 1
    url, _ = database_config

    print("\n[3] Proteção contra uso indevido")
    check_not_dev_seed_safe(url)

    print("\n[4] Secrets obrigatórias")
    check_required_secrets(args.verbose)

    print("\n[5] Redis")
    check_redis_url(skip_redis=args.skip_redis, verbose=args.verbose)

    print("\n[6] Diretórios locais")
    check_required_directories(args.verbose)

    if _ERRORS:
        print(f"\n{SECTION}")
        print(
            f"  RESULTADO: {len(_ERRORS)} erro(s) crítico(s), "
            f"{len(_WARNINGS)} aviso(s)."
        )
        for e in _ERRORS:
            print(f"    [FAIL] {e}")
        print(SECTION)
        return 1

    engine = create_readonly_engine(url)
    try:
        print("\n[7] Conectividade")
        ok = await check_db_connectivity(engine)
        if not ok:
            return 1

        print("\n[8] Read-only")
        await check_readonly_guard(engine)

        print("\n[9] Extensões PostgreSQL")
        await check_extensions(engine)

        print("\n[10] Alembic head")
        await check_alembic_head(engine)

        print("\n[11] Tabelas obrigatórias")
        await check_required_tables(engine)

        print("\n[12] Aviso sobre seeds de produção")
        check_no_dev_seed_in_prod()
    finally:
        await engine.dispose()

    print(f"\n{SECTION}")
    if _ERRORS:
        print(f"  RESULTADO: {len(_ERRORS)} erro(s) crítico(s), {len(_WARNINGS)} aviso(s).")
        for e in _ERRORS:
            print(f"    [FAIL] {e}")
        print(SECTION)
        return 1

    if _WARNINGS:
        print(f"  RESULTADO: OK com {len(_WARNINGS)} aviso(s).")
    else:
        print("  RESULTADO: Todos os checks passaram.")
    print(SECTION)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
