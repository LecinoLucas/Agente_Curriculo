from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

import structlog

from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

MATCHING_SOFT_TIME_LIMIT_SECONDS = 45
MATCHING_TIME_LIMIT_SECONDS = 60
RECOMPUTE_SOFT_TIME_LIMIT_SECONDS = 300
RECOMPUTE_TIME_LIMIT_SECONDS = 360


def _run_async(coro):
    return asyncio.run(coro)


@celery_app.task(
    bind=True,
    name="src.interface.workers.matching_tasks.match_analysis_to_job",
    max_retries=3,
    soft_time_limit=MATCHING_SOFT_TIME_LIMIT_SECONDS,
    time_limit=MATCHING_TIME_LIMIT_SECONDS,
)
def match_analysis_to_job(self, analysis_id: str, job_id: str):
    try:
        return _run_async(_match_analysis_to_job_async(analysis_id, job_id))

    except Exception as exc:
        logger.exception(
            "matching.task_failed",
            analysis_id=analysis_id,
            job_id=job_id,
            task_id=str(self.request.id),
            retries=self.request.retries,
            error=str(exc),
        )

        countdown = min(300, (2 ** self.request.retries) * 10)

        raise self.retry(
            exc=exc,
            countdown=countdown,
        ) from exc


async def _match_analysis_to_job_async(analysis_id: str, job_id: str) -> dict:
    from src.application.services.analysis_service import AnalysisService
    from src.infrastructure.database.connection import create_celery_async_sessionmaker
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )

    try:
        analysis_uuid = UUID(str(analysis_id))
        job_uuid = UUID(str(job_id))
    except ValueError as exc:
        logger.error(
            "matching.invalid_uuid",
            analysis_id=analysis_id,
            job_id=job_id,
            error=str(exc),
        )
        raise RuntimeError("Invalid analysis_id or job_id") from exc

    # ✅ CELERY-SPECIFIC: Create fresh engine + sessionmaker INSIDE this event loop
    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        async with celery_sessionmaker() as session:
            try:
                service = AnalysisService(SQLAlchemyAnalysisRepository(session))

                match = await asyncio.wait_for(
                    service.match_completed_analysis_to_job(
                        analysis_uuid,
                        job_uuid,
                    ),
                    timeout=35,
                )

                await session.commit()

                logger.info(
                    "matching.completed",
                    analysis_id=str(analysis_uuid),
                    job_id=str(job_uuid),
                    job_fit_score=str(match.job_fit_score),
                    recommendation=match.recommendation,
                )

                return {
                    "status": "completed",
                    "analysis_id": str(analysis_uuid),
                    "job_id": str(job_uuid),
                    "job_fit_score": str(match.job_fit_score),
                    "recommendation": match.recommendation,
                }

            except asyncio.TimeoutError as exc:
                await session.rollback()

                logger.exception(
                    "matching.timeout",
                    analysis_id=str(analysis_uuid),
                    job_id=str(job_uuid),
                    timeout_seconds=35,
                )

                raise RuntimeError("Matching timed out") from exc

            except Exception as exc:
                await session.rollback()

                logger.exception(
                    "matching.failed",
                    analysis_id=str(analysis_uuid),
                    job_id=str(job_uuid),
                    error=str(exc),
                )

                raise

    finally:
        # ✅ CRITICAL: Dispose engine BEFORE event loop exits
        await celery_engine.dispose()


# ---------------------------------------------------------------------------
# Task: recompute_job_matches_task
# Recomputes CandidateJobMatch / score / ranking for all active pipeline
# candidates of a job using PERSISTED profiles — no LLM, no AI provider calls.
# ---------------------------------------------------------------------------


@celery_app.task(
    bind=True,
    name="src.interface.workers.matching_tasks.recompute_job_matches_task",
    max_retries=3,
    soft_time_limit=RECOMPUTE_SOFT_TIME_LIMIT_SECONDS,
    time_limit=RECOMPUTE_TIME_LIMIT_SECONDS,
)
def recompute_job_matches_task(self, job_id: str) -> dict:
    try:
        return _run_async(_recompute_job_matches_async(job_id))
    except Exception as exc:
        logger.exception(
            "job_matches_recompute_failed",
            job_id=job_id,
            task_id=str(self.request.id),
            retries=self.request.retries,
            error=str(exc),
        )
        countdown = min(300, (2 ** self.request.retries) * 10)
        raise self.retry(exc=exc, countdown=countdown) from exc


async def _recompute_job_matches_async(job_id: str) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    try:
        job_uuid = UUID(str(job_id))
    except ValueError as exc:
        logger.error("recompute_job_matches.invalid_uuid", job_id=job_id, error=str(exc))
        raise RuntimeError("Invalid job_id") from exc

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        async with celery_sessionmaker() as session:
            try:
                result = await _do_recompute_job_matches(session, job_uuid)
                await session.commit()
                return result
            except Exception:
                await session.rollback()
                raise
    finally:
        await celery_engine.dispose()


