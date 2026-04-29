#!/usr/bin/env python3
"""Controlled truncation script for dev environment.

This script safely removes test data from a dev environment.
Only works with DATABASE_URL containing "localhost" or "test" to prevent
accidental deletion from production.

Usage:
    python scripts/dev_truncate_candidates.py [--force]

Options:
    --force  Skip confirmation prompt
"""

import asyncio
import logging
import sys
import os
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def truncate_dev_data(force: bool = False) -> None:
    """Truncate candidate data in dev environment."""
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:password@localhost:5432/resume_ai"
    )

    # Safety check: only allow on localhost or test databases
    if not ("localhost" in database_url or "test" in database_url.lower()):
        logger.error("❌ Safety check failed: DATABASE_URL must contain 'localhost' or 'test'")
        logger.error("This script is only for development environments.")
        sys.exit(1)

    logger.info(f"Database URL: {database_url.split('@')[-1]}")

    if not force:
        response = input(
            "⚠️  This will DELETE all candidates and related data from the database.\n"
            "Are you sure? Type 'yes' to confirm: "
        )
        if response.lower() != "yes":
            logger.info("Truncation cancelled.")
            sys.exit(0)

    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        logger.info("Starting truncation...")
        start_time = datetime.now(timezone.utc)

        async with async_session() as session:
            # Delete in correct order to respect foreign keys
            logger.info("Deleting resume versions...")
            await session.execute(text("DELETE FROM resume_versions"))

            logger.info("Deleting resumes...")
            await session.execute(text("DELETE FROM resumes"))

            logger.info("Deleting candidates...")
            await session.execute(text("DELETE FROM candidates"))

            await session.commit()

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

        logger.info("=" * 60)
        logger.info("✅ Truncation Complete")
        logger.info("=" * 60)
        logger.info(f"Time elapsed: {elapsed:.1f} seconds")
        logger.info("All candidate data has been removed.")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Truncation failed: {str(e)}", exc_info=True)
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    force = "--force" in sys.argv
    asyncio.run(truncate_dev_data(force=force))
