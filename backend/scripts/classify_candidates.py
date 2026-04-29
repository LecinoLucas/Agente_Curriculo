#!/usr/bin/env python3
"""Batch classification script for candidate data quality.

Usage:
    python scripts/classify_candidates.py
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def run_classification() -> None:
    """Run batch classification for all candidates."""
    import os
    from src.application.services.data_quality_service import DataQualityService

    # Get database URL from environment
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:password@localhost:5432/resume_ai"
    )

    # Create async engine
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        logger.info("Starting candidate classification...")
        start_time = datetime.now(timezone.utc)

        async with async_session() as session:
            service = DataQualityService(session)
            counts = await service.reclassify_all_candidates()

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()

        # Print results
        logger.info("=" * 60)
        logger.info("Classification Complete")
        logger.info("=" * 60)
        logger.info(f"Time elapsed: {elapsed:.1f} seconds")
        logger.info(f"Total processed: {counts.get('total', 0)}")
        logger.info(f"  Valid: {counts.get('valid', 0)}")
        logger.info(f"  No resume: {counts.get('no_resume', 0)}")
        logger.info(f"  Empty resume: {counts.get('empty_resume', 0)}")
        logger.info(f"  Parsing failed: {counts.get('parsing_failed', 0)}")
        logger.info(f"  Invalid (manual): {counts.get('invalid_manual', 0)}")
        logger.info(f"  Unknown: {counts.get('unknown', 0)}")
        logger.info(f"  Failed to process: {counts.get('failed', 0)}")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Classification failed: {str(e)}", exc_info=True)
        sys.exit(1)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run_classification())
