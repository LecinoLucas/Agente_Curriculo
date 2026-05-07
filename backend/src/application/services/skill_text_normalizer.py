"""Compatibility wrapper around the centralized skill normalizer service."""

from src.application.services.skill_normalizer_service import (
    contains_whole_phrase,
    normalize_skill_name,
    normalize_skill_text,
    normalize_skill_token,
    skill_tokens,
)

__all__ = [
    "contains_whole_phrase",
    "normalize_skill_name",
    "normalize_skill_text",
    "normalize_skill_token",
    "skill_tokens",
]
