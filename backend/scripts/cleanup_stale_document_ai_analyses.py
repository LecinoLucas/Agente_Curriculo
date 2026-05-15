#!/usr/bin/env python
"""
Cleanup script for stale document AI analyses that are stuck in 'processing' state.

This script finds all DocumentAIAnalysisModel records that have been in 'processing'
state for longer than the specified timeout (default 120 seconds) and resets them
to 'pending' state to allow retry.

Usage:
    python scripts/cleanup_stale_document_ai_analyses.py [--timeout-seconds 120] [--candidate-email email@example.com]
"""

import asyncio
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import click
import sqlalchemy as sa

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.infrastructure.database.connection import create_celery_async_sessionmaker
from src.infrastructure.database.models.document_ai_analysis_model import (
    DocumentAIAnalysisModel,
)
from src.infrastructure.database.models.admission_model import Admission, CandidateDocument
from src.infrastructure.database.models.candidate_model import CandidateModel


async def cleanup_stale_analyses(timeout_seconds: int = 120, candidate_email: str | None = None):
    engine, async_session_maker = await create_celery_async_sessionmaker()

    try:
        cutoff_time = datetime.now(UTC) - timedelta(seconds=timeout_seconds)

        async with async_session_maker() as session:
            query = (
                sa.select(DocumentAIAnalysisModel)
                .where(
                    DocumentAIAnalysisModel.status == "processing",
                    DocumentAIAnalysisModel.created_at < cutoff_time,
                )
            )

            if candidate_email:
                query = (
                    query
                    .join(
                        CandidateDocument,
                        CandidateDocument.id == DocumentAIAnalysisModel.document_id,
                    )
                    .join(
                        Admission,
                        Admission.id == CandidateDocument.admission_id,
                    )
                    .join(
                        CandidateModel,
                        CandidateModel.id == Admission.candidate_id,
                    )
                    .where(CandidateModel.email == candidate_email)
                )

            result = await session.execute(query)
            stale_analyses = result.scalars().all()

            if not stale_analyses:
                click.echo(f"✓ No stale analyses found (timeout: {timeout_seconds}s)")
                return 0

            click.echo(
                f"Found {len(stale_analyses)} stale analysis(es) in 'processing' state "
                f"for > {timeout_seconds} seconds"
            )

            count = 0
            for analysis in stale_analyses:
                document = await session.scalar(
                    sa.select(CandidateDocument).where(
                        CandidateDocument.id == analysis.document_id
                    )
                )
                admission = await session.scalar(
                    sa.select(Admission).where(
                        Admission.id == document.admission_id
                    )
                ) if document else None
                candidate = await session.scalar(
                    sa.select(CandidateModel).where(
                        CandidateModel.id == admission.candidate_id
                    )
                ) if admission else None

                click.echo(
                    f"  → Resetting analysis {analysis.id} "
                    f"(document: {analysis.document_id}, "
                    f"candidate: {candidate.email if candidate else 'unknown'})"
                )

                analysis.status = "pending"
                analysis.error_message = "reset_from_stale_processing"
                count += 1

            await session.commit()
            click.echo(f"✓ Reset {count} analysis(es) back to 'pending' state")
            return count

    finally:
        await engine.dispose()


@click.command()
@click.option(
    "--timeout-seconds",
    type=int,
    default=120,
    help="Timeout in seconds (default: 120)",
)
@click.option(
    "--candidate-email",
    type=str,
    default=None,
    help="Filter by candidate email (e.g., teste8@gmail.com)",
)
def main(timeout_seconds: int, candidate_email: str | None):
    """Cleanup stale document AI analyses stuck in 'processing' state."""
    click.echo(
        f"Cleaning up stale document AI analyses (timeout: {timeout_seconds}s)"
    )
    if candidate_email:
        click.echo(f"Filtering by candidate: {candidate_email}")

    count = asyncio.run(cleanup_stale_analyses(timeout_seconds, candidate_email))
    exit(0 if count >= 0 else 1)


if __name__ == "__main__":
    main()
