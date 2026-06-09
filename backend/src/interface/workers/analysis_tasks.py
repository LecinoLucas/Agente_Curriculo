import asyncio
import random
import re
import socket
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
import sqlalchemy as sa
import structlog

from src.application.services.ai_usage_log_service import (
    AIUsageLogPayload,
    safe_persist_ai_usage_log,
)
from src.core.ai_response_redactor import redact_ai_response_text
from src.core.ai_sensitive_guardrails import contains_sensitive_text
from src.core.analysis_observability import record_analysis_audit_event
from src.core.log_sanitizer import sanitize_log_text
from src.core.settings import settings
from src.infrastructure.ai.gemini_adapter import AIProviderRateLimitedError
from src.infrastructure.queue.celery_app import celery_app

logger = structlog.get_logger(__name__)

_PLACEHOLDER_RESUME = (
    "Currículo não disponível para análise. "
    "O arquivo PDF ainda não foi carregado ou o texto não foi extraído."
)

ANALYSIS_QUEUE = "analysis"
CLAIM_STALE_AFTER = timedelta(minutes=20)
PROMPT_INSTRUCTION = (
    "Analise o candidato e retorne JSON válido. Avalie somente critérios "
    "profissionais objetivos relacionados à vaga: experiência, skills, formação "
    "quando exigida, certificações, histórico de funções e requisitos declarados. "
    "Ignore dados sensíveis/protegidos e nunca use idade, data de nascimento, "
    "gênero, raça/cor/etnia, religião, estado civil, filhos/família, gravidez, "
    "saúde, deficiência, aparência/foto, endereço/bairro/distância, nacionalidade "
    "ou orientação sexual como critério. Se esses dados aparecerem no currículo, "
    "não os mencione em resumo, pontos fortes, lacunas, recomendações ou qualquer "
    "justificativa. Diferencie informação não informada de ausência comprovada e "
    "não reprove automaticamente por dado ausente."
)
PROMPT_SUSPICIOUS_PATTERNS = (
    r"(?i)ignore\s+previous\s+instructions",
    r"(?i)jailbreak",
    r"(?i)system\s*prompt",
    r"(?i)<script",
)

class AnalysisPromptTooLargeError(Exception):
    def __init__(self, reasons: list[str], prompt_chars: int, resume_chars: int, job_chars: int):
        super().__init__(f"Prompt blocked before AI call: {','.join(reasons)}")
        self.reasons = reasons
        self.prompt_chars = prompt_chars
        self.resume_chars = resume_chars
        self.job_chars = job_chars

DEFAULT_ANALYSIS_MAX_RETRIES = 3
MAX_ANALYSIS_RETRIES = max(
    0,
    int(settings.AI_ANALYSIS_MAX_RETRIES or DEFAULT_ANALYSIS_MAX_RETRIES),
)
RETRY_BACKOFF_SCHEDULE_SECONDS = {
    1: 15,
    2: 45,
    3: 120,
    4: 300,
}
RETRY_JITTER_MAX_SECONDS = 5
TEMPORARY_RETRY_MESSAGE = "Alta demanda no provedor IA. Tentando novamente automaticamente."
RATE_LIMIT_RETRY_MESSAGE = (
    "Limite de uso do provedor IA atingido. Nova tentativa automática agendada."
)


@dataclass(slots=True)
class AnalysisFailureDetails:
    finish_reason: str | None = None
    raw_llm_response: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    processing_time_ms: int | None = None
    max_tokens_used: int | None = None
    system_prompt_chars: int | None = None
    user_prompt_chars: int | None = None
    prompt_chars_total: int | None = None
    prompt_version_used: str | None = None
    provider: str | None = None
    model_id: str | None = None
    ai_response_validation_error: str | None = None
    ai_response_validation_fields: list[str] | None = None
    sensitive_output_detected: bool = False


@dataclass(slots=True)
class AnalysisErrorClassification:
    provider_error_type: str
    is_temporary: bool
    status_code: int | None = None
    retry_after_seconds: float | None = None
    cooldown_until: datetime | None = None
    configured_key_count: int | None = None
    available_key_count: int | None = None


class AnalysisExecutionError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        details: AnalysisFailureDetails,
    ) -> None:
        super().__init__(message)
        self.details = details

    @property
    def is_non_retryable(self) -> bool:
        finish_reason = (self.details.finish_reason or "").upper()
        message = str(self).lower()
        return finish_reason == "MAX_TOKENS" or "truncated" in message


def _iter_exception_chain(exc: BaseException) -> list[BaseException]:
    chain: list[BaseException] = []
    current: BaseException | None = exc
    seen: set[int] = set()

    while current is not None and id(current) not in seen:
        chain.append(current)
        seen.add(id(current))
        current = current.__cause__ or current.__context__

    return chain


def _extract_retry_after_from_http_error(error: httpx.HTTPStatusError) -> float | None:
    retry_after = error.response.headers.get("retry-after")
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except ValueError:
            pass

    sanitized_error = sanitize_log_text(str(error)) or ""
    match = re.search(
        r"retry(?:_after_seconds| in)\s*=?\s*([0-9]+(?:\.[0-9]+)?)",
        sanitized_error,
        re.IGNORECASE,
    )
    if match:
        try:
            return max(0.0, float(match.group(1)))
        except ValueError:
            return None

    return None


