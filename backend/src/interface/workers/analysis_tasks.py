import asyncio
import socket
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
import structlog

from src.core.settings import settings
from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

_PLACEHOLDER_RESUME = (
    "Currículo não disponível para análise. "
    "O arquivo PDF ainda não foi carregado ou o texto não foi extraído."
)


def _provider_api_key_is_configured(provider: str) -> bool:
    normalized = provider.strip().lower()

    if normalized in {"anthropic", "claude"}:
        return bool(settings.ANTHROPIC_API_KEY)
    if normalized in {"google", "gemini"}:
        return bool(settings.GOOGLE_API_KEY)

    raise RuntimeError(f"Unsupported AI provider configured for analysis: {provider}")


def _provider_api_key_hint(provider: str) -> str:
    normalized = provider.strip().lower()

    if normalized in {"anthropic", "claude"}:
        return "ANTHROPIC_API_KEY"
    if normalized in {"google", "gemini"}:
        return "GOOGLE_API_KEY"

    return f"API key for provider '{provider}'"


def _real_ai_calls_allowed() -> bool:
    return settings.ALLOW_AI_TOKEN_SPEND


@celery_app.task(
    bind=True,
    name="src.interface.workers.analysis_tasks.process_analysis",
    max_retries=3,
)
def process_analysis(self, analysis_id: str) -> dict:  # type: ignore[override]
    try:
        return asyncio.run(_process_analysis_async(analysis_id, self.request.id))
    except Exception as exc:
        logger.error("analysis.task_failed", analysis_id=analysis_id, error=str(exc))
        retry_count = self.request.retries + 1
        countdown = 2 ** self.request.retries * 30

        if retry_count > self.max_retries:
            asyncio.run(
                _mark_analysis_failed(
                    analysis_id=analysis_id,
                    task_id=self.request.id,
                    error=str(exc),
                    retry_count=self.request.retries,
                )
            )
            raise

        asyncio.run(
            _mark_analysis_retry_scheduled(
                analysis_id=analysis_id,
                task_id=self.request.id,
                error=str(exc),
                retry_count=retry_count,
                countdown_seconds=countdown,
            )
        )
        raise self.retry(exc=exc, countdown=countdown) from exc


