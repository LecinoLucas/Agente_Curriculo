from __future__ import annotations

from contextvars import ContextVar
from uuid import UUID

import structlog

_correlation_id_ctx: ContextVar[str | None] = ContextVar(
    "correlation_id",
    default=None,
)


def set_correlation_id(correlation_id: UUID | str | None) -> None:
    """
    Define o correlation_id atual.

    Importante:
    - altera apenas o correlation_id
    - não limpa outros contextos do structlog
    """
    value = str(correlation_id) if correlation_id is not None else None

    _correlation_id_ctx.set(value)

    if value:
        structlog.contextvars.bind_contextvars(correlation_id=value)
    else:
        structlog.contextvars.unbind_contextvars("correlation_id")


def get_correlation_id() -> str | None:
    """
    Retorna o correlation_id atual.
    """
    return _correlation_id_ctx.get()


def clear_correlation_id() -> None:
    """
    Remove apenas o correlation_id do contexto atual.
    """
    _correlation_id_ctx.set(None)
    try:
        structlog.contextvars.unbind_contextvars("correlation_id")
    except Exception:
        # Contexto já limpo ou não inicializado para este request.
        # Nunca deve quebrar o fluxo de resposta.
        pass
