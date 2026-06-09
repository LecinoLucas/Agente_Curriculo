"""
ResumeAnalysisEngine: pure AI pipeline layer.

Responsibilities:
- compact resume text
- compact job context (duck-typed job object)
- build prompt
- validate prompt
- call AI provider
- parse and validate response
- return structured result

NOT responsible for:
- Celery tasks / retries
- database reads or writes
- knowing about bot or frontend
- creating task_ids
"""

import asyncio
from dataclasses import dataclass
from typing import Any

import structlog

from src.ai_orchestration.analysis.failure_classifier import (
    AnalysisExecutionError,
    AnalysisFailureDetails,
)
from src.ai_orchestration.analysis.prompt_builder import (
    PROMPT_INSTRUCTION,
    build_minimal_user_prompt,
)
from src.ai_orchestration.analysis.prompt_compaction import (
    compact_job_for_prompt,
    compact_resume_for_prompt,
)
from src.ai_orchestration.analysis.prompt_validator import (
    AnalysisPromptTooLargeError,
    validate_prompt_before_ai,
)
from src.ai_orchestration.analysis.response_parser import parse_and_validate_analysis_response
from src.core.ai_sensitive_guardrails import contains_sensitive_text
from src.core.log_sanitizer import sanitize_log_text
from src.core.settings import settings

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class AnalysisEngineResult:
    result_fields: dict
    raw_response: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_write_tokens: int
    processing_time_ms: int
    prompt_version_used: str
    finish_reason: str | None
    max_tokens_used: int
    system_prompt_chars: int
    user_prompt_chars: int
    prompt_chars_total: int


