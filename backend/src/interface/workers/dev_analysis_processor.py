import asyncio
from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
import structlog

from src.infrastructure.database.connection import AsyncSessionFactory
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
)
from src.interface.workers.matching_dispatcher import enqueue_published_job_matches

logger = structlog.get_logger(__name__)


def _sanitize_prompt_template(template: str | None) -> str | None:
    if template is None:
        return None

    placeholders = {
        "__RESUME_TEXT__": "{resume_text}",
        "__JOB_CONTEXT__": "{job_context}",
    }

    sanitized = template
    for marker, placeholder in placeholders.items():
        sanitized = sanitized.replace(placeholder, marker)

    sanitized = sanitized.replace("{", "{{").replace("}", "}}")

    for marker, placeholder in placeholders.items():
        sanitized = sanitized.replace(marker, placeholder)

    return sanitized


def enqueue_dev_analysis(analysis_id: UUID) -> None:
    logger.warning(
        "analysis.dev_mock_enqueued",
        analysis_id=str(analysis_id),
    )

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_safe_process_analysis(analysis_id))
    except Exception as e:
        logger.exception(
            "analysis.dev.failed",
            analysis_id=str(analysis_id),
            error=str(e),
        )


# ─────────────────────────────────────────
# SAFE WRAPPER
# ─────────────────────────────────────────

async def _safe_process_analysis(analysis_id: UUID) -> None:
    try:
        await asyncio.wait_for(
            _process_analysis(analysis_id),
            timeout=120,
        )
    except asyncio.TimeoutError:
        logger.error(
            "analysis.dev.timeout",
            analysis_id=str(analysis_id),
        )
        await _mark_failed(analysis_id, "timeout")
    except Exception as e:
        logger.exception(
            "analysis.dev.crash",
            analysis_id=str(analysis_id),
            error=str(e),
        )
        await _mark_failed(analysis_id, str(e))


# ─────────────────────────────────────────
# CORE
# ─────────────────────────────────────────

async def _process_analysis(analysis_id: UUID) -> None:
    from src.infrastructure.database.models.analysis_model import (
        AIModelModel,
        PromptTemplateModel,
    )
    from src.infrastructure.database.models.resume_model import ResumeVersionModel
    from src.infrastructure.ai.prompts.v2_full_analysis import USER_PROMPT_TEMPLATE as FALLBACK_USER_PROMPT_TEMPLATE
    from src.interface.workers.analysis_tasks import (
        _provider_api_key_is_configured,
        _run_real_ai_analysis,
    )

    now = datetime.now(UTC)

    async with AsyncSessionFactory() as session:
        row = await session.execute(
            sa.select(AnalysisModel, AIModelModel, PromptTemplateModel)
            .join(AIModelModel, AIModelModel.id == AnalysisModel.ai_model_id)
            .join(PromptTemplateModel, PromptTemplateModel.id == AnalysisModel.prompt_template_id)
            .where(AnalysisModel.id == analysis_id)
        )
        fetched = row.first()

        if not fetched:
            return

        analysis, ai_model, prompt_tpl = fetched

        if analysis.status != "pending":
            return

        analysis.status = "processing"
        analysis.started_at = now
        analysis.worker_id = "dev"
        analysis.task_id = f"dev-{analysis_id}"
        analysis.updated_at = now

        await session.commit()

    await asyncio.sleep(0.5)

    async with AsyncSessionFactory() as session:
        row = await session.execute(
            sa.select(AnalysisModel, AIModelModel, PromptTemplateModel)
            .join(AIModelModel, AIModelModel.id == AnalysisModel.ai_model_id)
            .join(PromptTemplateModel, PromptTemplateModel.id == AnalysisModel.prompt_template_id)
            .where(AnalysisModel.id == analysis_id)
        )
        fetched = row.first()

        if not fetched:
            return

        analysis, ai_model, prompt_tpl = fetched

        if analysis.status == "cancelled":
            return

        version = await session.scalar(
            sa.select(ResumeVersionModel).where(ResumeVersionModel.id == analysis.resume_version_id)
        )

        resume_text = (version.extracted_text if version else None) or ""

        result = await session.scalar(
            sa.select(AnalysisResultModel).where(
                AnalysisResultModel.analysis_id == analysis_id
            )
        )

        if not resume_text.strip():
            raise RuntimeError("Resume text vazio. Extração de PDF ainda não concluída.")

        if not _provider_api_key_is_configured(ai_model.provider):
            raise RuntimeError(f"Provider '{ai_model.provider}' sem chave configurada.")

        try:
            (
                result_fields,
                raw_response,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_write_tokens,
                processing_time_ms,
                prompt_version_used,
            ) = await _run_real_ai_analysis(
                analysis_id=str(analysis_id),
                provider=ai_model.provider,
                model_id=ai_model.model_id,
                resume_text=resume_text,
                prompt_system=prompt_tpl.system_prompt,
                prompt_user_template=_sanitize_prompt_template(
                    prompt_tpl.user_prompt_template
                ),
                prompt_version=str(prompt_tpl.version),
                prompt_max_tokens=int(prompt_tpl.max_tokens),
                prompt_temperature=float(prompt_tpl.temperature),
                job_id=analysis.job_id,
            )
        except RuntimeError as exc:
            if "Prompt template missing variable" not in str(exc):
                raise

            logger.warning(
                "analysis.dev.retry_with_fallback_prompt",
                analysis_id=str(analysis_id),
                provider=ai_model.provider,
                model_id=ai_model.model_id,
                error=str(exc),
            )
            (
                result_fields,
                raw_response,
                input_tokens,
                output_tokens,
                cache_read_tokens,
                cache_write_tokens,
                processing_time_ms,
                prompt_version_used,
            ) = await _run_real_ai_analysis(
                analysis_id=str(analysis_id),
                provider=ai_model.provider,
                model_id=ai_model.model_id,
                resume_text=resume_text,
                prompt_system=None,
                prompt_user_template=_sanitize_prompt_template(FALLBACK_USER_PROMPT_TEMPLATE),
                prompt_version=str(prompt_tpl.version),
                prompt_max_tokens=int(prompt_tpl.max_tokens),
                prompt_temperature=float(prompt_tpl.temperature),
                job_id=analysis.job_id,
            )

        result_payload = {
            "overall_score": result_fields["overall_score"],
            "technical_score": result_fields["technical_score"],
            "experience_score": result_fields["experience_score"],
            "education_score": result_fields["education_score"],
            "communication_score": result_fields["communication_score"],
            "leadership_score": result_fields["leadership_score"],
            "candidate_summary": result_fields["candidate_summary"],
            "seniority_level": result_fields["seniority_level"],
            "total_experience_years": result_fields["total_experience_years"],
            "highest_education_level": result_fields["highest_education_level"],
            "highest_education_field": result_fields["highest_education_field"],
            "strengths": result_fields["strengths"],
            "weaknesses": result_fields["weaknesses"],
            "recommendations": result_fields["recommendations"],
            "keywords": result_fields["keywords"],
            "extracted_data": result_fields["extracted_data"],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_tokens": cache_read_tokens,
            "cache_write_tokens": cache_write_tokens,
            "processing_time_ms": processing_time_ms,
            "raw_llm_response": raw_response,
            "prompt_version_used": prompt_version_used,
        }

        if not result:
            session.add(AnalysisResultModel(analysis_id=analysis_id, **result_payload))
        else:
            for key, value in result_payload.items():
                setattr(result, key, value)

        analysis.status = "completed"
        analysis.completed_at = datetime.now(UTC)
        analysis.updated_at = datetime.now(UTC)

        await session.commit()

    # 🚨 NÃO BLOQUEAR
    asyncio.create_task(_safe_matching(analysis_id))


