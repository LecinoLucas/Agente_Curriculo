import asyncio
from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
import structlog

from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel
from src.interface.workers.matching_dispatcher import enqueue_published_job_matches

logger = structlog.get_logger(__name__)


def enqueue_dev_analysis(analysis_id: UUID) -> None:
    logger.warning(
        "analysis.dev_mock_enqueued",
        analysis_id=str(analysis_id),
        message=(
            "[DEV_MOCK] Enqueueing synthetic analysis — scores are NOT real AI output. "
            "Set ENABLE_DEV_MOCK=false and provide ANTHROPIC_API_KEY for real results."
        ),
    )
    task = asyncio.create_task(_process_analysis(analysis_id))

    def _log_task_result(done_task: asyncio.Task[None]) -> None:
        try:
            done_task.result()
        except Exception as exc:  # pragma: no cover - only for background failures
            logger.exception(
                "analysis.dev.background_failed",
                analysis_id=str(analysis_id),
                error=str(exc),
            )

    task.add_done_callback(_log_task_result)


async def _process_analysis(analysis_id: UUID) -> None:
    now = datetime.now(UTC)
    started_at = now
    worker_id = "dev-inline-worker"
    task_id = f"inline-{analysis_id}"

    await asyncio.sleep(0.4)

    async with AsyncSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if analysis is None:
            logger.warning("analysis.dev.not_found", analysis_id=str(analysis_id))
            return

        if analysis.status != "pending":
            logger.info(
                "analysis.dev.skipped",
                analysis_id=str(analysis_id),
                status=analysis.status,
            )
            return

        analysis.status = "processing"
        analysis.started_at = started_at
        analysis.worker_id = worker_id
        analysis.task_id = task_id
        analysis.updated_at = datetime.now(UTC)
        await session.commit()

    await asyncio.sleep(1.2)

    async with AsyncSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if analysis is None:
            return
        if analysis.status == "cancelled":
            return

        base = 60 + (analysis_id.int % 35)
        overall = min(98, base)
        technical = min(99, overall + 3)
        experience = max(40, overall - 5)
        education = max(35, overall - 8)
        communication = min(98, overall + 1)
        leadership = max(30, overall - 10)

        result = await session.scalar(
            sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis_id)
        )
        if result is None:
            session.add(
                AnalysisResultModel(
                    analysis_id=analysis_id,
                    overall_score=overall,
                    technical_score=technical,
                    experience_score=experience,
                    education_score=education,
                    communication_score=communication,
                    leadership_score=leadership,
                    candidate_summary=(
                        "Candidato com perfil técnico consistente para vagas de tecnologia."
                    ),
                    seniority_level="mid" if overall < 80 else "senior",
                    total_experience_years=4.0 if overall < 80 else 6.0,
                    highest_education_level="bachelor",
                    highest_education_field="Computação",
                    strengths=["Fundamentos técnicos", "Boa comunicação"],
                    weaknesses=["Pouca evidência de liderança formal"],
                    recommendations=[
                        "Aprofundar cases de impacto",
                        "Detalhar resultados por projeto",
                    ],
                    keywords=["python", "sql", "api", "backend"],
                    extracted_data={
                        "education": [{"level": "bachelor", "field": "Computação"}],
                        "languages": ["pt", "en"],
                    },
                    input_tokens=1200,
                    output_tokens=450,
                    cache_read_tokens=0,
                    cache_write_tokens=0,
                    processing_time_ms=1600,
                    raw_llm_response='{"status":"ok","source":"dev_mock","note":"ENABLE_DEV_MOCK=true"}',
                    prompt_version_used="dev_mock",
                )
            )

        analysis.status = "completed"
        analysis.completed_at = datetime.now(UTC)
        analysis.updated_at = datetime.now(UTC)
        await session.commit()

    await _enqueue_matching_pipeline(analysis_id)
    logger.info("analysis.dev.completed", analysis_id=str(analysis_id))


async def _enqueue_matching_pipeline(analysis_id: UUID) -> None:
    try:
        matched = await enqueue_published_job_matches(analysis_id)
        logger.info(
            "analysis.dev.matching_enqueued",
            analysis_id=str(analysis_id),
            matching_jobs=matched,
        )
    except Exception as exc:
        logger.exception(
            "analysis.dev.matching_enqueue_failed",
            analysis_id=str(analysis_id),
            error=str(exc),
        )
