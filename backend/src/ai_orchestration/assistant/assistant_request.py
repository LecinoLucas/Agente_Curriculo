"""
AssistantRequest: Solicitação estruturada para o Assistant Router.

Representa uma intenção explícita com argumentos, sem texto livre.
Nenhum NLP, LLM ou parsing semântico nesta camada.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AssistantRequest:
    """Solicitação estruturada para o Assistant Router.

    Attributes:
        intent: Intenção explícita no formato "dominio.acao" (ex: "job.summary").
            Deve corresponder a uma entrada do IntentCatalog.
        arguments: Argumentos da tool a ser executada (ex: {"job_id": "uuid-..."}).
        message: Mensagem textual opcional do usuário (para logging/rastreio).
        request_id: ID único da requisição para rastreabilidade.
        session_id: ID da sessão do assistente para contexto multi-turno.
    """

    intent: str
    arguments: dict[str, Any] = field(default_factory=dict)
    message: str | None = None
    request_id: str | None = None
    session_id: str | None = None