def _classify_analysis_exception(exc: Exception) -> AnalysisErrorClassification:
    if isinstance(exc, AnalysisPromptTooLargeError):
        return AnalysisErrorClassification(
            provider_error_type="prompt_too_large",
            is_temporary=False,
        )

    if isinstance(exc, AnalysisExecutionError) and exc.is_non_retryable:
        return AnalysisErrorClassification(
            provider_error_type="payload_invalid",
            is_temporary=False,
        )

    for current in _iter_exception_chain(exc):
        if isinstance(current, AIProviderRateLimitedError):
            return AnalysisErrorClassification(
                provider_error_type=current.provider_error_type,
                is_temporary=True,
                status_code=current.status_code,
                retry_after_seconds=current.retry_after_seconds,
                cooldown_until=current.cooldown_until,
                configured_key_count=current.configured_key_count,
                available_key_count=current.available_key_count,
            )

        if isinstance(current, httpx.HTTPStatusError):
            status_code = int(current.response.status_code)
            retry_after_seconds = _extract_retry_after_from_http_error(current)

            if status_code == 429:
                return AnalysisErrorClassification(
                    provider_error_type="rate_limited",
                    is_temporary=True,
                    status_code=status_code,
                    retry_after_seconds=retry_after_seconds,
                )
            if status_code in {500, 502, 503, 504}:
                return AnalysisErrorClassification(
                    provider_error_type="provider_unavailable",
                    is_temporary=True,
                    status_code=status_code,
                )
            if status_code == 400:
                msg = ""
                try:
                    payload = current.response.json()
                    if isinstance(payload, dict):
                        msg = (payload.get("error") or {}).get("message") or ""
                except Exception:
                    pass

                if not msg:
                    # Fallback: check error message string if JSON parsing fails
                    msg = str(current) or ""

                invalid_key_markers = (
                    "api key not valid",
                    "invalid api key",
                    "all configured gemini api keys are invalid",
                )
                if any(m in msg.lower() for m in invalid_key_markers):
                    return AnalysisErrorClassification(
                        provider_error_type="invalid_api_key",
                        is_temporary=False,
                        status_code=status_code,
                    )
                return AnalysisErrorClassification(
                    provider_error_type="bad_request",
                    is_temporary=False,
                    status_code=status_code,
                )
            if status_code == 401:
                return AnalysisErrorClassification(
                    provider_error_type="unauthorized",
                    is_temporary=False,
                    status_code=status_code,
                )
            if status_code == 403:
                return AnalysisErrorClassification(
                    provider_error_type="forbidden",
                    is_temporary=False,
                    status_code=status_code,
                )
            if status_code == 404:
                return AnalysisErrorClassification(
                    provider_error_type="not_found",
                    is_temporary=False,
                    status_code=status_code,
                )
            return AnalysisErrorClassification(
                provider_error_type="provider_http_error",
                is_temporary=False,
                status_code=status_code,
            )

        if isinstance(
            current,
            TimeoutError | httpx.ReadTimeout | httpx.ConnectTimeout | httpx.PoolTimeout,
        ):
            return AnalysisErrorClassification(
                provider_error_type="timeout",
                is_temporary=True,
            )

        if isinstance(current, httpx.ConnectError):
            return AnalysisErrorClassification(
                provider_error_type="connection_error",
                is_temporary=True,
            )

    message = str(exc).lower()
    payload_error_markers = (
        "failed to parse ai response",
        "invalid json body",
        "response is too large",
        "returned no candidates",
        "without content parts",
        "missing required fields",
        "payload invalid",
        "ai_response_",
    )
    if any(marker in message for marker in payload_error_markers):
        return AnalysisErrorClassification(
            provider_error_type="payload_invalid",
            is_temporary=False,
        )

    if "timed out" in message or "timeout" in message:
        return AnalysisErrorClassification(
            provider_error_type="timeout",
            is_temporary=True,
        )

    return AnalysisErrorClassification(
        provider_error_type="unexpected_error",
        is_temporary=False,
    )


def _build_retry_delay_seconds(
    retry_count: int,
    *,
    retry_after_seconds: float | None = None,
) -> int:
    base_seconds = RETRY_BACKOFF_SCHEDULE_SECONDS.get(
        retry_count,
        RETRY_BACKOFF_SCHEDULE_SECONDS[MAX_ANALYSIS_RETRIES],
    )
    jitter_seconds = random.randint(0, RETRY_JITTER_MAX_SECONDS)
    countdown_seconds = base_seconds + jitter_seconds

    if retry_after_seconds is not None:
        countdown_seconds = max(countdown_seconds, int(retry_after_seconds + 0.999))

    return countdown_seconds


def _configured_analysis_max_retries() -> int:
    return max(
        0,
        int(settings.AI_ANALYSIS_MAX_RETRIES or DEFAULT_ANALYSIS_MAX_RETRIES),
    )


def _build_final_failure_reason(
    *,
    classification: AnalysisErrorClassification,
    error: str,
) -> str:
    sanitized_error = sanitize_log_text(error) or "Erro não informado."
    if classification.provider_error_type == "rate_limited":
        return "provider_rate_limit_exhausted"
    if classification.is_temporary:
        return (
            "Alta demanda no provedor IA após múltiplas tentativas. "
            f"Detalhe técnico: {sanitized_error[:700]}"
        )
    if classification.provider_error_type == "payload_invalid":
        if sanitized_error.startswith("ai_response_"):
            return sanitized_error[:1000]
        return f"Payload inválido retornado pelo provedor IA. {sanitized_error[:700]}"
    return sanitized_error[:1000]


def _retry_failure_reason(classification: AnalysisErrorClassification) -> str:
    if classification.provider_error_type == "rate_limited":
        return RATE_LIMIT_RETRY_MESSAGE
    return TEMPORARY_RETRY_MESSAGE


def _normalize_provider(provider: str) -> str:
    return provider.strip().lower()


def _provider_api_key_is_configured(provider: str) -> bool:
    normalized = _normalize_provider(provider)

    if normalized in {"anthropic", "claude"}:
        return bool(settings.ANTHROPIC_API_KEY)

    if normalized in {"google", "gemini"}:
        return bool(settings.google_api_keys)

    raise RuntimeError(f"Unsupported AI provider configured for analysis: {provider}")


async def _provider_has_db_credentials(provider: str, model_id: str | None, sessionmaker) -> bool:
    from src.application.services.ai_provider_credential_service import AIProviderCredentialService

    try:
        async with sessionmaker() as session:
            count = await AIProviderCredentialService(session).count_matching_credentials(
                provider=provider,
                model_id=model_id,
            )
            return count > 0
    except Exception:
        return False