async def _process_analysis_async(analysis_id: str, task_id: str) -> dict:
    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.database.models.analysis_model import AnalysisModel, AnalysisResultModel

    worker_id = f"{socket.gethostname()}:{task_id}"
    now = datetime.now(UTC)

    # ── Step 1: fetch Analysis + ResumeVersion ─────────────────────────────────
    async with AsyncSessionFactory() as session:
        from src.infrastructure.database.models.analysis_model import (
            AIModelModel,
            PromptTemplateModel,
        )
        from src.infrastructure.database.models.resume_model import ResumeVersionModel

        row = await session.execute(
            sa.select(AnalysisModel, ResumeVersionModel, PromptTemplateModel, AIModelModel)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(PromptTemplateModel, PromptTemplateModel.id == AnalysisModel.prompt_template_id)
            .join(AIModelModel, AIModelModel.id == AnalysisModel.ai_model_id)
            .where(AnalysisModel.id == analysis_id)
        )
        fetched = row.first()
        if fetched is None:
            logger.warning("analysis.not_found", analysis_id=analysis_id)
            return {"analysis_id": analysis_id, "status": "not_found"}

        analysis, version, prompt_tpl, ai_model = fetched

        if analysis.status != "pending":
            logger.info("analysis.skipped", analysis_id=analysis_id, status=analysis.status)
            return {"analysis_id": analysis_id, "status": analysis.status}

        resume_text: str = version.extracted_text or _PLACEHOLDER_RESUME

        # ── Step 2: mark PROCESSING ────────────────────────────────────────────
        analysis.status = "processing"
        analysis.started_at = now
        analysis.worker_id = worker_id
        analysis.task_id = str(task_id)
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.next_retry_at = None
        analysis.updated_at = datetime.now(UTC)
        await session.commit()

    logger.info("analysis.processing_started", analysis_id=analysis_id, worker_id=worker_id)

    # ── Step 3-6: call AI provider + parse ─────────────────────────────────────
    if not _provider_api_key_is_configured(ai_model.provider):
        if not settings.ENABLE_DEV_MOCK:
            # Fail fast — never produce synthetic scores silently in real envs.
            raise RuntimeError(
                f"{_provider_api_key_hint(ai_model.provider)} is not configured and "
                "ENABLE_DEV_MOCK is False. "
                f"Set {_provider_api_key_hint(ai_model.provider)} or set "
                "ENABLE_DEV_MOCK=true (dev only)."
            )
        logger.warning(
            "analysis.dev_mock_active",
            analysis_id=analysis_id,
            provider=ai_model.provider,
            message="[DEV_MOCK] Generating synthetic scores — NOT real AI output.",
        )
        result_fields = _dev_fallback_scores(analysis_id)
        raw_response = '{"source":"dev_fallback","note":"ENABLE_DEV_MOCK=true"}'
        prompt_version = "dev_fallback"
        input_tokens = output_tokens = cache_read = cache_write = processing_ms = 0
    elif not _real_ai_calls_allowed():
        raise RuntimeError(
            "ALLOW_AI_TOKEN_SPEND is False. Real AI calls are blocked to avoid token "
            "usage. Set ALLOW_AI_TOKEN_SPEND=true when you want to spend tokens."
        )
    else:
        from src.application.ports.ai_service import AIAnalysisRequest
        from src.infrastructure.ai.factory import AIServiceFactory
        from src.infrastructure.ai.prompts.v1_full_analysis import (
            JOB_CONTEXT_TEMPLATE,
            SYSTEM_PROMPT,
            USER_PROMPT_TEMPLATE,
        )
        from src.infrastructure.ai.prompts.v1_full_analysis import (
            NAME as PROMPT_NAME,
        )
        from src.infrastructure.ai.prompts.v1_full_analysis import (
            VERSION as PROMPT_VERSION,
        )
        from src.infrastructure.ai.response_parser import parse_analysis_response

        job_context = ""
        if analysis.job_id:
            async with AsyncSessionFactory() as session:
                from src.infrastructure.database.models.job_model import JobModel
                job = await session.scalar(
                    sa.select(JobModel).where(JobModel.id == analysis.job_id)
                )
                if job and job.description:
                    job_context = JOB_CONTEXT_TEMPLATE.format(job_description=job.description)

        user_prompt = USER_PROMPT_TEMPLATE.format(
            resume_text=resume_text,
            job_context=job_context,
        )

        ai_request = AIAnalysisRequest(
            resume_text=resume_text,
            system_prompt=SYSTEM_PROMPT,
            prompt_template=user_prompt,
            max_tokens=int(prompt_tpl.max_tokens),
            temperature=float(prompt_tpl.temperature),
            job_description=None,
        )

        try:
            ai_response = await asyncio.wait_for(
                AIServiceFactory.create(ai_model.provider, ai_model.model_id).analyze(ai_request),
                timeout=60.0,
            )
        except TimeoutError as exc:
            raise RuntimeError(
                f"AI provider call timed out after 60s for analysis {analysis_id}"
            ) from exc

        result_fields = parse_analysis_response(ai_response.content)
        raw_response = ai_response.content
        prompt_version = f"{PROMPT_NAME}_v{PROMPT_VERSION}"
        input_tokens = ai_response.input_tokens
        output_tokens = ai_response.output_tokens
        cache_read = ai_response.cache_read_tokens
        cache_write = ai_response.cache_write_tokens
        processing_ms = ai_response.processing_time_ms

    # ── Step 7: persist result + mark COMPLETED ────────────────────────────────
    async with AsyncSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if analysis is None:
            return {"analysis_id": analysis_id, "status": "lost"}

        if analysis.status == "cancelled":
            logger.info("analysis.cancelled_mid_flight", analysis_id=analysis_id)
            return {"analysis_id": analysis_id, "status": "cancelled"}

        existing_result = await session.scalar(
            sa.select(AnalysisResultModel).where(
                AnalysisResultModel.analysis_id == analysis_id
            )
        )
        if existing_result is None:
            session.add(
                AnalysisResultModel(
                    analysis_id=analysis_id,
                    overall_score=result_fields["overall_score"],
                    technical_score=result_fields["technical_score"],
                    experience_score=result_fields["experience_score"],
                    education_score=result_fields["education_score"],
                    communication_score=result_fields["communication_score"],
                    leadership_score=result_fields["leadership_score"],
                    candidate_summary=result_fields["candidate_summary"],
                    seniority_level=result_fields["seniority_level"],
                    total_experience_years=result_fields["total_experience_years"],
                    highest_education_level=result_fields["highest_education_level"],
                    highest_education_field=result_fields["highest_education_field"],
                    strengths=result_fields["strengths"],
                    weaknesses=result_fields["weaknesses"],
                    recommendations=result_fields["recommendations"],
                    keywords=result_fields["keywords"],
                    extracted_data=result_fields["extracted_data"],
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_read_tokens=cache_read,
                    cache_write_tokens=cache_write,
                    processing_time_ms=processing_ms,
                    raw_llm_response=raw_response,
                    prompt_version_used=prompt_version,
                )
            )

        analysis.status = "completed"
        analysis.completed_at = datetime.now(UTC)
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.next_retry_at = None
        analysis.updated_at = datetime.now(UTC)
        await session.commit()

    await _enqueue_matching_pipeline(analysis_id)
    logger.info("analysis.processing_completed", analysis_id=analysis_id)
    return {"analysis_id": analysis_id, "status": "completed"}


