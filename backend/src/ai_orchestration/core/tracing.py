"""
Contratos de tracing e observabilidade para AI Orchestration.

Toda execução de graph, agente ou tool deve emitir um evento de tracing
via structlog, com os campos padronizados definidos aqui.
"""
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Generator

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class TraceEvent:
    """
    Evento de tracing emitido por agentes e tools.

    Campos obrigatórios:
        request_id: UUID da requisição de origem.
        session_id: UUID da sessão do assistente.
        user_id: UUID do usuário.
        agent: Nome do agente executando.
        tool: Nome da tool chamada (vazio se não for uma tool).
        ok: Se a execução foi bem-sucedida.

    Campos opcionais:
        duration_ms: Duração em milissegundos.
        error_code: Código de erro, se houver.
        requires_approval: Se a ação requer aprovação humana.
        rag_sources_count: Quantidade de fontes RAG utilizadas.
        handoff_to: Nome do agente para qual foi feito handoff.
        metadata: Metadados extras para debugging.
    """
    request_id: str
    session_id: str
    user_id: str
    agent: str
    tool: str = ""
    ok: bool = True
    duration_ms: int = 0
    error_code: str | None = None
    requires_approval: bool = False
    rag_sources_count: int = 0
    handoff_to: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def emit(self) -> None:
        """Emite o evento via structlog."""
        log_fn = logger.info if self.ok else logger.warning
        log_fn(
            "ai_orchestration.trace",
            request_id=self.request_id,
            session_id=self.session_id,
            user_id=self.user_id,
            agent=self.agent,
            tool=self.tool or None,
            ok=self.ok,
            duration_ms=self.duration_ms,
            error_code=self.error_code,
            requires_approval=self.requires_approval,
            rag_sources_count=self.rag_sources_count,
            handoff_to=self.handoff_to,
            **self.metadata,
        )


@contextmanager
def trace_tool(
    request_id: str,
    session_id: str,
    user_id: str,
    agent: str,
    tool: str,
    extra: dict[str, Any] | None = None,
) -> Generator[TraceEvent, None, None]:
    """
    Context manager para instrumentar a execução de uma tool.

    Uso:
        with trace_tool(ctx.request_id, ctx.session_id, ctx.user_id, "job_agent", "get_job_summary") as trace:
            result = await some_service.get_job(job_id)
            trace.ok = True
    """
    event = TraceEvent(
        request_id=request_id,
        session_id=session_id,
        user_id=user_id,
        agent=agent,
        tool=tool,
        metadata=extra or {},
    )
    t0 = time.monotonic()
    try:
        yield event
    except Exception as exc:
        event.ok = False
        event.error_code = type(exc).__name__
        raise
    finally:
        event.duration_ms = int((time.monotonic() - t0) * 1000)
        event.emit()