def _provider_api_key_hint(provider: str) -> str:
    normalized = _normalize_provider(provider)

    if normalized in {"anthropic", "claude"}:
        return "ANTHROPIC_API_KEY"

    if normalized in {"google", "gemini"}:
        return "GOOGLE_API_KEYS"

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
    sanitized = re.sub(
        r"\b[\w\.-]+@[\w\.-]+\.\w+\b",
        "[email_removido]",
        sanitized,
        flags=re.IGNORECASE,
    )
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
        "experience": (
            "experiencia",
            "experiência",
            "experience",
            "cargo",
            "empresa",
            "projeto",
            "role",
        ),
        "skills": (
            "skill",
            "skills",
            "habilidade",
            "habilidades",
            "competencia",
            "competências",
            "stack",
        ),
        "education": (
            "formacao",
            "formação",
            "educacao",
            "educação",
            "education",
            "curso",
            "graduacao",
            "graduação",
        ),
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
        normalized = (
            normalized.replace("ç", "c")
            .replace("ã", "a")
            .replace("á", "a")
            .replace("é", "e")
        )
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
    return _truncate_with_notice(relevant, int(settings.AI_ANALYSIS_MAX_RESUME_CHARS))


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

    max_chars = int(settings.AI_ANALYSIS_MAX_JOB_CHARS)
    merged = "\n\n".join(chunks)
    return _truncate_with_notice(merged, max_chars)


def _build_minimal_user_prompt(*, resume_text: str, job_context: str) -> str:
    # IMPORTANT: this prompt must request ``experiences`` and ``education`` so
    # the parser can derive ``total_experience_months`` / ``highest_education_level``.
    # Without those fields, every candidate lands on a fixed (50, 60) education/
    # confidence pair regardless of resume content — the very regression this
    # exists to prevent. Do not remove these fields without updating
    # ``response_parser._normalize_resume_profiler_v2`` accordingly.
    return (
        "INSTRUÇÃO:\n"
        f"{PROMPT_INSTRUCTION}\n\n"
        "Responda começando diretamente com '{'.\n"
        "Sem blocos de código. Sem explicação. Sem campos extras.\n"
        "Use JSON minificado quando possível.\n\n"
        "DADOS:\n"
        "CURRICULO_RESUMIDO:\n"
        f"{resume_text}\n\n"
        "VAGA_RESUMIDA:\n"
        f"{job_context or 'sem contexto de vaga'}\n\n"
        "SAÍDA:\n"
        "Apenas JSON puro e compacto.\n"
        "Retorne EXATAMENTE estes campos (não invente dados; use null/[] quando ausente):\n"
        "{\n"
        '  "professional_area": "technology|data|administrative|accounting|financial|'
        'commercial|operational|leadership|other",\n'
        '  "seniority_level": "intern|junior|mid|senior|lead|undefined",\n'
        '  "skills": ["maximo 4 skills curtas e normalizadas"],\n'
        '  "experiences": [{"role": "string", "duration_months": "integer >= 0"}],\n'
        '  "education": [{"level": "none|high_school|technical|bachelor|postgraduate|'
        'master|phd", "field": "string|null"}],\n'
        '  "total_experience_months": "integer >= 0"\n'
        "}"
    )


def _validate_prompt_before_ai(*, prompt: str, resume_chars: int, job_chars: int) -> None:
    reasons: list[str] = []
    total_chars = len(prompt)

    if resume_chars > int(settings.AI_ANALYSIS_MAX_RESUME_CHARS):
        reasons.append("resume_chars_exceeded")
    if job_chars > int(settings.AI_ANALYSIS_MAX_JOB_CHARS):
        reasons.append("job_chars_exceeded")
    if total_chars > int(settings.AI_ANALYSIS_MAX_PROMPT_CHARS):
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
    )

    if reasons:
        logger.warning(
            "analysis.prompt_invalid",
            reasons=reasons,
            prompt_chars_total=total_chars,
            resume_chars=resume_chars,
            job_chars=job_chars,
        )
        raise AnalysisPromptTooLargeError(
            reasons=reasons,
            prompt_chars=total_chars,
            resume_chars=resume_chars,
            job_chars=job_chars,
        )


def _extract_rate_limit_retry_after_seconds(error: str) -> float | None:
    sanitized_error = sanitize_log_text(error) or ""
    if "status_code=429" not in sanitized_error:
        return None

    retry_after_match = re.search(r"retry_after_seconds=([0-9]+(?:\.[0-9]+)?)", sanitized_error)
    if retry_after_match:
        try:
            return max(0.0, float(retry_after_match.group(1)))
        except ValueError:
            return None

    cooldown_seconds = max(1, int(settings.AI_ANALYSIS_RATE_LIMIT_COOLDOWN_SECONDS))
    return float(cooldown_seconds)


def _run_async(coro):
    return asyncio.run(coro)


def _extract_failure_details(exc: Exception) -> AnalysisFailureDetails | None:
    details = getattr(exc, "details", None)
    if isinstance(details, AnalysisFailureDetails):
        return details
    return None


def _analysis_failure_metadata(
    *,
    analysis_id: str | UUID,
    task_id: str | None,
    error: str,
    retry_count: int,
    attempts: int,
    classification: AnalysisErrorClassification,
    failure_details: AnalysisFailureDetails | None,
) -> dict:
    return {
        "analysis_id": analysis_id,
        "task_id": task_id,
        "failure_reason": _build_final_failure_reason(
            classification=classification,
            error=error,
        ),
        "provider_error_type": classification.provider_error_type,
        "provider_status_code": classification.status_code,
        "retry_count": min(retry_count, _configured_analysis_max_retries()),
        "max_retries": _configured_analysis_max_retries(),
        "attempts": attempts,
        "provider": failure_details.provider if failure_details else None,
        "model": failure_details.model_id if failure_details else None,
        "prompt_version": failure_details.prompt_version_used if failure_details else None,
        "duration_ms": failure_details.processing_time_ms if failure_details else None,
        "used_real_ai": bool(
            failure_details
            and (
                int(failure_details.input_tokens or 0)
                + int(failure_details.output_tokens or 0)
                + int(failure_details.cache_read_tokens or 0)
                + int(failure_details.cache_write_tokens or 0)
            )
            > 0
        ),
        "payload_invalid": classification.provider_error_type == "payload_invalid",
        "ai_response_validation_error": (
            failure_details.ai_response_validation_error if failure_details else None
        ),
        "ai_response_validation_fields": (
            failure_details.ai_response_validation_fields if failure_details else None
        ),
        "sensitive_output_detected": (
            failure_details.sensitive_output_detected if failure_details else False
        ),
    }


