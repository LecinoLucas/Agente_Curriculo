from __future__ import annotations

from contextvars import ContextVar
from uuid import UUID

import structlog

_correlation_id_ctx: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def set_correlation_id(correlation_id: UUID | str | None) -> None:
    value = str(correlation_id) if correlation_id is not None else None
    _correlation_id_ctx.set(value)
    if value:
        structlog.contextvars.bind_contextvars(correlation_id=value)


def get_correlation_id() -> str | None:
    return _correlation_id_ctx.get()


def clear_correlation_id() -> None:
    _correlation_id_ctx.set(None)
