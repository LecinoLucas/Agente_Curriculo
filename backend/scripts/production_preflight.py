"""Read-only production preflight checks.

Run after ``alembic upgrade head`` and before starting the application.
This script intentionally does not import the application engine/settings, create
tables, run seeds, create users, or insert demo data.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

SECTION = "=" * 60
_ERRORS: list[str] = []
_WARNINGS: list[str] = []


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


def check_database_url() -> str | None:
    url = os.getenv("DATABASE_URL")
    if not url:
        _fail("DATABASE_URL não encontrada nas variáveis de ambiente.")
        return None

    try:
        make_url(url)
    except Exception as exc:
        _fail(f"DATABASE_URL inválida: {exc}")
        return None

    _ok(f"DATABASE_URL configurada: {_render_safe_url(url)}")
    return url


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
    print(SECTION)
    print("  Production Preflight — Agente Currículo")
    print(SECTION)

    print("\n[1] DATABASE_URL")
    url = check_database_url()
    if not url:
        return 1

    print("\n[2] Ambiente")
    check_not_dev_seed_safe(url)

    engine = create_readonly_engine(url)
    try:
        print("\n[3] Conectividade")
        ok = await check_db_connectivity(engine)
        if not ok:
            return 1

        print("\n[4] Read-only")
        await check_readonly_guard(engine)

        print("\n[5] Extensões PostgreSQL")
        await check_extensions(engine)

        print("\n[6] Alembic head")
        await check_alembic_head(engine)

        print("\n[7] Tabelas obrigatórias")
        await check_required_tables(engine)

        print("\n[8] Aviso sobre seeds de produção")
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