def _normalize_real_ai_result(
    result: tuple,
    *,
    prompt_max_tokens: int,
    system_prompt_chars: int,
    user_prompt_chars: int,
    prompt_chars_total: int,
) -> tuple[dict, str, int, int, int, int, int, str, str | None, int, int, int, int]:
    if len(result) == 13:
        return result

    if len(result) == 8:
        (
            result_fields,
            raw_response,
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            processing_ms,
            prompt_version_used,
        ) = result
        return (
            result_fields,
            raw_response,
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            processing_ms,
            prompt_version_used,
            None,
            prompt_max_tokens,
            system_prompt_chars,
            user_prompt_chars,
            prompt_chars_total or system_prompt_chars + user_prompt_chars,
        )

    raise ValueError(
        "Unexpected _run_real_ai_analysis result shape: "
        f"expected 8 or 13 items, got {len(result)}"
    )


@celery_app.task(
    bind=True,
    name="src.interface.workers.analysis_tasks.process_analysis",
    max_retries=MAX_ANALYSIS_RETRIES,
    soft_time_limit=120,
    time_limit=180,
)
def process_analysis(self, analysis_id: str) -> dict:  # type: ignore[override]
    task_id = str(self.request.id)

    try:
        result = _run_async(_process_analysis_async(analysis_id, task_id))

        # Task órfã: análise não encontrada, morre silenciosamente
        if result.get("status") == "not_found":
            logger.warning(
                "analysis.orphaned_task_not_found",
                analysis_id=analysis_id,
                task_id=task_id,
                reason="analysis does not exist in database",
            )
            return result

        return result

    except Exception as exc:
        error_str = sanitize_log_text(str(exc)) or type(exc).__name__
        is_not_found = "not_found" in error_str.lower() or "disappeared" in error_str.lower()
        failure_details = _extract_failure_details(exc)
        classification = _classify_analysis_exception(exc)
        attempt = self.request.retries + 1
        task_max_retries = _configured_analysis_max_retries()

        logger.exception(
            "analysis.task_failed",
            analysis_id=analysis_id,
            task_id=task_id,
            retries=self.request.retries,
            attempt=attempt,
            error=error_str,
            is_not_found=is_not_found,
            provider=failure_details.provider if failure_details else None,
            model_id=failure_details.model_id if failure_details else None,
            provider_error_type=classification.provider_error_type,
            status_code=classification.status_code,
        )

        if is_not_found:
            # Análise órfã: não existe no banco, não faz retry
            logger.warning(
                "analysis.orphaned_task_exception",
                analysis_id=analysis_id,
                task_id=task_id,
                reason="analysis not found in database, no retry",
            )
            return {"analysis_id": analysis_id, "status": "not_found"}

        if not classification.is_temporary:
            _run_async(_mark_analysis_failed_async(
                analysis_id=analysis_id,
                task_id=task_id,
                error=error_str,
                retry_count=self.request.retries,
                attempts=attempt,
                classification=classification,
                failure_details=failure_details,
                expected_worker_claim_id=task_id,
            ))
            raise

        retry_count = self.request.retries + 1

        if retry_count > task_max_retries:
            _run_async(_mark_analysis_failed_async(
                analysis_id=analysis_id,
                task_id=task_id,
                error=error_str,
                retry_count=task_max_retries,
                attempts=attempt,
                classification=classification,
                failure_details=failure_details,
                expected_worker_claim_id=task_id,
            ))
            raise

        persisted_retry_count = min(retry_count, task_max_retries)
        countdown = _build_retry_delay_seconds(
            persisted_retry_count,
            retry_after_seconds=classification.retry_after_seconds,
        )

        logger.warning(
            "analysis.retry_scheduled",
            analysis_id=analysis_id,
            provider=failure_details.provider if failure_details else None,
            model_id=failure_details.model_id if failure_details else None,
            attempt=attempt,
            retry_count=retry_count,
            retry_in_seconds=countdown,
            status_code=classification.status_code,
            provider_error_type=classification.provider_error_type,
        )

        _run_async(_mark_analysis_retry_scheduled_async(
            analysis_id=analysis_id,
            task_id=task_id,
            error=error_str,
            retry_count=persisted_retry_count,
            countdown_seconds=countdown,
            attempts=attempt,
            classification=classification,
            failure_details=failure_details,
            expected_worker_claim_id=task_id,
        ))

        raise self.retry(exc=exc, countdown=countdown) from exc


async def _process_analysis_async(analysis_id: str, task_id: str) -> dict:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    configured_max_tokens = settings.AI_MAX_TOKENS
    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        return await _process_analysis_with_session(
            analysis_id=analysis_id,
            task_id=task_id,
            sessionmaker=celery_sessionmaker,
            configured_max_tokens=configured_max_tokens,
        )
    finally:
        await celery_engine.dispose()


