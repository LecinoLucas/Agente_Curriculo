"""AI draft generation service for job vacancies (Fase IA Vaga 3).

Accepts sanitized text (user typed + OCR extracted), calls the configured AI
provider, parses a structured JSON response, registers token usage, and returns
a human-reviewable draft. No auto-save, no auto-publish.

Rules enforced:
- AI never receives images — only sanitized text.
- Full prompt and response are never logged.
- No vaga creation, pipeline mutation, or candidate data access.
- Prompt injection is mitigated by system prompt isolation.
"""
from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.ports.ai_service import AIAnalysisRequest
from src.application.services.ai_usage_log_service import AIUsageLogPayload, persist_ai_usage_log
from src.core.ai_pricing import estimate_ai_cost
from src.core.settings import settings
from src.infrastructure.ai.factory import AIServiceFactory
from src.infrastructure.ai.response_parser import extract_json

from src.application.services.job_ai_draft_rules import (
    sanitize,
    combine,
    user_prompt,
    parse_draft,
    post_validate,
    compute_needs_review,
    _SYSTEM_PROMPT,
    AiDraftValidationError,
    AiDraftParseError,
    AiDraftAIError,
    AiDraftFields,
    AiDraftUsage,
    AiDraftSource,
    AiDraftResult,
)

logger = structlog.get_logger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_TEXT_INPUT_CHARS: int = 6_000
MAX_OCR_TEXT_CHARS: int = 12_000
MAX_COMBINED_CHARS: int = 12_000
_OPERATION = "job_ai_draft"
_VALID_WORK_MODELS = frozenset({"onsite", "hybrid", "remote"})
_VALID_SENIORITY = frozenset(
    {"intern", "junior", "mid", "senior", "lead", "principal", "director"}
)


# ── Exceptions ────────────────────────────────────────────────────────────────

# (Exceptions now imported from job_ai_draft_rules)


# ── Result types ─────────────────────────────────────────────────────────────


# (Types now imported from job_ai_draft_rules)


# ── Public service ────────────────────────────────────────────────────────────

