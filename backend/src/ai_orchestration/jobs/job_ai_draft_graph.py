import time
from typing import Any

from langgraph.graph import StateGraph, START, END
from langchain_core.runnables import RunnableConfig

from src.application.ports.ai_service import AIAnalysisRequest
from src.application.services.ai_usage_log_service import AIUsageLogPayload, persist_ai_usage_log
from src.core.ai_pricing import estimate_ai_cost
from src.core.settings import settings
from src.infrastructure.ai.factory import AIServiceFactory
from src.infrastructure.ai.response_parser import extract_json

from src.application.services.job_ai_draft_service import (
    MAX_TEXT_INPUT_CHARS,
    MAX_OCR_TEXT_CHARS,
    MAX_COMBINED_CHARS,
    _OPERATION
)
from src.application.services.job_ai_draft_rules import (
    sanitize,
    combine,
    user_prompt,
    parse_draft,
    post_validate,
    compute_needs_review,
    refine_requirements,
    evaluate_quality,
    _SYSTEM_PROMPT,
    AiDraftValidationError,
    AiDraftParseError,
    AiDraftAIError,
    AiDraftUsage,
)
from src.ai_orchestration.jobs.job_ai_draft_state import JobAiDraftState
import structlog

logger = structlog.get_logger(__name__)

async def normalize_input_node(state: JobAiDraftState, config: RunnableConfig) -> dict[str, Any]:
    text_in = sanitize(state.get("text_input") or "")[:MAX_TEXT_INPUT_CHARS]
    text_ocr = sanitize(state.get("ocr_text") or "")[:MAX_OCR_TEXT_CHARS]
    combined = combine(text_in, text_ocr)[:MAX_COMBINED_CHARS]

    if not combined.strip():
        raise AiDraftValidationError(
            "Forneça texto descritivo ou resultado de OCR para gerar o rascunho."
        )

    return {
        "combined_text": combined,
        "text_used": bool(text_in.strip()),
        "ocr_used": bool(text_ocr.strip()),
        "input_character_count": len(combined)
    }

async def generate_draft_node(state: JobAiDraftState, config: RunnableConfig) -> dict[str, Any]:
    combined = state["combined_text"]
    session = config["configurable"]["session"]
    
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
        raise AiDraftAIError("Provedor de IA indisponível. Tente novamente.") from exc

    elapsed_ms = int(time.monotonic() * 1000) - t0
    input_tokens = ai_response.input_tokens
    output_tokens = ai_response.output_tokens

    cost_decimal = estimate_ai_cost(
        settings.AI_PROVIDER,
        settings.AI_MODEL_ID,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    )
    estimated_cost = float(cost_decimal) if cost_decimal is not None else None

    # We do the persist log here because it fits the step
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

    return {
        "raw_content": ai_response.content,
        "usage": AiDraftUsage(
            provider=settings.AI_PROVIDER,
            model=settings.AI_MODEL_ID,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            estimated_cost=estimated_cost,
        )
    }

async def parse_draft_node(state: JobAiDraftState, config: RunnableConfig) -> dict[str, Any]:
    try:
        raw = extract_json(state["raw_content"])
        draft = parse_draft(raw)
    except Exception as exc:
        logger.error("job_ai_draft.parse_failed", error=str(exc)[:200])
        raise AiDraftParseError("Resposta da IA não pôde ser interpretada") from exc

    return {"draft": draft}

async def post_validate_node(state: JobAiDraftState, config: RunnableConfig) -> dict[str, Any]:
    draft, warnings = post_validate(state["draft"], state["combined_text"])
    needs_review = compute_needs_review(draft)
    
    if any("discriminatório" in w for w in warnings):
        needs_review.append("safety_check")

    return {
        "draft": draft,
        "warnings": state.get("warnings", []) + warnings,
        "needs_review": needs_review
    }

async def refine_requirements_node(state: JobAiDraftState, config: RunnableConfig) -> dict[str, Any]:
    draft = refine_requirements(state["draft"])
    return {"draft": draft}

async def evaluate_quality_node(state: JobAiDraftState, config: RunnableConfig) -> dict[str, Any]:
    score, missing = evaluate_quality(state["draft"])
    
    # Prepend missing fields to warnings as simple strings
    warnings = state.get("warnings", [])
    for field in missing:
        warnings.append(f"missing_field: {field}")
        
    state["draft"].quality_score = score

    return {
        "draft": state["draft"],
        "warnings": warnings,
        "missing_fields": missing,
        "quality_score": score
    }

def build_job_ai_draft_graph() -> Any:
    workflow = StateGraph(JobAiDraftState)

    workflow.add_node("normalize_input", normalize_input_node)
    workflow.add_node("generate_draft", generate_draft_node)
    workflow.add_node("parse_draft", parse_draft_node)
    workflow.add_node("refine_requirements", refine_requirements_node)
    workflow.add_node("evaluate_quality", evaluate_quality_node)
    workflow.add_node("post_validate", post_validate_node)

    workflow.add_edge(START, "normalize_input")
    workflow.add_edge("normalize_input", "generate_draft")
    workflow.add_edge("generate_draft", "parse_draft")
    workflow.add_edge("parse_draft", "refine_requirements")
    workflow.add_edge("refine_requirements", "evaluate_quality")
    workflow.add_edge("evaluate_quality", "post_validate")
    workflow.add_edge("post_validate", END)

    return workflow.compile()