async def _process_analysis_with_session(
    analysis_id: str,
    task_id: str,
    sessionmaker,
    configured_max_tokens: int | None = None,
) -> dict:
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

    claimed = await _claim_analysis_for_processing(
        analysis_id=analysis_uuid,
        task_id=task_id,
        worker_id=worker_id,
        sessionmaker=sessionmaker,
    )
    if not claimed:
        current_status = await _load_analysis_status(
            analysis_id=analysis_uuid,
            sessionmaker=sessionmaker,
        )
        if current_status is None:
            logger.warning("analysis.not_found", analysis_id=str(analysis_uuid))
            return {"analysis_id": str(analysis_uuid), "status": "not_found"}
        if current_status in {"completed", "failed", "cancelled", "discarded"}:
            logger.info(
                "analysis.skipped_terminal",
                analysis_id=str(analysis_uuid),
                status=current_status,
            )
            return {"analysis_id": str(analysis_uuid), "status": current_status}
        logger.info(
            "analysis.claim_skipped",
            analysis_id=str(analysis_uuid),
            status=current_status,
            task_id=task_id,
        )
        return {
            "analysis_id": str(analysis_uuid),
            "status": "claim_skipped",
            "current_status": current_status,
        }

    async with sessionmaker() as session:
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
            logger.warning(
                "analysis.disappeared_after_claim",
                analysis_id=str(analysis_uuid),
                task_id=task_id,
            )
            return {"analysis_id": str(analysis_uuid), "status": "not_found"}

        analysis, version, prompt_tpl, ai_model = fetched

        resume_text = version.extracted_text

        if not resume_text or not resume_text.strip():
            raise RuntimeError(
                "Resume text vazio. Extração de PDF ainda não concluída."
            )

        if resume_text.strip() == _PLACEHOLDER_RESUME:
            raise RuntimeError(
                "Resume text contém placeholder. O PDF ainda não foi extraído."
            )

        provider = ai_model.provider
        model_id = ai_model.model_id
        prompt_version = str(prompt_tpl.version)
        max_tokens_cap = configured_max_tokens or settings.AI_MAX_TOKENS
        prompt_max_tokens = min(
            int(prompt_tpl.max_tokens or max_tokens_cap),
            max_tokens_cap,
            settings.AI_ANALYSIS_MAX_OUTPUT_TOKENS,
        )
        prompt_temperature = float(prompt_tpl.temperature)
        job_id = analysis.job_id
        queue_name = ANALYSIS_QUEUE
        await record_analysis_audit_event(
            session,
            action="ai_analysis_started",
            resource_id=analysis_uuid,
            user_id=analysis.requested_by,
            metadata={
                "provider": provider,
                "model": model_id,
                "prompt_version": prompt_version,
                "used_real_ai": _real_ai_calls_allowed(),
                "retry_count": analysis.retry_count,
                "max_retries": _configured_analysis_max_retries(),
                "analysis_started_at": analysis.started_at,
                "task_id": task_id,
                "worker_id": worker_id,
                "job_id": job_id,
                "resume_version_id": version.id,
                "extraction_used_ocr": None,
                "text_quality_status": "useful",
            },
        )
        await session.commit()

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
        max_retries=_configured_analysis_max_retries(),
        job_id=str(job_id) if job_id else None,
    )

    if not _provider_api_key_is_configured(provider) and not await _provider_has_db_credentials(
        provider,
        model_id,
        sessionmaker,
    ):
        raise RuntimeError(
            f"{_provider_api_key_hint(provider)} or database AI credential is not configured."
        )

    elif not _real_ai_calls_allowed():
        raise RuntimeError("ALLOW_AI_TOKEN_SPEND is False. Real AI calls are blocked.")

    else:
        ai_result = await _run_real_ai_analysis(
            analysis_id=str(analysis_uuid),
            provider=provider,
            model_id=model_id,
            resume_text=resume_text,
            prompt_version=prompt_version,
            prompt_max_tokens=prompt_max_tokens,
            prompt_temperature=prompt_temperature,
            job_id=job_id,
            queue_name=queue_name,
            sessionmaker=sessionmaker,
        )
        (
            result_fields,
            raw_response,
            input_tokens,
            output_tokens,
            cache_read,
            cache_write,
            processing_ms,
            prompt_version_used,
            finish_reason,
            max_tokens_used,
            system_prompt_chars,
            user_prompt_chars,
            prompt_chars_total,
        ) = _normalize_real_ai_result(
            ai_result,
            prompt_max_tokens=prompt_max_tokens,
            system_prompt_chars=len(PROMPT_INSTRUCTION),
            user_prompt_chars=0,
            prompt_chars_total=0,
        )

    persisted = await _persist_completed_analysis(
        analysis_id=analysis_uuid,
        result_fields=result_fields,
        raw_response=raw_response,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read=cache_read,
        cache_write=cache_write,
        processing_ms=processing_ms,
        prompt_version_used=prompt_version_used,
        finish_reason=finish_reason,
        max_tokens_used=max_tokens_used,
        system_prompt_chars=system_prompt_chars,
        user_prompt_chars=user_prompt_chars,
        prompt_chars_total=prompt_chars_total,
        provider=provider,
        model_id=model_id,
        expected_worker_claim_id=task_id,
        sessionmaker=sessionmaker,
    )
    if not persisted:
        logger.warning(
            "analysis.persist_skipped_claim_lost",
            analysis_id=str(analysis_uuid),
            task_id=task_id,
        )
        return {"analysis_id": str(analysis_uuid), "status": "claim_lost"}

    await _record_ai_provider_available(
        provider=provider,
        model_id=model_id,
        sessionmaker=sessionmaker,
    )

    if job_id is not None:
        from src.interface.workers.matching_tasks import match_analysis_to_job

        match_analysis_to_job.delay(str(analysis_uuid), str(job_id))
        logger.info(
            "analysis.matching_enqueued",
            analysis_id=str(analysis_uuid),
            job_id=str(job_id),
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


async def _record_ai_provider_available(
    *,
    provider: str,
    model_id: str,
    sessionmaker,
) -> None:
    from src.application.services.ai_provider_health_service import AIProviderHealthService

    try:
        async with sessionmaker() as session:
            await AIProviderHealthService(session).record_available(
                provider=provider,
                model_id=model_id,
            )
            await session.commit()
    except Exception:
        logger.warning(
            "ai_provider.health_available_persist_skipped",
            provider=provider,
            model_id=model_id,
        )


async def _claim_analysis_for_processing(
    *,
    analysis_id: UUID,
    task_id: str,
    worker_id: str,
    sessionmaker,
) -> bool:
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    now = datetime.now(UTC)
    stale_cutoff = now - CLAIM_STALE_AFTER

    async with sessionmaker() as session:
        claim_result = await session.execute(
            sa.update(AnalysisModel)
            .where(
                AnalysisModel.id == analysis_id,
                sa.or_(
                    AnalysisModel.status == "pending",
                    AnalysisModel.status == "retry_scheduled",
                    sa.and_(
                        AnalysisModel.status == "processing",
                        sa.or_(
                            AnalysisModel.claimed_at.is_(None),
                            AnalysisModel.claimed_at < stale_cutoff,
                            sa.and_(
                                AnalysisModel.stale_at.is_not(None),
                                AnalysisModel.stale_at < now,
                            ),
                        ),
                    ),
                ),
            )
            .values(
                status="processing",
                started_at=now,
                claimed_at=now,
                stale_at=now + CLAIM_STALE_AFTER,
                worker_claim_id=task_id,
                worker_id=worker_id,
                task_id=task_id,
                queue_name=ANALYSIS_QUEUE,
                failure_reason=None,
                failed_at=None,
                next_retry_at=None,
                provider_error_type=None,
                provider_status_code=None,
                updated_at=now,
            )
        )
        claimed = int(claim_result.rowcount or 0) > 0

        if claimed:
            await session.commit()
        else:
            await session.rollback()

        return claimed


async def _load_analysis_status(
    *,
    analysis_id: UUID,
    sessionmaker,
) -> str | None:
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    async with sessionmaker() as session:
        analysis = await session.scalar(
            sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        )
        if analysis is None:
            return None
        return str(analysis.status)


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
    sessionmaker,
) -> tuple[dict, str, int, int, int, int, int, str, str | None, int, int, int, int]:
    from src.application.ports.ai_service import AIAnalysisRequest
    from src.infrastructure.ai.factory import AIServiceFactory
    from src.infrastructure.ai.response_parser import (
        AIResponseValidationError,
        parse_analysis_response,
    )
    from src.infrastructure.database.models.job_model import JobModel

    prompt_version_used = f"{prompt_version or 'unknown'}:gemini_minimal_compact_v2"
    compact_job_context = ""

    if job_id:
        async with sessionmaker() as session:
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
        max_retries=MAX_ANALYSIS_RETRIES,
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
        result_fields = parse_analysis_response(ai_response.content)
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

    try:
        _validate_result_fields(result_fields)
    except Exception as exc:
        raise AnalysisExecutionError(
            sanitize_log_text(str(exc)) or type(exc).__name__,
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
                sensitive_output_detected=contains_sensitive_text(ai_response.content),
            ),
        ) from exc

    return (
        result_fields,
        ai_response.content,
        ai_response.input_tokens,
        ai_response.output_tokens,
        ai_response.cache_read_tokens,
        ai_response.cache_write_tokens,
        ai_response.processing_time_ms,
        prompt_version_used,
        ai_response.finish_reason,
        ai_request.max_tokens,
        len(PROMPT_INSTRUCTION),
        len(user_prompt),
        len(PROMPT_INSTRUCTION) + len(user_prompt),
    )