# ─────────────────────────────────────────
# MATCHING SAFE
# ─────────────────────────────────────────

async def _safe_matching(analysis_id: UUID):
    from src.infrastructure.database.models.candidate_pipeline_model import CandidatePipelineModel
    from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel

    try:
        async with AsyncSessionFactory() as session:
            candidate_id = await session.scalar(
                sa.select(ResumeModel.candidate_id)
                .join(ResumeVersionModel, ResumeVersionModel.resume_id == ResumeModel.id)
                .join(AnalysisModel, AnalysisModel.resume_version_id == ResumeVersionModel.id)
                .where(AnalysisModel.id == analysis_id)
            )

            if candidate_id is None:
                return

            active_pipeline_count = int(
                (
                    await session.scalar(
                        sa.select(sa.func.count())
                        .select_from(CandidatePipelineModel)
                        .where(
                            CandidatePipelineModel.candidate_id == candidate_id,
                            CandidatePipelineModel.is_active.is_(True),
                        )
                    )
                )
                or 0
            )

            if active_pipeline_count > 0:
                logger.info(
                    "analysis.dev.matching_skipped_active_pipeline_exists",
                    analysis_id=str(analysis_id),
                    candidate_id=str(candidate_id),
                    active_pipeline_count=active_pipeline_count,
                )
                return

        await asyncio.wait_for(
            enqueue_published_job_matches(analysis_id),
            timeout=5,
        )
    except Exception as e:
        logger.warning(
            "analysis.dev.matching_failed",
            analysis_id=str(analysis_id),
            error=str(e),
        )


# ─────────────────────────────────────────
# FAIL SAFE
# ─────────────────────────────────────────

async def _mark_failed(analysis_id: UUID, error: str):
    async with AsyncSessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )

        if not analysis:
            return

        analysis.status = "failed"
        analysis.failure_reason = error[:300]
        analysis.failed_at = datetime.now(UTC)
        analysis.updated_at = datetime.now(UTC)

        await session.commit()
