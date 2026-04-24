import structlog

from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)


@celery_app.task(
    bind=True,
    name="src.interface.workers.matching_tasks.match_analysis_to_job",
    max_retries=3,
)
def match_analysis_to_job(self, analysis_id: str, job_id: str):
    import asyncio
    return asyncio.run(_match_analysis_to_job_async(analysis_id, job_id))


async def _match_analysis_to_job_async(analysis_id: str, job_id: str):
    from uuid import UUID

    from src.application.services.analysis_service import AnalysisService
    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )

    async with AsyncSessionFactory() as session:
        try:
            service = AnalysisService(SQLAlchemyAnalysisRepository(session))

            match = await service.match_completed_analysis_to_job(
                UUID(analysis_id),
                UUID(job_id),
            )

            await session.commit()

            logger.info(
                "matching.completed",
                analysis_id=analysis_id,
                job_id=job_id,
                score=str(match.match_score),
                recommendation=match.recommendation,
            )
            return {
                "analysis_id": analysis_id,
                "job_id": job_id,
                "match_score": str(match.match_score),
                "recommendation": match.recommendation,
            }

        except Exception as exc:
            await session.rollback()
            logger.exception(
                "matching.failed",
                analysis_id=analysis_id,
                job_id=job_id,
                error=str(exc),
            )
            raise