async def _do_recompute_job_matches(session: Any, job_id: UUID) -> dict:
    import sqlalchemy as sa
    from sqlalchemy.ext.asyncio import AsyncSession

    from src.application.services.analysis_service import (
        AnalysisNotCompletedError,
        AnalysisResultNotFoundError,
        AnalysisService,
    )
    from src.infrastructure.database.models.candidate_job_pipeline_model import (
        CandidateJobPipelineModel,
    )
    from src.infrastructure.database.models.job_model import JobModel
    from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
        SQLAlchemyAnalysisRepository,
    )

    # Load job
    job = await session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    if job is None:
        logger.warning("recompute_job_matches.job_not_found", job_id=str(job_id))
        return {"status": "job_not_found", "processed": 0, "skipped": 0}

    # Get or create JobProfileAnalysis from job.job_profile_json — no LLM
    job_profile_analysis = await _get_or_create_job_profile_analysis_no_llm(session, job)
    if job_profile_analysis is None:
        logger.warning("recompute_job_matches.no_job_profile", job_id=str(job_id))
        return {"status": "no_job_profile", "processed": 0, "skipped": 0}

    # Fetch active, non-terminal pipeline entries
    active_entries = list(
        (
            await session.scalars(
                sa.select(CandidateJobPipelineModel).where(
                    CandidateJobPipelineModel.job_id == job_id,
                    CandidateJobPipelineModel.relationship_status == "active",
                    CandidateJobPipelineModel.is_terminal.is_(False),
                    CandidateJobPipelineModel.terminated_at.is_(None),
                )
            )
        ).all()
    )

    logger.info("job_matches_recompute_started", job_id=str(job_id))

    analysis_repo = SQLAlchemyAnalysisRepository(session)
    analysis_service = AnalysisService(analysis_repo)

    processed = 0
    skipped = 0

    for entry in active_entries:
        resume_version_id = getattr(entry, "resume_version_id", None)
        if resume_version_id is None:
            skipped += 1
            continue

        latest_completed = await analysis_repo.find_latest_completed_for_version(
            resume_version_id,
            job_id,
        )
        if latest_completed is None:
            skipped += 1
            logger.info(
                "recompute_job_matches.skipped_no_analysis",
                job_id=str(job_id),
                candidate_id=str(entry.candidate_id),
            )
            continue

        try:
            await analysis_service.recompute_match_from_existing_profiles(
                analysis_id=latest_completed.id,
                job_id=job_id,
                job_profile_analysis=job_profile_analysis,
            )
            processed += 1
        except (AnalysisNotCompletedError, AnalysisResultNotFoundError):
            skipped += 1
            logger.info(
                "recompute_job_matches.skipped_incomplete_analysis",
                job_id=str(job_id),
                candidate_id=str(entry.candidate_id),
                analysis_id=str(latest_completed.id),
            )
        except Exception:
            skipped += 1
            logger.warning(
                "recompute_job_matches.candidate_failed",
                job_id=str(job_id),
                candidate_id=str(entry.candidate_id),
                analysis_id=str(latest_completed.id),
                exc_info=True,
            )

    logger.info(
        "job_matches_recompute_completed",
        job_id=str(job_id),
        processed=processed,
        skipped=skipped,
    )
    return {"status": "completed", "processed": processed, "skipped": skipped}


async def _get_or_create_job_profile_analysis_no_llm(
    session: Any,
    job: Any,
) -> Any | None:
    """Return a JobProfileAnalysisModel for *job* without calling any LLM.

    Strategy:
    1. If job has a profile_hash, look for any existing record with that hash
       (any provider, active or inactive) — reactivate if needed.
    2. If no record found and job has job_profile_json, create a deterministic
       record from the persisted json without any AI call.
    3. Return None only if there is no hash and no existing record.
    """
    import sqlalchemy as sa
    from src.infrastructure.database.models.profile_analysis_model import JobProfileAnalysisModel

    if not job.job_profile_hash:
        return None

    # Look for any record matching the current hash (no provider filter)
    existing = await session.scalar(
        sa.select(JobProfileAnalysisModel)
        .where(
            JobProfileAnalysisModel.job_id == job.id,
            JobProfileAnalysisModel.job_signature_hash == job.job_profile_hash,
        )
        .order_by(
            JobProfileAnalysisModel.is_active.desc(),
            JobProfileAnalysisModel.created_at.desc(),
        )
    )

    if existing is not None:
        if not existing.is_active:
            existing.is_active = True
            existing.superseded_at = None
            await session.flush()
        return existing

    # No existing record — create a deterministic one from job_profile_json
    if not job.job_profile_json:
        return None

    profile_data = dict(job.job_profile_json)
    record = JobProfileAnalysisModel(
        job_id=job.id,
        provider="deterministic",
        model_id="deterministic",
        prompt_version="recompute_v1",
        job_signature_hash=job.job_profile_hash,
        job_area=profile_data.get("area"),
        seniority_required=profile_data.get("target_level"),
        education_required=job.minimum_education_level,
        experience_required=job.minimum_years_experience,
        responsibilities_json=list(profile_data.get("responsibilities", [])),
        raw_response_json=profile_data,
        input_tokens=None,
        output_tokens=None,
        is_active=True,
        superseded_at=None,
    )
    session.add(record)
    await session.flush()
    return record