async def run_analysis(
    *,
    resume_text: str,
    job: Any | None,
    provider: str,
    model_id: str,
    prompt_version: str,
    prompt_max_tokens: int,
    prompt_temperature: float,
    analysis_id: str,
    queue_name: str,
    sessionmaker: Any,
    job_id: Any = None,
) -> AnalysisEngineResult:
    """
    Execute the full AI analysis pipeline.

    Parameters
    ----------
    resume_text : raw resume text (will be compacted internally)
    job : duck-typed job object with title/requirements/responsibilities/description,
          or None when no job context is available
    provider / model_id : AI provider routing
    prompt_version : version string for prompt tracking
    prompt_max_tokens : output token cap
    prompt_temperature : sampling temperature
    analysis_id : string id for structured logging only
    queue_name : queue name for logging
    sessionmaker : async sessionmaker used for AI usage log persistence
    job_id : optional job id for usage log annotation (no DB access)
    """
    from src.application.ports.ai_service import AIAnalysisRequest
    from src.application.services.ai_usage_log_service import (
        AIUsageLogPayload,
        safe_persist_ai_usage_log,
    )
    from src.infrastructure.ai.factory import AIServiceFactory
    from src.infrastructure.ai.response_parser import AIResponseValidationError

    prompt_version_used = f"{prompt_version or 'unknown'}:gemini_minimal_compact_v2"

    compact_job_context = compact_job_for_prompt(job) if job is not None else ""
    compact_resume_text = compact_resume_for_prompt(resume_text)

    logger.info(
        "analysis.job_context_used",
        analysis_id=analysis_id,
        job_id=str(job_id) if job_id else None,
        has_job_context=bool(compact_job_context),
    )

    user_prompt = build_minimal_user_prompt(
        resume_text=compact_resume_text,
        job_context=compact_job_context,
    )
    validate_prompt_before_ai(
        prompt=user_prompt,
        resume_chars=len(compact_resume_text),
        job_chars=len(compact_job_context),
    )

    logger.info(
        "analysis.prompt_payload_compacted",
        analysis_id=analysis_id,
        resume_chars_original=len(resume_text),
        resume_chars_used=len(compact_resume_text),
        job_chars_used=len(compact_job_context),
        max_output_tokens=prompt_max_tokens,
        prompt_chars_total=len(user_prompt),
    )

    ai_request = AIAnalysisRequest(
        resume_text=compact_resume_text,
        system_prompt=PROMPT_INSTRUCTION,
        prompt_template=user_prompt,
        max_tokens=prompt_max_tokens,
        temperature=prompt_temperature,
        job_description=None,
        queue_name=queue_name,
    )

    ai_service = AIServiceFactory.create(provider, model_id)

    logger.info(
        "analysis.ai_call_starting",
        analysis_id=analysis_id,
        provider=provider,
        model_id=model_id,
        timeout_seconds=settings.AI_PROVIDER_TIMEOUT_SECONDS,
        max_tokens=ai_request.max_tokens,
        queue_name=queue_name,
    )

    try:
        ai_response = await asyncio.wait_for(
            ai_service.analyze(ai_request),
            timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS,
        )
        await safe_persist_ai_usage_log(
            sessionmaker,
            AIUsageLogPayload(
                provider=provider,
                model=model_id,
                status="success",
                operation="resume_analysis",
                analysis_id=analysis_id,
                job_id=job_id,
                input_tokens=ai_response.input_tokens,
                output_tokens=ai_response.output_tokens,
                latency_ms=ai_response.processing_time_ms,
            ),
        )
    except TimeoutError as exc:
        await safe_persist_ai_usage_log(
            sessionmaker,
            AIUsageLogPayload(
                provider=provider,
                model=model_id,
                status="failed",
                operation="resume_analysis",
                analysis_id=analysis_id,
                job_id=job_id,
                latency_ms=int(settings.AI_PROVIDER_TIMEOUT_SECONDS * 1000),
                error_message="AI provider call timed out",
            ),
        )
        raise AnalysisExecutionError(
            f"AI provider call timed out after {settings.AI_PROVIDER_TIMEOUT_SECONDS}s "
            f"for analysis {analysis_id}",
            details=AnalysisFailureDetails(
                max_tokens_used=ai_request.max_tokens,
                system_prompt_chars=len(PROMPT_INSTRUCTION),
                user_prompt_chars=len(user_prompt),
                prompt_chars_total=len(PROMPT_INSTRUCTION) + len(user_prompt),
                prompt_version_used=prompt_version_used,
                provider=provider,
                model_id=model_id,
            ),
        ) from exc
    except Exception as exc:
        await safe_persist_ai_usage_log(
            sessionmaker,
            AIUsageLogPayload(
                provider=provider,
                model=model_id,
                status="failed",
                operation="resume_analysis",
                analysis_id=analysis_id,
                job_id=job_id,
                input_tokens=int(getattr(exc, "input_tokens", 0) or 0),
                output_tokens=int(getattr(exc, "output_tokens", 0) or 0),
                latency_ms=getattr(exc, "processing_time_ms", None),
                error_message=sanitize_log_text(str(exc)),
            ),
        )
        raise AnalysisExecutionError(
            sanitize_log_text(str(exc)) or type(exc).__name__,
            details=AnalysisFailureDetails(
                finish_reason=getattr(exc, "finish_reason", None),
                raw_llm_response=getattr(exc, "raw_response", None),
                input_tokens=getattr(exc, "input_tokens", None),
                output_tokens=getattr(exc, "output_tokens", None),
                processing_time_ms=getattr(exc, "processing_time_ms", None),
                max_tokens_used=ai_request.max_tokens,
                system_prompt_chars=len(PROMPT_INSTRUCTION),
                user_prompt_chars=len(user_prompt),
                prompt_chars_total=len(PROMPT_INSTRUCTION) + len(user_prompt),
                prompt_version_used=prompt_version_used,
                provider=provider,
                model_id=model_id,
                sensitive_output_detected=contains_sensitive_text(
                    getattr(exc, "raw_response", None)
                ),
            ),
        ) from exc

    try:
        result_fields = parse_and_validate_analysis_response(ai_response.content)
    except Exception as exc:
        parser_error_code = (
            exc.code if isinstance(exc, AIResponseValidationError) else type(exc).__name__
        )
        parser_error_fields = exc.fields if isinstance(exc, AIResponseValidationError) else []
        logger.exception(
            "analysis.parse_failed",
            analysis_id=analysis_id,
            response_size_chars=len(ai_response.content or ""),
            parser_error_type=type(exc).__name__,
            parser_error_code=parser_error_code,
            parser_error_fields=parser_error_fields,
        )
        raise AnalysisExecutionError(
            sanitize_log_text(str(exc)) or parser_error_code,
            details=AnalysisFailureDetails(
                finish_reason=ai_response.finish_reason,
                raw_llm_response=ai_response.content,
                input_tokens=ai_response.input_tokens,
                output_tokens=ai_response.output_tokens,
                cache_read_tokens=ai_response.cache_read_tokens,
                cache_write_tokens=ai_response.cache_write_tokens,
                processing_time_ms=ai_response.processing_time_ms,
                max_tokens_used=ai_request.max_tokens,
                system_prompt_chars=len(PROMPT_INSTRUCTION),
                user_prompt_chars=len(user_prompt),
                prompt_chars_total=len(PROMPT_INSTRUCTION) + len(user_prompt),
                prompt_version_used=prompt_version_used,
                provider=provider,
                model_id=model_id,
                ai_response_validation_error=parser_error_code,
                ai_response_validation_fields=parser_error_fields,
                sensitive_output_detected=contains_sensitive_text(ai_response.content),
            ),
        ) from exc

    return AnalysisEngineResult(
        result_fields=result_fields,
        raw_response=ai_response.content,
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        cache_read_tokens=ai_response.cache_read_tokens,
        cache_write_tokens=ai_response.cache_write_tokens,
        processing_time_ms=ai_response.processing_time_ms,
        prompt_version_used=prompt_version_used,
        finish_reason=ai_response.finish_reason,
        max_tokens_used=ai_request.max_tokens,
        system_prompt_chars=len(PROMPT_INSTRUCTION),
        user_prompt_chars=len(user_prompt),
        prompt_chars_total=len(PROMPT_INSTRUCTION) + len(user_prompt),
    )
