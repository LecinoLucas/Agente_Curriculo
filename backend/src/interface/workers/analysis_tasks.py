import asyncio
import re
import socket
from datetime import UTC, datetime, timedelta
from uuid import UUID

import sqlalchemy as sa
import structlog

from src.core.settings import settings
from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

_PLACEHOLDER_RESUME = (
    "Currículo não disponível para análise. "
    "O arquivo PDF ainda não foi carregado ou o texto não foi extraído."
)

MATCHING_ENQUEUE_TIMEOUT_SECONDS = 10.0
ANALYSIS_QUEUE = "analysis"
MAX_RESUME_PROMPT_CHARS = 2500
MAX_JOB_PROMPT_CHARS = 700
MAX_PROMPT_TOTAL_CHARS = 4500
MAX_ANALYSIS_OUTPUT_TOKENS = 300
PROMPT_INSTRUCTION = "Analise o candidato e retorne JSON válido"
PROMPT_SUSPICIOUS_PATTERNS = (
    r"(?i)ignore\s+previous\s+instructions",
    r"(?i)jailbreak",
    r"(?i)system\s*prompt",
    r"(?i)<script",
)
def _normalize_provider(provider: str) -> str:
    return provider.strip().lower()


def _provider_api_key_is_configured(provider: str) -> bool:
    normalized = _normalize_provider(provider)

    if normalized in {"anthropic", "claude"}:
        return bool(settings.ANTHROPIC_API_KEY)

    if normalized in {"google", "gemini"}:
        return bool(settings.GOOGLE_API_KEY)

    raise RuntimeError(f"Unsupported AI provider configured for analysis: {provider}")


def _provider_api_key_hint(provider: str) -> str:
    normalized = _normalize_provider(provider)

    if normalized in {"anthropic", "claude"}:
        return "ANTHROPIC_API_KEY"

    if normalized in {"google", "gemini"}:
        return "GOOGLE_API_KEY"

    return f"API key for provider '{provider}'"


def _real_ai_calls_allowed() -> bool:
    return bool(settings.ALLOW_AI_TOKEN_SPEND)


def _normalize_multiline_text(value: str) -> str:
    lines = [line.strip() for line in (value or "").splitlines()]
    non_empty = [line for line in lines if line]
    return "\n".join(non_empty)


