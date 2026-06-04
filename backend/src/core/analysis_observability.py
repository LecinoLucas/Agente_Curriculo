from __future__ import annotations

import inspect
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.ai_sensitive_guardrails import contains_sensitive_text, redact_sensitive_text
from src.core.log_sanitizer import sanitize_log_text
from src.infrastructure.database.models.audit_model import AuditLogModel

_MAX_METADATA_STRING_CHARS = 500


def sanitize_observability_metadata(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        sanitized = sanitize_log_text(redact_sensitive_text(value)) or ""
        if len(sanitized) > _MAX_METADATA_STRING_CHARS:
            return sanitized[:_MAX_METADATA_STRING_CHARS]
        return sanitized
    if isinstance(value, Mapping):
        return {
            str(key): sanitize_observability_metadata(item)
            for key, item in value.items()
            if item is not None
        }
    if isinstance(value, tuple):
        return tuple(sanitize_observability_metadata(item) for item in value)
    if isinstance(value, Sequence) and not isinstance(value, bytes | bytearray):
        return [sanitize_observability_metadata(item) for item in value]
    return sanitize_observability_metadata(str(value))


def metadata_contains_sensitive_value(metadata: Mapping[str, Any] | None) -> bool:
    if not metadata:
        return False
    return contains_sensitive_text(metadata)


async def record_analysis_audit_event(
    session: AsyncSession,
    *,
    action: str,
    resource_id: UUID,
    user_id: UUID | None = None,
    resource_type: str = "analysis",
    metadata: dict[str, Any] | None = None,
) -> AuditLogModel:
    event = AuditLogModel(
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        user_id=user_id,
        metadata_=sanitize_observability_metadata(metadata or {}),
    )
    maybe_awaitable = session.add(event)
    if inspect.isawaitable(maybe_awaitable):
        await maybe_awaitable
    await session.flush()
    return event
