import asyncio
import sys
from pathlib import Path
import sqlalchemy as sa
from sqlalchemy.orm import selectinload

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from src.infrastructure.database.connection import create_celery_async_sessionmaker
from src.infrastructure.database.models.analysis_model import AnalysisModel
from src.infrastructure.database.models.audit_model import AuditLogModel
import json

async def main() -> None:
    engine, sessionmaker = await create_celery_async_sessionmaker()
    try:
        async with sessionmaker() as session:
            # Find analyses with unexpected_error related to prompt_chars_exceeded
            stmt = sa.select(AnalysisModel).where(
                AnalysisModel.status == "failed",
                AnalysisModel.provider_error_type == "unexpected_error",
                sa.or_(
                    AnalysisModel.failure_reason.ilike("%prompt_chars_exceeded%"),
                    AnalysisModel.failure_reason.ilike("%Prompt blocked before AI call%")
                )
            )
            result = await session.execute(stmt)
            analyses = result.scalars().all()
            
            print(f"Found {len(analyses)} analyses to sanitize.")
            
            for analysis in analyses:
                print(f"Sanitizing analysis {analysis.id}...")
                analysis.provider_error_type = "prompt_too_large"
                
                # Update the audit log
                audit_stmt = sa.select(AuditLogModel).where(
                    AuditLogModel.resource_id == analysis.id,
                    AuditLogModel.action == "ai_analysis_failed"
                )
                audit_result = await session.execute(audit_stmt)
                audit_logs = audit_result.scalars().all()
                for log in audit_logs:
                    meta = dict(log.metadata_)
                    if meta.get("provider_error_type") == "unexpected_error":
                        meta["provider_error_type"] = "prompt_too_large"
                        log.metadata_ = meta
                
            await session.commit()
            print("Sanitization complete.")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
