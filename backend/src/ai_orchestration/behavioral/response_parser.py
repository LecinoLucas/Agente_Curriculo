"""Behavioral AI response parsing and prohibited-language checking.

Extracted from BehavioralAIEvaluationService._parse_evaluation_response
and _contains_prohibited_language.
"""
from __future__ import annotations

import json

import structlog

logger = structlog.get_logger(__name__)

# Clinical/diagnostic terms that must never appear in a behavioral AI response.
# Removing terms from this set relaxes the guardrail — do not do so without a review.
PROHIBITED_TERMS: frozenset[str] = frozenset({
    "ansioso",
    "ansiedade",
    "instável",
    "depressivo",
    "depressão",
    "narcisista",
    "narcisismo",
    "dominante",
    "perfil psicológico",
    "diagnóstico",
    "transtorno",
    "distúrbio",
    "psicopatia",
    "psicose",
})

_REQUIRED_RESPONSE_KEYS = ("confidence", "summary", "competency_signals")
_VALID_CONFIDENCE_VALUES = frozenset({"low", "medium", "high"})


class BehavioralAIProviderResponseInvalidError(ValueError):
    """Raised when the provider response cannot be safely used."""


def contains_prohibited_language(text: str) -> bool:
    """Return True if text contains any clinical/diagnostic prohibited term."""
    text_lower = text.lower()
    for term in PROHIBITED_TERMS:
        if term in text_lower:
            logger.warning("behavioral_ai.prohibited_term_detected", term=term)
            return True
    return False


def parse_evaluation_response(response_text: str) -> dict:
    """Parse and validate a behavioral AI response.

    Raises:
        BehavioralAIProviderResponseInvalidError: on JSON parse failure or
            missing/invalid required fields.
    """
    try:
        json_str = response_text
        if "```json" in response_text:
            json_str = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            json_str = response_text.split("```")[1].split("```")[0]

        data = json.loads(json_str.strip())

    except json.JSONDecodeError as exc:
        raise BehavioralAIProviderResponseInvalidError(
            "Invalid JSON in behavioral AI response"
        ) from exc

    confidence = data.get("confidence")
    if not isinstance(confidence, str) or confidence not in _VALID_CONFIDENCE_VALUES:
        raise BehavioralAIProviderResponseInvalidError(
            f"Invalid confidence level: {confidence!r}"
        )

    if not isinstance(data.get("summary"), str):
        raise BehavioralAIProviderResponseInvalidError("summary field is required")

    if not isinstance(data.get("competency_signals"), list):
        raise BehavioralAIProviderResponseInvalidError(
            "competency_signals must be a list"
        )

    return data