def _truncate_with_notice(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    suffix = "\n\n[conteudo truncado para controle de custo]"
    limit = max(0, max_chars - len(suffix))
    return value[:limit].rstrip() + suffix


def _remove_sensitive_resume_data(value: str) -> str:
    sanitized = value
    sanitized = re.sub(r"\b[\w\.-]+@[\w\.-]+\.\w+\b", "[email_removido]", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "[cpf_removido]", sanitized)
    sanitized = re.sub(
        r"(?:(?:\+?55)\s*)?(?:\(?\d{2}\)?\s*)?(?:9?\d{4})[-\s]?\d{4}",
        "[telefone_removido]",
        sanitized,
    )
    return sanitized


def _extract_relevant_resume_lines(value: str) -> str:
    lines = [line.strip() for line in value.splitlines()]
    section_keywords = {
        "experience": ("experiencia", "experiência", "experience", "cargo", "empresa", "projeto", "role"),
        "skills": ("skill", "skills", "habilidade", "habilidades", "competencia", "competências", "stack"),
        "education": ("formacao", "formação", "educacao", "educação", "education", "curso", "graduacao", "graduação"),
    }
    inline_keywords = tuple({kw for values in section_keywords.values() for kw in values})

    selected: list[str] = []
    selected_keys: set[str] = set()
    active_section: str | None = None
    must_keep_terms = (
        "sql",
        "api",
        "rest",
        "erp",
        "protheus",
        "requisitos",
        "sistemas",
        "integracoes",
        "integrações",
        "experiencia",
        "experiência",
        "formacao",
        "formação",
    )

    for raw_line in lines:
        if not raw_line:
            continue
        normalized = raw_line.lower()
        normalized = normalized.replace("ç", "c").replace("ã", "a").replace("á", "a").replace("é", "e")
        key = normalized.strip()

        if any(term in normalized for term in must_keep_terms):
            if key not in selected_keys:
                selected.append(raw_line)
                selected_keys.add(key)
            if len(selected) >= 160:
                break

        switched = False
        for section_name, keywords in section_keywords.items():
            if any(keyword in normalized for keyword in keywords):
                active_section = section_name
                switched = True
                break

        if switched or active_section is not None:
            if key not in selected_keys:
                selected.append(raw_line)
                selected_keys.add(key)
            if len(selected) >= 160:
                break
            continue

        if any(keyword in normalized for keyword in inline_keywords):
            if key not in selected_keys:
                selected.append(raw_line)
                selected_keys.add(key)
            if len(selected) >= 160:
                break

    if not selected:
        selected = [line for line in lines if line][:60]

    return "\n".join(selected)


def _compact_resume_for_prompt(resume_text: str) -> str:
    normalized = _normalize_multiline_text(resume_text)
    sanitized = _remove_sensitive_resume_data(normalized)
    relevant = _extract_relevant_resume_lines(sanitized)
    return _truncate_with_notice(relevant, MAX_RESUME_PROMPT_CHARS)


def _compact_job_for_prompt(job) -> str:
    sections: list[tuple[str, str | None]] = [
        ("Titulo", getattr(job, "title", None)),
        ("Requisitos", getattr(job, "requirements", None)),
        ("Responsabilidades", getattr(job, "responsibilities", None)),
        ("Descricao", getattr(job, "description", None)),
    ]

    chunks: list[str] = []
    for title, value in sections:
        if not value:
            continue
        normalized = _normalize_multiline_text(value)
        if not normalized:
            continue
        chunks.append(f"{title}:\n{normalized}")

    if not chunks:
        return ""

    max_chars = MAX_JOB_PROMPT_CHARS
    merged = "\n\n".join(chunks)
    return _truncate_with_notice(merged, max_chars)


def _build_minimal_user_prompt(*, resume_text: str, job_context: str) -> str:
    return (
        "INSTRUÇÃO:\n"
        f"{PROMPT_INSTRUCTION}\n\n"
        "DADOS:\n"
        "CURRICULO_RESUMIDO:\n"
        f"{resume_text}\n\n"
        "VAGA_RESUMIDA:\n"
        f"{job_context or 'sem contexto de vaga'}\n\n"
        "SAÍDA:\n"
        "Apenas JSON puro e compacto. Sem texto extra.\n"
        "Retorne EXATAMENTE estes campos (sem campos extras):\n"
        "{\n"
        '  "overall_score": 0-100,\n'
        '  "professional_area": "technology|data|administrative|accounting|financial|commercial|operational|leadership|other",\n'
        '  "detected_level": "intern|junior|mid|senior|lead|undefined",\n'
        '  "education_level": "none|high_school|technical|bachelor|postgraduate|master|phd",\n'
        '  "total_experience_years": numero,\n'
        '  "candidate_summary": "texto curto",\n'
        '  "strengths": ["item1","item2"],\n'
        '  "weaknesses": ["item1","item2"],\n'
        '  "recommendations": ["item1","item2"],\n'
        '  "skills": ["ate 8 itens"],\n'
        '  "tools": ["ate 8 itens"],\n'
        '  "experiences": [{"role":"", "company":"", "duration_months":0, "key_activities":[""]}],\n'
        '  "education": [{"level":"", "field":"", "institution":""}],\n'
        '  "confidence": "low|medium|high"\n'
        "}"
    )


def _validate_prompt_before_ai(*, prompt: str, resume_chars: int, job_chars: int) -> None:
    reasons: list[str] = []
    total_chars = len(prompt)

    if resume_chars > MAX_RESUME_PROMPT_CHARS:
        reasons.append("resume_chars_exceeded")
    if job_chars > MAX_JOB_PROMPT_CHARS:
        reasons.append("job_chars_exceeded")
    if total_chars > MAX_PROMPT_TOTAL_CHARS:
        reasons.append("prompt_chars_exceeded")
    if "```" in prompt:
        reasons.append("markdown_detected")
    if re.search(r"(?i)\bmarkdown\b", prompt):
        reasons.append("markdown_word_detected")
    for pattern in PROMPT_SUSPICIOUS_PATTERNS:
        if re.search(pattern, prompt):
            reasons.append(f"suspicious:{pattern}")

    logger.info(
        "analysis.prompt_metrics",
        prompt_chars_total=total_chars,
        resume_chars=resume_chars,
        job_chars=job_chars,
        preview=prompt[:300],
    )

    if reasons:
        logger.warning(
            "analysis.prompt_invalid",
            reasons=reasons,
            prompt_chars_total=total_chars,
            resume_chars=resume_chars,
            job_chars=job_chars,
            preview=prompt[:300],
        )
        raise RuntimeError(f"Prompt blocked before AI call: {','.join(reasons)}")


def _extract_rate_limit_retry_after_seconds(error: str) -> float | None:
    if "status_code=429" not in error:
        return None

    retry_after_match = re.search(r"retry_after_seconds=([0-9]+(?:\.[0-9]+)?)", error)
    if retry_after_match:
        try:
            return max(0.0, float(retry_after_match.group(1)))
        except ValueError:
            return None

    cooldown_seconds = max(1, int(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS))
    return float(cooldown_seconds)


def _run_async(coro):
    return asyncio.run(coro)


@celery_app.task(
    bind=True,
    name="src.interface.workers.analysis_tasks.process_analysis",
    max_retries=3,
    soft_time_limit=120,
    time_limit=180,
)
def process_analysis(self, analysis_id: str) -> dict:  # type: ignore[override]
    task_id = str(self.request.id)

    try:
        return _run_async(_process_analysis_async(analysis_id, task_id))

    except Exception as exc:
        error_str = str(exc)
        is_quota_exceeded = "status_code=429" in error_str

        logger.exception(
            "analysis.task_failed",
            analysis_id=analysis_id,
            task_id=task_id,
            retries=self.request.retries,
            error=error_str,
            is_quota_exceeded=is_quota_exceeded,
        )

        if is_quota_exceeded:
            # 429 quota exceeded: mark as failed immediately with retry_after
            logger.warning(
                "analysis.quota_exceeded_final",
                analysis_id=analysis_id,
                task_id=task_id,
            )
            _run_async(_mark_analysis_failed(
                analysis_id=analysis_id,
                task_id=task_id,
                error=error_str,
                retry_count=self.request.retries,
            ))
            raise

        retry_count = self.request.retries + 1
        countdown = min(300, (2**self.request.retries) * 30)

        if retry_count > self.max_retries:
            _run_async(_mark_analysis_failed(
                analysis_id=analysis_id,
                task_id=task_id,
                error=error_str,
                retry_count=self.request.retries,
            ))
            raise

        _run_async(_mark_analysis_retry_scheduled(
            analysis_id=analysis_id,
            task_id=task_id,
            error=error_str,
            retry_count=retry_count,
            countdown_seconds=countdown,
        ))

        raise self.retry(exc=exc, countdown=countdown) from exc


async def _process_analysis_async(analysis_id: str, task_id: str) -> dict:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import (
        AIModelModel,
        AnalysisModel,
        PromptTemplateModel,
    )
    from src.infrastructure.database.models.resume_model import ResumeVersionModel

    try:
        analysis_uuid = UUID(str(analysis_id))
    except ValueError as exc:
        raise RuntimeError(f"Invalid analysis_id: {analysis_id}") from exc

    worker_id = f"{socket.gethostname()}:{task_id}"
    SessionFactory = get_session_factory()

    async with SessionFactory() as session:
        row = await session.execute(
            sa.select(
                AnalysisModel,
                ResumeVersionModel,
                PromptTemplateModel,
                AIModelModel,
            )
            .join(
                ResumeVersionModel,
                ResumeVersionModel.id == AnalysisModel.resume_version_id,
            )
            .join(
                PromptTemplateModel,
                PromptTemplateModel.id == AnalysisModel.prompt_template_id,
            )
            .join(
                AIModelModel,
                AIModelModel.id == AnalysisModel.ai_model_id,
            )
            .where(AnalysisModel.id == analysis_uuid)
        )

        fetched = row.first()

        if fetched is None:
            logger.warning("analysis.not_found", analysis_id=str(analysis_uuid))
            return {"analysis_id": str(analysis_uuid), "status": "not_found"}

        analysis, version, prompt_tpl, ai_model = fetched

        if analysis.status not in {"pending", "processing"}:
            logger.info(
                "analysis.skipped_terminal",
                analysis_id=str(analysis_uuid),
                status=analysis.status,
            )
            return {"analysis_id": str(analysis_uuid), "status": analysis.status}

        resume_text = version.extracted_text

        if not resume_text or not resume_text.strip():
            raise RuntimeError(
                "Resume text vazio. Extração de PDF ainda não concluída."
            )

        if resume_text.strip() == _PLACEHOLDER_RESUME:
            raise RuntimeError(
                "Resume text contém placeholder. O PDF ainda não foi extraído."
            )

        now = datetime.now(UTC)

        analysis.status = "processing"
        analysis.started_at = now
        analysis.worker_id = worker_id
        analysis.task_id = task_id
        analysis.queue_name = ANALYSIS_QUEUE
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.next_retry_at = None
        analysis.updated_at = now

        await session.commit()

        provider = ai_model.provider
        model_id = ai_model.model_id
        prompt_version = str(prompt_tpl.version)
        prompt_max_tokens = min(
            int(prompt_tpl.max_tokens or settings.AI_MAX_TOKENS),
            settings.AI_MAX_TOKENS,
            settings.AI_ANALYSIS_MAX_OUTPUT_TOKENS,
        )
        prompt_temperature = float(prompt_tpl.temperature)
        job_id = analysis.job_id
        queue_name = ANALYSIS_QUEUE

    logger.info(
        "analysis.worker_started",
        analysis_id=str(analysis_uuid),
        task_id=task_id,
        worker_id=worker_id,
        queue=ANALYSIS_QUEUE,
    )

    logger.info(
        "analysis.processing_started",
        analysis_id=str(analysis_uuid),
        worker_id=worker_id,
        provider=provider,
        model_id=model_id,
        timeout_seconds=settings.AI_PROVIDER_TIMEOUT_SECONDS,
        max_tokens=prompt_max_tokens,
        max_retries=settings.AI_MAX_RETRIES,
        job_id=str(job_id) if job_id else None,
    )

    if not _provider_api_key_is_configured(provider):
        raise RuntimeError(
            f"{_provider_api_key_hint(provider)} is not configured."
        )

    elif not _real_ai_calls_allowed():
        raise RuntimeError("ALLOW_AI_TOKEN_SPEND is False. Real AI calls are blocked.")

    else:
        (
            result_fields,
            raw_response,
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            processing_ms,
            prompt_version_used,
        ) = await _run_real_ai_analysis(
            analysis_id=str(analysis_uuid),
            provider=provider,
            model_id=model_id,
            resume_text=resume_text,
            prompt_version=prompt_version,
            prompt_max_tokens=prompt_max_tokens,
            prompt_temperature=prompt_temperature,
            job_id=job_id,
            queue_name=queue_name,
        )

    await _persist_completed_analysis(
        analysis_id=analysis_uuid,
        result_fields=result_fields,
        raw_response=raw_response,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read=cache_read,
        cache_write=cache_write,
        processing_ms=processing_ms,
        prompt_version_used=prompt_version_used,
    )

    try:
        await asyncio.wait_for(
            _enqueue_matching_pipeline(str(analysis_uuid)),
            timeout=MATCHING_ENQUEUE_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.exception(
            "analysis.matching_enqueue_failed_after_completion",
            analysis_id=str(analysis_uuid),
            error=str(exc),
        )

    logger.info(
        "analysis.processing_completed",
        analysis_id=str(analysis_uuid),
    )
    logger.info(
        "analysis.worker_completed",
        analysis_id=str(analysis_uuid),
        task_id=task_id,
        worker_id=worker_id,
        queue=ANALYSIS_QUEUE,
        status="completed",
    )

    return {"analysis_id": str(analysis_uuid), "status": "completed"}


async def _run_real_ai_analysis(
    *,
    analysis_id: str,
    provider: str,
    model_id: str,
    resume_text: str,
    prompt_version: str,
    prompt_max_tokens: int,
    prompt_temperature: float,
    job_id,
    queue_name: str,
) -> tuple[dict, str, int, int, int, int, int, str]:
    from src.application.ports.ai_service import AIAnalysisRequest
    from src.infrastructure.ai.factory import AIServiceFactory
    from src.infrastructure.ai.response_parser import parse_analysis_response
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.job_model import JobModel

    prompt_version_used = f"{prompt_version or 'unknown'}:gemini_safety_minimal_v2"
    compact_job_context = ""

    if job_id:
        SessionFactory = get_session_factory()
        async with SessionFactory() as session:
            job = await session.scalar(sa.select(JobModel).where(JobModel.id == job_id))

            if job is not None:
                compact_job_context = _compact_job_for_prompt(job)

    compact_resume_text = _compact_resume_for_prompt(resume_text)
    user_prompt = _build_minimal_user_prompt(
        resume_text=compact_resume_text,
        job_context=compact_job_context,
    )
    _validate_prompt_before_ai(
        prompt=user_prompt,
        resume_chars=len(compact_resume_text),
        job_chars=len(compact_job_context),
    )

    logger.info(
        "analysis.job_context_used",
        analysis_id=analysis_id,
        job_id=str(job_id) if job_id else None,
        has_job_context=bool(compact_job_context),
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
        max_tokens=min(prompt_max_tokens, MAX_ANALYSIS_OUTPUT_TOKENS),
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
        max_retries=settings.AI_MAX_RETRIES,
        queue_name=queue_name,
    )

    try:
        ai_response = await asyncio.wait_for(
            ai_service.analyze(ai_request),
            timeout=settings.AI_PROVIDER_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise RuntimeError(
            f"AI provider call timed out after {settings.AI_PROVIDER_TIMEOUT_SECONDS}s "
            f"for analysis {analysis_id}"
        ) from exc

    try:
        result_fields = parse_analysis_response(ai_response.content)
    except Exception as exc:
        logger.exception(
            "analysis.parse_failed",
            analysis_id=analysis_id,
            response_preview=(ai_response.content or "")[:500],
            error=str(exc),
        )
        raise RuntimeError("Failed to parse AI response") from exc

    _validate_result_fields(result_fields)

    return (
        result_fields,
        ai_response.content,
        ai_response.input_tokens,
        ai_response.output_tokens,
        ai_response.cache_read_tokens,
        ai_response.cache_write_tokens,
        ai_response.processing_time_ms,
        prompt_version_used,
    )


def _validate_result_fields(result_fields: dict) -> None:
    required_fields = {
        "overall_score",
        "technical_score",
        "experience_score",
        "education_score",
        "communication_score",
        "leadership_score",
        "candidate_summary",
        "seniority_level",
        "total_experience_years",
        "highest_education_level",
        "highest_education_field",
        "strengths",
        "weaknesses",
        "recommendations",
        "keywords",
        "extracted_data",
    }

    missing = required_fields - set(result_fields.keys())

    if missing:
        raise RuntimeError(
            f"Parsed analysis result missing required fields: {sorted(missing)}"
        )


async def _persist_completed_analysis(
    *,
    analysis_id: UUID,
    result_fields: dict,
    raw_response: str,
    input_tokens: int,
    output_tokens: int,
    cache_read: int,
    cache_write: int,
    processing_ms: int,
    prompt_version_used: str,
) -> None:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import (
        AnalysisModel,
        AnalysisResultModel,
    )

    SessionFactory = get_session_factory()
    async with SessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )

        if analysis is None:
            raise RuntimeError(f"Analysis disappeared before persist: {analysis_id}")

        if analysis.status == "cancelled":
            logger.info(
                "analysis.cancelled_mid_flight",
                analysis_id=str(analysis_id),
            )
            return

        if analysis.status == "completed":
            logger.warning(
                "analysis.already_completed_race_condition",
                analysis_id=str(analysis_id),
            )
            return

        existing_result = await session.scalar(
            sa.select(AnalysisResultModel).where(
                AnalysisResultModel.analysis_id == analysis_id
            )
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
            "cache_read_tokens": cache_read,
            "cache_write_tokens": cache_write,
            "processing_time_ms": processing_ms,
            "raw_llm_response": raw_response,
            "prompt_version_used": prompt_version_used,
        }

        if existing_result is None:
            session.add(
                AnalysisResultModel(
                    analysis_id=analysis_id,
                    **result_payload,
                )
            )
        else:
            for key, value in result_payload.items():
                setattr(existing_result, key, value)

        now = datetime.now(UTC)

        analysis.status = "completed"
        analysis.completed_at = now
        analysis.failure_reason = None
        analysis.failed_at = None
        analysis.next_retry_at = None
        analysis.updated_at = now

        await session.commit()


async def _enqueue_matching_pipeline(analysis_id: str) -> None:
    from src.interface.workers.matching_dispatcher import enqueue_published_job_matches

    matched = await enqueue_published_job_matches(UUID(analysis_id))

    logger.info(
        "analysis.matching_enqueued",
        analysis_id=analysis_id,
        matching_jobs=matched,
    )


async def _mark_analysis_retry_scheduled(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
    countdown_seconds: int,
) -> None:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    try:
        analysis_uuid = UUID(str(analysis_id))
    except ValueError:
        return

    SessionFactory = get_session_factory()
    async with SessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_uuid)
        )

        if analysis is None:
            return

        now = datetime.now(UTC)

        analysis.status = "pending"
        analysis.task_id = str(task_id) if task_id is not None else analysis.task_id
        analysis.retry_count = retry_count
        analysis.failure_reason = error[:1000]
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
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    try:
        analysis_uuid = UUID(str(analysis_id))
    except ValueError:
        return

    SessionFactory = get_session_factory()
    async with SessionFactory() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_uuid)
        )

        if analysis is None:
            return

        now = datetime.now(UTC)

        analysis.status = "failed"
        analysis.task_id = str(task_id) if task_id is not None else analysis.task_id
        analysis.queue_name = ANALYSIS_QUEUE
        analysis.retry_count = retry_count

        # Use friendly message for quota errors, full error for others
        if "status_code=429" in error:
            analysis.failure_reason = "Limite de uso da IA atingido. " + error[:500]
        else:
            analysis.failure_reason = error[:1000]

        analysis.failed_at = now
        cooldown_seconds = _extract_rate_limit_retry_after_seconds(error)
        if cooldown_seconds is not None:
            analysis.next_retry_at = now + timedelta(seconds=cooldown_seconds)
        else:
            analysis.next_retry_at = None
        analysis.updated_at = now

        await session.commit()
        logger.info(
            "analysis.worker_completed",
            analysis_id=str(analysis_uuid),
            task_id=str(task_id) if task_id is not None else None,
            queue=ANALYSIS_QUEUE,
            status="failed",
        )