def _validate_result_fields(result_fields: dict) -> None:
    required_fields = {
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
    finish_reason: str | None = None,
    max_tokens_used: int | None = None,
    system_prompt_chars: int | None = None,
    user_prompt_chars: int | None = None,
    prompt_chars_total: int | None = None,
    provider: str | None = None,
    model_id: str | None = None,
    expected_worker_claim_id: str | None = None,
    sessionmaker,
) -> bool:
    from src.infrastructure.database.models.analysis_model import (
        AnalysisModel,
        AnalysisResultModel,
    )

    async with sessionmaker() as session:
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
            await session.rollback()
            return False

        if analysis.status == "completed":
            logger.warning(
                "analysis.already_completed_race_condition",
                analysis_id=str(analysis_id),
            )
            await session.rollback()
            return False

        if (
            expected_worker_claim_id is not None
            and analysis.worker_claim_id != expected_worker_claim_id
        ):
            logger.warning(
                "analysis.persist_claim_mismatch",
                analysis_id=str(analysis_id),
                expected_worker_claim_id=expected_worker_claim_id,
                actual_worker_claim_id=analysis.worker_claim_id,
            )
            await session.rollback()
            return False

        existing_result = await session.scalar(
            sa.select(AnalysisResultModel).where(
                AnalysisResultModel.analysis_id == analysis_id
            )
        )

        result_payload = {
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
            "finish_reason": finish_reason,
            "max_tokens_used": max_tokens_used,
            "system_prompt_chars": system_prompt_chars,
            "user_prompt_chars": user_prompt_chars,
            "prompt_chars_total": prompt_chars_total,
            "raw_llm_response": redact_ai_response_text(raw_response),
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
        analysis.provider_error_type = None
        analysis.provider_status_code = None
        analysis.attempts = 0
        analysis.worker_claim_id = None
        analysis.claimed_at = None
        analysis.stale_at = None
        analysis.updated_at = now

        total_tokens = (
            int(input_tokens or 0)
            + int(output_tokens or 0)
            + int(cache_read or 0)
            + int(cache_write or 0)
        )
        sensitive_output_detected = contains_sensitive_text(raw_response)
        completed_metadata = {
            "provider": provider,
            "model": model_id,
            "prompt_version": prompt_version_used,
            "used_real_ai": total_tokens > 0,
            "provider_error_type": None,
            "retry_count": analysis.retry_count,
            "max_retries": _configured_analysis_max_retries(),
            "duration_ms": processing_ms,
            "analysis_started_at": analysis.started_at,
            "analysis_finished_at": now,
            "finish_reason": finish_reason,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cache_read_tokens": cache_read,
            "cache_write_tokens": cache_write,
            "max_tokens_used": max_tokens_used,
            "system_prompt_chars": system_prompt_chars,
            "user_prompt_chars": user_prompt_chars,
            "prompt_chars_total": prompt_chars_total,
            "sensitive_output_detected": sensitive_output_detected,
            "payload_invalid": False,
        }
        await record_analysis_audit_event(
            session,
            action="ai_analysis_completed",
            resource_id=analysis_id,
            user_id=analysis.requested_by,
            metadata=completed_metadata,
        )
        if sensitive_output_detected:
            await record_analysis_audit_event(
                session,
                action="sensitive_output_sanitized",
                resource_id=analysis_id,
                user_id=analysis.requested_by,
                metadata={
                    **completed_metadata,
                    "raw_llm_response_redacted": True,
                },
            )

        await session.commit()
        return True


async def _mark_analysis_retry_scheduled(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
    countdown_seconds: int,
    attempts: int,
    classification: AnalysisErrorClassification,
    failure_details: AnalysisFailureDetails | None = None,
    expected_worker_claim_id: str | None = None,
    sessionmaker=None,
) -> bool:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    owns_sessionmaker = sessionmaker is None
    try:
        analysis_uuid = UUID(str(analysis_id))
    except ValueError:
        return False

    if owns_sessionmaker:
        sessionmaker = get_session_factory()

    try:
        async with sessionmaker() as session:
            analysis = await session.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == analysis_uuid)
            )

            if analysis is None:
                return False

            if (
                expected_worker_claim_id is not None
                and analysis.worker_claim_id != expected_worker_claim_id
            ):
                await session.rollback()
                return False

            now = datetime.now(UTC)
            await _upsert_failure_result(
                session=session,
                analysis_id=analysis_uuid,
                failure_details=failure_details,
            )

            analysis.status = "retry_scheduled"
            analysis.task_id = str(task_id) if task_id is not None else analysis.task_id
            analysis.retry_count = min(retry_count, _configured_analysis_max_retries())
            analysis.attempts = attempts
            analysis.failure_reason = _retry_failure_reason(classification)
            analysis.failed_at = None
            analysis.started_at = None
            analysis.next_retry_at = now + timedelta(seconds=countdown_seconds)
            analysis.provider_error_type = classification.provider_error_type
            analysis.provider_status_code = classification.status_code
            analysis.worker_claim_id = None
            analysis.claimed_at = None
            analysis.stale_at = None
            analysis.updated_at = now

            if (
                classification.provider_error_type == "rate_limited"
                and failure_details is not None
                and failure_details.model_id
            ):
                from src.application.services.ai_provider_health_service import (
                    AIProviderHealthService,
                )

                await AIProviderHealthService(session).record_rate_limited(
                    provider=failure_details.provider,
                    model_id=failure_details.model_id,
                    retry_after_seconds=classification.retry_after_seconds,
                    cooldown_until=classification.cooldown_until,
                    status_code=classification.status_code,
                    configured_key_count=classification.configured_key_count,
                    available_key_count=classification.available_key_count,
                )

            await record_analysis_audit_event(
                session,
                action="ai_analysis_retry_scheduled",
                resource_id=analysis_uuid,
                user_id=analysis.requested_by,
                metadata={
                    "provider": failure_details.provider if failure_details else None,
                    "model": failure_details.model_id if failure_details else None,
                    "prompt_version": (
                        failure_details.prompt_version_used if failure_details else None
                    ),
                    "failure_reason": analysis.failure_reason,
                    "provider_error_type": classification.provider_error_type,
                    "provider_status_code": classification.status_code,
                    "retry_count": analysis.retry_count,
                    "max_retries": _configured_analysis_max_retries(),
                    "attempts": attempts,
                    "retry_in_seconds": countdown_seconds,
                    "next_retry_at": analysis.next_retry_at,
                    "duration_ms": (
                        failure_details.processing_time_ms if failure_details else None
                    ),
                    "used_real_ai": bool(
                        failure_details
                        and (
                            int(failure_details.input_tokens or 0)
                            + int(failure_details.output_tokens or 0)
                            + int(failure_details.cache_read_tokens or 0)
                            + int(failure_details.cache_write_tokens or 0)
                        )
                        > 0
                    ),
                    "payload_invalid": classification.provider_error_type == "payload_invalid",
                    "sensitive_output_detected": (
                        failure_details.sensitive_output_detected
                        if failure_details
                        else False
                    ),
                },
            )
            await session.commit()
            return True
    except (RuntimeError, sa.exc.SQLAlchemyError):
        if not owns_sessionmaker:
            raise
        logger.warning(
            "analysis.retry_state_persist_skipped",
            analysis_id=analysis_id,
            task_id=task_id,
        )
        return False


