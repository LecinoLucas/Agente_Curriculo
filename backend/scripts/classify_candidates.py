#!/usr/bin/env python3
"""Batch classification script for candidate data quality.

Uso:
    python scripts/classify_candidates.py
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL não configurado.")

    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    return database_url


async def run_classification() -> None:
    from src.application.services.data_quality_service import DataQualityService

    database_url = get_database_url()

    engine = create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
    )

    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    start_time = datetime.now(UTC)

    try:
        logger.info("Starting candidate classification...")

        async with async_session() as session:
            service = DataQualityService(session)
            counts = await service.reclassify_all_candidates()
            await session.commit()

        elapsed = (datetime.now(UTC) - start_time).total_seconds()

        logger.info("=" * 60)
        logger.info("Classification Complete")
        logger.info("=" * 60)
        logger.info("Time elapsed: %.1f seconds", elapsed)
        logger.info("Total processed: %s", counts.get("total", 0))
        logger.info("  Valid: %s", counts.get("valid", 0))
        logger.info("  No resume: %s", counts.get("no_resume", 0))
        logger.info("  Empty resume: %s", counts.get("empty_resume", 0))
        logger.info("  Parsing failed: %s", counts.get("parsing_failed", 0))
        logger.info("  Invalid manual: %s", counts.get("invalid_manual", 0))
        logger.info("  Unknown: %s", counts.get("unknown", 0))
        logger.info("  Failed to process: %s", counts.get("failed", 0))
        logger.info("=" * 60)

    except Exception:
        logger.exception("Classification failed")
        raise

    finally:
        await engine.dispose()


if __name__ == "__main__":
    configure_logging()

    try:
        asyncio.run(run_classification())
    except Exception:
        sys.exit(1)