async def _enqueue_matching_pipeline(analysis_id: str) -> None:
    from uuid import UUID

    from src.interface.workers.matching_dispatcher import enqueue_published_job_matches

    try:
        matched = await enqueue_published_job_matches(UUID(analysis_id))
        logger.info(
            "analysis.matching_enqueued",
            analysis_id=analysis_id,
            matching_jobs=matched,
        )
    except Exception as exc:
        logger.exception(
            "analysis.matching_enqueue_failed",
            analysis_id=analysis_id,
            error=str(exc),
        )


async def _mark_analysis_retry_scheduled(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
    countdown_seconds: int,
) -> None:
    from uuid import UUID

    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    analysis_uuid = UUID(analysis_id) if isinstance(analysis_id, str) else analysis_id

    async with AsyncSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_uuid)
        )
        if analysis is None:
            return

        now = datetime.now(UTC)
        analysis.status = "pending"
        analysis.task_id = str(task_id) if task_id is not None else analysis.task_id
        analysis.retry_count = retry_count
        analysis.failure_reason = error
        analysis.failed_at = None
        analysis.next_retry_at = now + timedelta(seconds=countdown_seconds)
        analysis.updated_at = now
        await session.commit()


async def _mark_analysis_failed(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
) -> None:
    from uuid import UUID

    from src.infrastructure.database.connection import AsyncSessionFactory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    analysis_uuid = UUID(analysis_id) if isinstance(analysis_id, str) else analysis_id

    async with AsyncSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_uuid)
        )
        if analysis is None:
            return

        now = datetime.now(UTC)
        analysis.status = "failed"
        analysis.task_id = str(task_id) if task_id is not None else analysis.task_id
        analysis.retry_count = retry_count
        analysis.failure_reason = error
        analysis.failed_at = now
        analysis.next_retry_at = None
        analysis.updated_at = now
        await session.commit()


def _dev_fallback_scores(analysis_id: str) -> dict:
    from uuid import UUID

    seed = UUID(analysis_id).int % 35
    overall = min(98.0, 60 + seed)
    return {
        "overall_score": overall,
        "technical_score": min(99.0, overall + 3),
        "experience_score": max(40.0, overall - 5),
        "education_score": max(35.0, overall - 8),
        "communication_score": min(98.0, overall + 1),
        "leadership_score": max(30.0, overall - 10),
        "candidate_summary": "[MOCK] Resultado simulado para desenvolvimento. Não representa análise real.",
        "seniority_level": "mid" if overall < 80 else "senior",
        "total_experience_years": 4.0 if overall < 80 else 6.0,
        "highest_education_level": "bachelor",
        "highest_education_field": "Computação",
        "strengths": ["Fundamentos técnicos", "Boa comunicação"],
        "weaknesses": ["Pouca evidência de liderança formal"],
        "recommendations": ["Aprofundar cases de impacto", "Detalhar resultados por projeto"],
        "keywords": ["python", "sql", "api", "backend"],
        "extracted_data": {"source": "dev_fallback"},
    }