async def _mark_analysis_failed(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
    attempts: int,
    classification: AnalysisErrorClassification,
    failure_details: AnalysisFailureDetails | None = None,
    expected_worker_claim_id: str | None = None,
    sessionmaker=None,
) -> bool:
    from src.infrastructure.database.connection import get_session_factory
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    owns_sessionmaker = sessionmaker is None
    try:
        analysis_uuid = UUID(str(analysis_id))
    except ValueError:
        return False

    if owns_sessionmaker:
        sessionmaker = get_session_factory()

    try:
        async with sessionmaker() as session:
            analysis = await session.scalar(
                sa.select(AnalysisModel).where(AnalysisModel.id == analysis_uuid)
            )

            if analysis is None:
                return False

            if (
                expected_worker_claim_id is not None
                and analysis.worker_claim_id != expected_worker_claim_id
            ):
                await session.rollback()
                return False

            now = datetime.now(UTC)
            await _upsert_failure_result(
                session=session,
                analysis_id=analysis_uuid,
                failure_details=failure_details,
            )

            analysis.status = "failed"
            analysis.task_id = str(task_id) if task_id is not None else analysis.task_id
            analysis.queue_name = ANALYSIS_QUEUE
            analysis.retry_count = min(retry_count, _configured_analysis_max_retries())
            analysis.attempts = attempts
            analysis.failure_reason = _build_final_failure_reason(
                classification=classification,
                error=error,
            )
            analysis.failed_at = now
            analysis.next_retry_at = None
            analysis.provider_error_type = classification.provider_error_type
            analysis.provider_status_code = classification.status_code
            analysis.worker_claim_id = None
            analysis.claimed_at = None
            analysis.stale_at = None
            analysis.updated_at = now

            failure_metadata = _analysis_failure_metadata(
                analysis_id=analysis_uuid,
                task_id=task_id,
                error=error,
                retry_count=retry_count,
                attempts=attempts,
                classification=classification,
                failure_details=failure_details,
            )
            if classification.provider_error_type == "payload_invalid":
                await record_analysis_audit_event(
                    session,
                    action="ai_payload_invalid",
                    resource_id=analysis_uuid,
                    user_id=analysis.requested_by,
                    metadata=failure_metadata,
                )
            await record_analysis_audit_event(
                session,
                action="ai_analysis_failed",
                resource_id=analysis_uuid,
                user_id=analysis.requested_by,
                metadata=failure_metadata,
            )
            await session.commit()
            logger.info(
                "analysis.worker_completed",
                analysis_id=str(analysis_uuid),
                task_id=str(task_id) if task_id is not None else None,
                queue=ANALYSIS_QUEUE,
                status="failed",
                provider_error_type=classification.provider_error_type,
                status_code=classification.status_code,
                attempts=attempts,
            )
            return True
    except (RuntimeError, sa.exc.SQLAlchemyError):
        if not owns_sessionmaker:
            raise
        logger.warning(
            "analysis.failed_state_persist_skipped",
            analysis_id=analysis_id,
            task_id=task_id,
        )
        return False