async def mark_stuck_analyses_as_failed() -> int:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    marked_count = 0
    now = datetime.now(UTC)

    SessionFactory = get_session_factory()
    async with SessionFactory() as session:
        processing_threshold = now - timedelta(minutes=20)

        processing_stuck = await session.execute(
            sa.select(AnalysisModel).where(
                AnalysisModel.status == "processing",
                AnalysisModel.started_at < processing_threshold,
            )
        )

        for analysis in processing_stuck.scalars().all():
            analysis.status = "failed"
            analysis.failure_reason = "Task timeout: processing > 20 minutes"
            analysis.failed_at = now
            analysis.next_retry_at = None
            analysis.updated_at = now
            marked_count += 1

            logger.warning(
                "analysis.stuck.processing_timeout",
                analysis_id=str(analysis.id),
                started_at=analysis.started_at.isoformat()
                if analysis.started_at
                else None,
            )

        pending_threshold = now - timedelta(hours=2)

        pending_stuck = await session.execute(
            sa.select(AnalysisModel).where(
                AnalysisModel.status == "pending",
                AnalysisModel.created_at < pending_threshold,
                AnalysisModel.next_retry_at.is_(None),
            )
        )

        for analysis in pending_stuck.scalars().all():
            analysis.status = "failed"
            analysis.failure_reason = "Task timeout: pending > 2 hours"
            analysis.failed_at = now
            analysis.next_retry_at = None
            analysis.updated_at = now
            marked_count += 1

            logger.warning(
                "analysis.stuck.pending_timeout",
                analysis_id=str(analysis.id),
                created_at=analysis.created_at.isoformat()
                if analysis.created_at
                else None,
            )

        if marked_count:
            await session.commit()

            logger.warning(
                "analysis.stuck_analyses_marked_failed",
                count=marked_count,
            )

    return marked_count


def _dev_fallback_scores(analysis_id: str) -> dict:
    seed = UUID(analysis_id).int % 35
    overall = min(98.0, 60 + seed)

    return {
        "overall_score": overall,
        "technical_score": None,
        "experience_score": None,
        "education_score": None,
        "communication_score": None,
        "leadership_score": None,
        "candidate_summary": "[MOCK] Resultado simulado para desenvolvimento. Não representa análise real.",
        "seniority_level": "mid" if overall < 80 else "senior",
        "total_experience_years": 4.0 if overall < 80 else 6.0,
        "highest_education_level": "bachelor",
        "highest_education_field": "computacao",
        "strengths": ["mock: fundamentos tecnicos", "mock: boa comunicacao"],
        "weaknesses": ["mock: pouca evidencia de lideranca formal"],
        "recommendations": ["mock: revisar com ia real"],
        "keywords": ["python", "sql", "api", "backend"],
        "extracted_data": {"source": "dev_fallback"},
    }
