import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.infrastructure.database.base import Base
from src.infrastructure.database.connection import engine

# Importa os modelos para registrar todas as tabelas no metadata.
import src.infrastructure.database.models  # noqa: F401


EXTENSIONS = (
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto"',
    'CREATE EXTENSION IF NOT EXISTS "unaccent"',
    'CREATE EXTENSION IF NOT EXISTS "pg_trgm"',
)

AI_MODELS = (
    ("anthropic", "claude-sonnet-4-6", "Claude Sonnet 4.6", 200000),
    ("anthropic", "claude-opus-4-7", "Claude Opus 4.7", 200000),
    ("anthropic", "claude-haiku-4-5-20251001", "Claude Haiku 4.5", 200000),
)

SCHEMA_UPGRADES = (
    "ALTER TABLE skills ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    "ALTER TABLE skills ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ",
    "DROP INDEX IF EXISTS uq_skills_normalized_name",
    "ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_normalized_name_key",
    """
    CREATE UNIQUE INDEX IF NOT EXISTS uq_skills_normalized_name_active
    ON skills (normalized_name)
    WHERE deleted_at IS NULL
    """,
)


async def main() -> None:
    async with engine.begin() as connection:
        for statement in EXTENSIONS:
            await connection.execute(text(statement))

        await connection.run_sync(Base.metadata.create_all)

        for statement in SCHEMA_UPGRADES:
            await connection.execute(text(statement))

        for provider, model_id, model_name, context_window in AI_MODELS:
            await connection.execute(
                text(
                    """
                    INSERT INTO ai_models (provider, model_id, model_name, context_window)
                    VALUES (:provider, :model_id, :model_name, :context_window)
                    ON CONFLICT (model_id) DO NOTHING
                    """
                ),
                {
                    "provider": provider,
                    "model_id": model_id,
                    "model_name": model_name,
                    "context_window": context_window,
                },
            )

    await engine.dispose()
    print("Banco de desenvolvimento preparado com sucesso.")


if __name__ == "__main__":
    asyncio.run(main())
