"""Behavioral AI orchestration package.

Public surface:
- run_behavioral_evaluation  — main engine entry point
- BehavioralEngineResult     — structured engine output
- BehavioralEvaluationInput  — engine input contract
- BehavioralQAItem           — single Q/A data item
- BehavioralAIProviderResponseInvalidError
- classify_behavioral_provider_error
- classify_behavioral_unexpected_failure
- is_retryable_behavioral_error
- build_evaluation_prompt
- parse_evaluation_response
- contains_prohibited_language
"""
from src.ai_orchestration.behavioral.behavioral_contracts import (
    BehavioralEvaluationInput,
    BehavioralQAItem,
)
from src.ai_orchestration.behavioral.engine import (
    BehavioralEngineResult,
    run_behavioral_evaluation,
)
from src.ai_orchestration.behavioral.failure_classifier import (
    classify_provider_error as classify_behavioral_provider_error,
    classify_unexpected_failure as classify_behavioral_unexpected_failure,
    get_provider_status_code as get_behavioral_provider_status_code,
    get_retry_after_seconds as get_behavioral_retry_after_seconds,
    is_retryable_provider_error as is_retryable_behavioral_error,
)
from src.ai_orchestration.behavioral.prompt_builder import (
    SYSTEM_PROMPT as BEHAVIORAL_SYSTEM_PROMPT,
    build_evaluation_prompt,
)
from src.ai_orchestration.behavioral.response_parser import (
    BehavioralAIProviderResponseInvalidError,
    contains_prohibited_language,
    parse_evaluation_response,
)

__all__ = [
    "BehavioralEvaluationInput",
    "BehavioralQAItem",
    "BehavioralEngineResult",
    "run_behavioral_evaluation",
    "classify_behavioral_provider_error",
    "classify_behavioral_unexpected_failure",
    "get_behavioral_provider_status_code",
    "get_behavioral_retry_after_seconds",
    "is_retryable_behavioral_error",
    "BEHAVIORAL_SYSTEM_PROMPT",
    "build_evaluation_prompt",
    "BehavioralAIProviderResponseInvalidError",
    "contains_prohibited_language",
    "parse_evaluation_response",
]
