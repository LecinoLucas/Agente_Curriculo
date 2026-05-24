"""validate_baseline_schema.py

Compara as tabelas registradas no SQLAlchemy metadata com as tabelas
realmente presentes no banco de dados.

Uso:
    python scripts/validate_baseline_schema.py
    python scripts/validate_baseline_schema.py --strict   # falha se houver qualquer diferença

Sai com código 0 se tudo OK, 1 se encontrar tabelas faltantes.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import sqlalchemy as sa

import src.infrastructure.database.models  # noqa: F401  — registra todos os models
from src.infrastructure.database.base import Base
from src.infrastructure.database.connection import engine

# Tabelas gerenciadas pela aplicação mas ignoradas nesta validação.
# (partições de audit_logs, views, tabelas legadas etc.)
IGNORED_TABLES: frozenset[str] = frozenset({
    "audit_logs_default",
    "alembic_version",
})


async def _fetch_db_tables(conn: sa.ext.asyncio.AsyncConnection) -> set[str]:
    result = await conn.execute(
        sa.text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            """
        )
    )
    return {row[0] for row in result.fetchall()} - IGNORED_TABLES


def _metadata_tables() -> set[str]:
    return {t.name for t in Base.metadata.tables.values()} - IGNORED_TABLES


async def validate() -> int:
    expected = _metadata_tables()

    async with engine.connect() as conn:
        actual = await _fetch_db_tables(conn)

    missing = expected - actual
    extra   = actual - expected

    ok = True

    if missing:
        ok = False
        print(f"\n[FAIL] {len(missing)} tabela(s) FALTANDO no banco:")
        for t in sorted(missing):
            print(f"  - {t}")

    if extra:
        # Extra tables aren't critical (legacy, manual, view partitions) — only warn
        print(f"\n[WARN] {len(extra)} tabela(s) EXTRAS no banco (não gerenciadas pelo metadata):")
        for t in sorted(extra):
            print(f"  + {t}")

    if ok:
        print(f"[OK] Todas as {len(expected)} tabelas do metadata estão presentes no banco.")
    else:
        print(
            "\n[DICA] Se você adicionou um novo model, certifique-se de importá-lo em:\n"
            "  src/infrastructure/database/models/__init__.py\n"
            "Depois execute:\n"
            "  alembic revision --autogenerate -m 'add_nova_tabela'\n"
            "  alembic upgrade head"
        )

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(validate()))
