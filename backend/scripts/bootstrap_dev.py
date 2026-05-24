"""bootstrap_dev.py

Orquestra seeds mínimos para ambiente de desenvolvimento.
Pressupõe que `alembic upgrade head` já foi executado.

Uso:
    python scripts/bootstrap_dev.py
    python scripts/bootstrap_dev.py --skip-jobs   # pula seed de vagas demo

Ordem de execução:
    1. Validar que as tabelas críticas existem (migration aplicada)
    2. Seed de modelos de AI
    3. Seed de versão de scoring
    4. Seed de admin dev
    5. Seed de catálogo de skills (JSON)
    6. Seed de skills legadas
    7. Seed de áreas de vagas
    8. Seed de vagas demo (opcional, desabilitável)

É idempotente: pode ser re-executado sem duplicar dados.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import sqlalchemy as sa

from src.infrastructure.database.connection import AsyncSessionFactory, engine

# Tabelas obrigatórias — se alguma faltar, as migrations não foram aplicadas.
REQUIRED_TABLES = [
    "users",
    "ai_models",
    "score_model_versions",
    "skill_catalog",
    "job_areas",
    "jobs",
]

SECTION = "=" * 55


async def _table_exists(conn: sa.ext.asyncio.AsyncConnection, name: str) -> bool:
    result = await conn.execute(
        sa.text("SELECT to_regclass(:t)"), {"t": name}
    )
    return result.scalar() is not None


async def _check_migrations_applied() -> None:
    async with engine.connect() as conn:
        missing = [
            t for t in REQUIRED_TABLES
            if not await _table_exists(conn, t)
        ]
    if missing:
        print(f"\n[ERRO] Tabelas críticas não encontradas: {missing}")
        print("Execute primeiro:  alembic upgrade head")
        sys.exit(1)
    print("[OK] Tabelas críticas presentes.")


async def _run_seed_ai_models() -> None:
    from scripts.seed_ai_models import seed_ai_models
    async with engine.begin() as conn:
        await seed_ai_models(conn)
    print("[OK] AI models.")


async def _run_seed_scoring_version() -> None:
    from scripts.seed_scoring_version import main as seed_scoring
    await seed_scoring()
    print("[OK] Scoring version.")


async def _run_seed_dev_admin() -> None:
    from scripts.seed_dev_admin import main as seed_admin
    await seed_admin()
    print("[OK] Admin dev.")


async def _run_seed_skill_catalog() -> None:
    from scripts.seed_skill_catalog_from_json import main as seed_catalog
    await seed_catalog()
    print("[OK] Skill catalog (JSON).")


async def _run_seed_skills() -> None:
    from scripts.seed_skills import main as seed_skills
    await seed_skills()
    print("[OK] Skills legadas.")


async def _run_seed_job_areas() -> None:
    from scripts.seed_job_areas import main as seed_areas
    await seed_areas()
    print("[OK] Áreas de vagas.")


async def _run_seed_jobs() -> None:
    from scripts.seed_jobs import main as seed_jobs
    await seed_jobs()
    print("[OK] Vagas demo.")


async def main(skip_jobs: bool = False) -> None:
    print(SECTION)
    print("  Bootstrap Dev — Agente Currículo")
    print(SECTION)

    print("\n[1/7] Verificando migrations...")
    await _check_migrations_applied()

    print("\n[2/7] AI Models...")
    await _run_seed_ai_models()

    print("\n[3/7] Scoring Version...")
    await _run_seed_scoring_version()

    print("\n[4/7] Admin Dev...")
    await _run_seed_dev_admin()

    print("\n[5/7] Skill Catalog...")
    await _run_seed_skill_catalog()

    print("\n[6/7] Skills legadas...")
    await _run_seed_skills()

    print("\n[7/7] Áreas de vagas...")
    await _run_seed_job_areas()

    if not skip_jobs:
        print("\n[8/8] Vagas demo...")
        await _run_seed_jobs()
    else:
        print("\n[8/8] Vagas demo — PULADO (--skip-jobs).")

    await engine.dispose()

    print(f"\n{SECTION}")
    print("  Bootstrap Dev concluído com sucesso!")
    print(SECTION)


if __name__ == "__main__":
    skip_jobs = "--skip-jobs" in sys.argv
    asyncio.run(main(skip_jobs=skip_jobs))
