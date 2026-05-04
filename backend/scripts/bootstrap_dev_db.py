import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.base import Base
from src.infrastructure.database.connection import engine

import src.infrastructure.database.models  # noqa: F401
from scripts.seed_ai_models import seed_ai_models


EXTENSIONS = (
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
    'CREATE EXTENSION IF NOT EXISTS "unaccent"',
    'CREATE EXTENSION IF NOT EXISTS "pg_trgm"',
)

SCHEMA_UPGRADES = (
    "ALTER TABLE IF EXISTS skills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE IF EXISTS skills ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
    "DROP INDEX IF EXISTS uq_skills_normalized_name",
    "ALTER TABLE IF EXISTS skills DROP CONSTRAINT IF EXISTS skills_normalized_name_key",
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_normalized_name_active
    ON skills (normalized_name)
    WHERE deleted_at IS NULL
    """,
)


async def table_exists(connection, table_name: str) -> bool:
    result = await connection.execute(
        text(
            """
            SELECT to_regclass(:table_name)
            """
        ),
        {"table_name": table_name},
    )
    return result.scalar() is not None


async def ensure_audit_logs_default_partition(connection) -> None:
    if not await table_exists(connection, "audit_logs"):
        return

    result = await connection.execute(
        text(
            """
            SELECT 1
            FROM pg_inherits inh
            JOIN pg_class child ON child.oid = inh.inhrelid
            JOIN pg_class parent ON parent.oid = inh.inhparent
            WHERE parent.relname = 'audit_logs'
              AND child.relname = 'audit_logs_default'
            LIMIT 1
            """
        )
    )

    if result.scalar() is None:
        await connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS audit_logs_default
                PARTITION OF audit_logs
                DEFAULT
                """
            )
        )

async def main() -> None:
    async with engine.begin() as connection:
        for statement in EXTENSIONS:
            await connection.execute(text(statement))

        await connection.run_sync(Base.metadata.create_all)

        await ensure_audit_logs_default_partition(connection)

        for statement in SCHEMA_UPGRADES:
            await connection.execute(text(statement))

        await seed_ai_models(connection)

    await engine.dispose()
    print("Banco de desenvolvimento preparado com sucesso.")


if __name__ == "__main__":
    asyncio.run(main())
