"""Behavioral AI evaluation engine.

Responsibilities (only):
- Receive a fully-assembled BehavioralEvaluationInput
- Build the prompt
- Call the injected AI service
- Check for prohibited language
- Parse and validate the response
- Return BehavioralEngineResult

NOT responsible for:
- Celery tasks or retries
- Database reads/writes
- Usage logging
- Session management
- Frontend or bot coupling
- Accessing other candidates' data
"""
from __future__ import annotations

from dataclasses import dataclass

from src.ai_orchestration.behavioral.behavioral_contracts import BehavioralEvaluationInput
from src.ai_orchestration.behavioral.prompt_builder import SYSTEM_PROMPT, build_evaluation_prompt
from src.ai_orchestration.behavioral.response_parser import (
    BehavioralAIProviderResponseInvalidError,
    contains_prohibited_language,
    parse_evaluation_response,
)


@dataclass(slots=True)
class BehavioralEngineResult:
    """Structured result from a behavioral evaluation run."""
    data: dict
    input_tokens: int
    output_tokens: int
    processing_time_ms: int
    finish_reason: str | None


async def run_behavioral_evaluation(
    *,
    evaluation_input: BehavioralEvaluationInput,
    ai_service,
) -> BehavioralEngineResult:
    """Run a complete behavioral evaluation AI pipeline.

    Args:
        evaluation_input: Pre-assembled competencies and QA items (no PII).
        ai_service: An object with ``analyze(AIAnalysisRequest) -> AIAnalysisResponse``.

    Returns:
        BehavioralEngineResult carrying parsed data + provider metadata.

    Raises:
        BehavioralAIProviderResponseInvalidError: on prohibited language or invalid JSON.
        Any provider exception (AIProviderRateLimitedError, httpx.*, etc.) is propagated
        unchanged so the caller can classify and handle retries.
    """
    from src.application.ports.ai_service import AIAnalysisRequest  # lazy: avoids circular

    prompt_text = build_evaluation_prompt(evaluation_input)

    ai_request = AIAnalysisRequest(
        resume_text="",
        prompt_template=prompt_text,
        system_prompt=SYSTEM_PROMPT,
        max_tokens=2000,
        temperature=0.7,
        job_description=None,
    )

    ai_response = await ai_service.analyze(ai_request)
    response_text = ai_response.content

    if contains_prohibited_language(response_text):
        raise BehavioralAIProviderResponseInvalidError("provider_response_invalid")

    data = parse_evaluation_response(response_text)

    return BehavioralEngineResult(
        data=data,
        input_tokens=ai_response.input_tokens,
        output_tokens=ai_response.output_tokens,
        processing_time_ms=ai_response.processing_time_ms,
        finish_reason=getattr(ai_response, "finish_reason", None),
    )