async def mark_stuck_analyses_as_failed(*, sessionmaker) -> int:
    from src.infrastructure.database.models.analysis_model import AnalysisModel

    marked_count = 0
    now = datetime.now(UTC)

    async with sessionmaker() as session:
        processing_threshold = now - timedelta(minutes=30)

        processing_stuck = await session.execute(
            sa.select(AnalysisModel).where(
                AnalysisModel.status == "processing",
                sa.or_(
                    AnalysisModel.stale_at < now,
                    AnalysisModel.started_at < processing_threshold,
                    sa.and_(
                        AnalysisModel.started_at.is_(None),
                        AnalysisModel.updated_at < processing_threshold,
                    ),
                ),
            )
        )

        for analysis in processing_stuck.scalars().all():
            analysis.status = "failed"
            analysis.failure_reason = (
                "analysis_worker_claim_expired"
                if analysis.stale_at is not None and analysis.stale_at < now
                else "analysis_stuck_processing_timeout"
            )
            analysis.failed_at = now
            analysis.next_retry_at = None
            analysis.worker_claim_id = None
            analysis.claimed_at = None
            analysis.stale_at = None
            analysis.updated_at = now
            marked_count += 1

            logger.warning(
                "analysis.stuck.processing_timeout",
                analysis_id=str(analysis.id),
                reason=analysis.failure_reason,
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
            analysis.failure_reason = "analysis_stuck_pending_timeout"
            analysis.failed_at = now
            analysis.next_retry_at = None
            analysis.worker_claim_id = None
            analysis.claimed_at = None
            analysis.stale_at = None
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


async def _mark_analysis_retry_scheduled_async(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
    countdown_seconds: int,
    attempts: int,
    classification: AnalysisErrorClassification,
    failure_details: AnalysisFailureDetails | None = None,
    expected_worker_claim_id: str | None = None,
) -> bool:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        return await _mark_analysis_retry_scheduled(
            analysis_id=analysis_id,
            task_id=task_id,
            error=error,
            retry_count=retry_count,
            countdown_seconds=countdown_seconds,
            attempts=attempts,
            classification=classification,
            failure_details=failure_details,
            expected_worker_claim_id=expected_worker_claim_id,
            sessionmaker=celery_sessionmaker,
        )
    finally:
        await celery_engine.dispose()


async def _mark_analysis_failed_async(
    *,
    analysis_id: str,
    task_id: str | None,
    error: str,
    retry_count: int,
    attempts: int,
    classification: AnalysisErrorClassification,
    failure_details: AnalysisFailureDetails | None = None,
    expected_worker_claim_id: str | None = None,
) -> None:
    from src.infrastructure.database.connection import create_celery_async_sessionmaker

    celery_engine, celery_sessionmaker = await create_celery_async_sessionmaker()

    try:
        await _mark_analysis_failed(
            analysis_id=analysis_id,
            task_id=task_id,
            error=error,
            retry_count=retry_count,
            attempts=attempts,
            classification=classification,
            failure_details=failure_details,
            expected_worker_claim_id=expected_worker_claim_id,
            sessionmaker=celery_sessionmaker,
        )
    finally:
        await celery_engine.dispose()


async def _upsert_failure_result(
    *,
    session,
    analysis_id: UUID,
    failure_details: AnalysisFailureDetails | None,
) -> None:
    from src.infrastructure.database.models.analysis_model import AnalysisResultModel

    if failure_details is None:
        return

    existing_result = await session.scalar(
        sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis_id)
    )

    payload = {
        "input_tokens": failure_details.input_tokens,
        "output_tokens": failure_details.output_tokens,
        "cache_read_tokens": failure_details.cache_read_tokens,
        "cache_write_tokens": failure_details.cache_write_tokens,
        "processing_time_ms": failure_details.processing_time_ms,
        "finish_reason": failure_details.finish_reason,
        "max_tokens_used": failure_details.max_tokens_used,
        "system_prompt_chars": failure_details.system_prompt_chars,
        "user_prompt_chars": failure_details.user_prompt_chars,
        "prompt_chars_total": failure_details.prompt_chars_total,
        "raw_llm_response": redact_ai_response_text(failure_details.raw_llm_response),
        "prompt_version_used": failure_details.prompt_version_used,
    }

    if existing_result is None:
        session.add(
            AnalysisResultModel(
                analysis_id=analysis_id,
                strengths=[],
                weaknesses=[],
                recommendations=[],
                keywords=[],
                extracted_data={},
                **payload,
            )
        )
        return

    for key, value in payload.items():
        setattr(existing_result, key, value)
