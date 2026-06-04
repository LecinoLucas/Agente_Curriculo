from typing import Any

from src.core.ai_sensitive_guardrails import (
    redact_sensitive_payload,
    redact_sensitive_text,
)


def redact_ai_response_text(value: str | None) -> str | None:
    """Return a DB-safe version of AI text without common PII/sensitive tokens."""
    return redact_sensitive_text(value)


def redact_ai_response_payload(value: Any) -> Any:
    """Redact AI response payloads while preserving structure for dict/list inputs."""
    return redact_sensitive_payload(value)
