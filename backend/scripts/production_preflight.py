"""production_preflight.py

Validações de pré-voo para ambiente de produção.
Deve ser executado APÓS `alembic upgrade head` e ANTES de subir a aplicação.

NÃO executa seeds de dados de desenvolvimento.
NÃO modifica o banco — apenas lê e valida.

Uso:
    python scripts/production_preflight.py

Sai com código 0 se tudo OK, 1 se encontrar problema crítico.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import sqlalchemy as sa

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


# ── 1. DATABASE_URL configurada ──────────────────────────────────────────────

def check_database_url() -> str | None:
    url = os.getenv("DATABASE_URL")
    if not url:
        try:
            from src.core.settings import settings
            url = settings.DATABASE_URL
        except Exception:
            pass

    if not url:
        _fail("DATABASE_URL não encontrada nas variáveis de ambiente nem em settings.")
        return None

    _ok(f"DATABASE_URL configurada: {url[:30]}…")
    return url


# ── 2. Detecta ambiente de produção ─────────────────────────────────────────

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


# ── 3. Banco acessível ───────────────────────────────────────────────────────

async def check_db_connectivity(engine: sa.ext.asyncio.AsyncEngine) -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(sa.text("SELECT 1"))
        _ok("Banco acessível.")
        return True
    except Exception as exc:
        _fail(f"Não foi possível conectar ao banco: {exc}")
        return False


# ── 4. Extensões necessárias ─────────────────────────────────────────────────

REQUIRED_EXTENSIONS = ["uuid-ossp", "pg_trgm"]

async def check_extensions(engine: sa.ext.asyncio.AsyncEngine) -> None:
    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text("SELECT extname FROM pg_extension")
        )
        installed = {row[0] for row in result.fetchall()}

    for ext in REQUIRED_EXTENSIONS:
        if ext in installed:
            _ok(f"Extensão '{ext}' instalada.")
        else:
            _fail(
                f"Extensão '{ext}' NÃO instalada. "
                "Execute no psql como superusuário: "
                f"CREATE EXTENSION IF NOT EXISTS \"{ext}\";"
            )


# ── 5. Alembic está no head ──────────────────────────────────────────────────

async def check_alembic_head(engine: sa.ext.asyncio.AsyncEngine) -> None:
    try:
        from alembic.config import Config
        from alembic.runtime.migration import MigrationContext
        from alembic.script import ScriptDirectory

        alembic_cfg = Config(str(ROOT_DIR / "alembic.ini"))
        alembic_cfg.set_main_option(
            "sqlalchemy.url",
            str(engine.url).replace("postgresql+asyncpg", "postgresql+psycopg2"),
        )
        script = ScriptDirectory.from_config(alembic_cfg)
        heads = set(script.get_heads())

        async with engine.connect() as conn:
            ctx = await conn.run_sync(
                lambda sync_conn: MigrationContext.configure(sync_conn)
            )
            current = set(ctx.get_current_heads())

        if current == heads:
            _ok(f"Alembic está no head: {heads}")
        else:
            _fail(
                f"Alembic NÃO está no head. "
                f"Atual: {current}, Head esperado: {heads}. "
                "Execute: alembic upgrade head"
            )
    except Exception as exc:
        _warn(f"Não foi possível verificar alembic heads: {exc}")


# ── 6. Tabelas críticas presentes ────────────────────────────────────────────

CRITICAL_TABLES = [
    "users", "candidates", "jobs", "job_areas",
    "resumes", "analyses", "analysis_results",
    "candidate_job_pipeline", "candidate_job_scores",
    "ai_models", "score_model_versions", "audit_logs",
]

async def check_critical_tables(engine: sa.ext.asyncio.AsyncEngine) -> None:
    async with engine.connect() as conn:
        result = await conn.execute(
            sa.text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_type='BASE TABLE'"
            )
        )
        existing = {row[0] for row in result.fetchall()}

    missing = [t for t in CRITICAL_TABLES if t not in existing]
    if missing:
        _fail(f"Tabelas críticas faltando: {missing}")
    else:
        _ok(f"{len(CRITICAL_TABLES)} tabelas críticas presentes.")


# ── 7. Alerta sobre admin dev ─────────────────────────────────────────────────

def check_no_dev_seed_in_prod() -> None:
    print(
        "\n  [INFO] Para criar o primeiro admin em produção, use:\n"
        "         python scripts/seed_dev_admin.py  (APENAS em dev)\n"
        "\n"
        "         Em produção, crie o admin manualmente via psql ou via endpoint\n"
        "         /admin/bootstrap (se disponível e protegido por BOOTSTRAP_SECRET).\n"
        "         Nunca use seeds de dev em produção."
    )


# ── Main ─────────────────────────────────────────────────────────────────────

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

    from src.infrastructure.database.connection import engine
    print("\n[3] Conectividade")
    ok = await check_db_connectivity(engine)
    if not ok:
        return 1

    print("\n[4] Extensões PostgreSQL")
    await check_extensions(engine)

    print("\n[5] Alembic head")
    await check_alembic_head(engine)

    print("\n[6] Tabelas críticas")
    await check_critical_tables(engine)

    print("\n[7] Aviso sobre seeds de produção")
    check_no_dev_seed_in_prod()

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
