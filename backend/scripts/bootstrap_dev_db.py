"""Legacy dev helper for preparing the local database.

Schema creation is delegated to Alembic. This script remains only as a
compatibility wrapper for older local workflows.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))


def upgrade_schema() -> None:
    alembic_cfg = Config(str(ROOT_DIR / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


async def seed_minimal_dev_data() -> None:
    from scripts.seed_ai_models import seed_ai_models
    from src.infrastructure.database.connection import engine

    async with engine.begin() as connection:
        await seed_ai_models(connection)

    await engine.dispose()


def main() -> None:
    upgrade_schema()
    asyncio.run(seed_minimal_dev_data())
    print("Banco de desenvolvimento preparado com Alembic.")


if __name__ == "__main__":
    main()