class JobAiDraftService:
    """Stateless AI draft service.

    Raises:
        AiDraftValidationError: both inputs empty after sanitization.
        AiDraftParseError: AI returned unparseable or schema-invalid JSON.
        AiDraftAIError: AI provider call failed.
    """

    async def generate(
        self,
        *,
        text_input: str | None,
        ocr_text: str | None,
        session: AsyncSession,
    ) -> AiDraftResult:
        if getattr(settings, "JOB_AI_DRAFT_USE_LANGGRAPH", False):
            try:
                from src.ai_orchestration.jobs.job_ai_draft_graph import build_job_ai_draft_graph
                
                job_ai_draft_graph = build_job_ai_draft_graph()
                config = {"configurable": {"session": session}}
                state_input = {
                    "text_input": text_input,
                    "ocr_text": ocr_text,
                }
                final_state = await job_ai_draft_graph.ainvoke(state_input, config=config)
                
                # Extract final response from state
                return AiDraftResult(
                    draft=final_state["draft"],
                    needs_review=final_state["needs_review"],
                    warnings=final_state.get("warnings", []),
                    safety_check=final_state.get("safety_check"),
                    usage=final_state["usage"],
                    source=AiDraftSource(
                        text_used=final_state["text_used"],
                        ocr_used=final_state["ocr_used"],
                        input_character_count=final_state["input_character_count"],
                    ),
                )
            except ImportError:
                logger.warning("job_ai_draft.langgraph_not_installed", msg="LangGraph is enabled but not installed. Falling back to procedural flow.")
            except Exception as e:
                # If it's a domain error, re-raise it
                if isinstance(e, (AiDraftValidationError, AiDraftParseError, AiDraftAIError)):
                    raise
                logger.error("job_ai_draft.graph_error", error=str(e))
                # Fallback on other unexpected graph errors if desired, or raise:
                raise AiDraftAIError("Erro interno no processamento do rascunho com IA.") from e
            
        # --- Fallback to procedural flow ---
        text_in = sanitize(text_input or "")[:MAX_TEXT_INPUT_CHARS]
        text_ocr = sanitize(ocr_text or "")[:MAX_OCR_TEXT_CHARS]
        combined = combine(text_in, text_ocr)[:MAX_COMBINED_CHARS]

        if not combined.strip():
            raise AiDraftValidationError(
                "Forneça texto descritivo ou resultado de OCR para gerar o rascunho."
            )

        text_used = bool(text_in.strip())
        ocr_used = bool(text_ocr.strip())
        input_character_count = len(combined)

        ai = AIServiceFactory.create(settings.AI_PROVIDER, settings.AI_MODEL_ID)
        request = AIAnalysisRequest(
            resume_text=combined,
            prompt_template=user_prompt(combined),
            system_prompt=_SYSTEM_PROMPT,
            max_tokens=settings.AI_MAX_TOKENS,
            temperature=0.3,
        )

        t0 = int(time.monotonic() * 1000)
        try:
            ai_response = await ai.analyze(request)
        except Exception as exc:
            elapsed = int(time.monotonic() * 1000) - t0
            logger.error(
                "job_ai_draft.ai_failed",
                error_type=type(exc).__name__,
                elapsed_ms=elapsed,
            )
            await persist_ai_usage_log(
                session,
                AIUsageLogPayload(
                    provider=settings.AI_PROVIDER,
                    model=settings.AI_MODEL_ID,
                    operation=_OPERATION,
                    status="error",
                    input_tokens=0,
                    output_tokens=0,
                    latency_ms=elapsed,
                    error_message="usage_unavailable",
                ),
            )
            raise AiDraftAIError("Provedor de IA indisponível. Tente novamente.") from exc

        elapsed_ms = int(time.monotonic() * 1000) - t0
        input_tokens = ai_response.input_tokens
        output_tokens = ai_response.output_tokens

        try:
            raw = extract_json(ai_response.content)
            draft = parse_draft(raw)
        except Exception as exc:
            logger.error("job_ai_draft.parse_failed", error=str(exc)[:200])
            await persist_ai_usage_log(
                session,
                AIUsageLogPayload(
                    provider=settings.AI_PROVIDER,
                    model=settings.AI_MODEL_ID,
                    operation=_OPERATION,
                    status="error",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=elapsed_ms,
                    error_message="json_parse_error",
                ),
            )
            raise AiDraftParseError("Resposta da IA não pôde ser interpretada") from exc

        draft, warnings, safety_check = post_validate(draft, combined)
        needs_review = compute_needs_review(draft)
        
        if any("discriminatório" in w for w in warnings):
            needs_review.append("safety_check")
        if safety_check is not None and "safety_check" not in needs_review:
            needs_review.append("safety_check")

        cost_decimal: Decimal | None = estimate_ai_cost(
            settings.AI_PROVIDER,
            settings.AI_MODEL_ID,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        estimated_cost = float(cost_decimal) if cost_decimal is not None else None

        await persist_ai_usage_log(
            session,
            AIUsageLogPayload(
                provider=settings.AI_PROVIDER,
                model=settings.AI_MODEL_ID,
                operation=_OPERATION,
                status="success",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=elapsed_ms,
            ),
        )

        logger.info(
            "job_ai_draft.completed",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            needs_review_count=len(needs_review),
            input_character_count=input_character_count,
        )

        return AiDraftResult(
            draft=draft,
            needs_review=needs_review,
            warnings=warnings,
            safety_check=safety_check,
            usage=AiDraftUsage(
                provider=settings.AI_PROVIDER,
                model=settings.AI_MODEL_ID,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                estimated_cost=estimated_cost,
            ),
            source=AiDraftSource(
                text_used=text_used,
                ocr_used=ocr_used,
                input_character_count=input_character_count,
            ),
        )
