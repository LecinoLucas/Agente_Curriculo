"""
AssistantResponse: Resposta estruturada do Assistant Router.

Converte ToolResult em um contrato de resposta padronizado,
preservando ok, data, error_code, message, requires_approval e warnings.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.ai_orchestration.core.agent_result import ToolResult


@dataclass
class AssistantResponse:
    """Resposta estruturada do Assistant Router.

    Attributes:
        ok: True se a intent foi executada com sucesso.
        intent: Intent original da requisição.
        tool_name: Nome da tool executada (None se intent desconhecida).
        data: Dados retornados pela tool. None em caso de erro.
        error_code: Código de erro controlado (ex: "UNKNOWN_INTENT", "NOT_FOUND").
        message: Mensagem amigável para logging ou exibição.
        requires_approval: True se a tool sinalizou necessidade de aprovação humana.
        warnings: Lista de avisos não-fatais gerados durante o processamento.
    """

    ok: bool
    intent: str
    tool_name: str | None = None
    data: dict[str, Any] | list[Any] | None = None
    error_code: str | None = None
    message: str | None = None
    requires_approval: bool = False
    warnings: list[str] = field(default_factory=list)

    @classmethod
    def from_tool_result(
        cls,
        intent: str,
        tool_name: str,
        result: ToolResult,
        warnings: list[str] | None = None,
    ) -> "AssistantResponse":
        """Constrói uma AssistantResponse a partir de um ToolResult."""
        return cls(
            ok=result.ok,
            intent=intent,
            tool_name=tool_name,
            data=result.data,
            error_code=result.error_code,
            message=result.message,
            requires_approval=result.requires_approval,
            warnings=warnings or [],
        )

    @classmethod
    def unknown_intent(cls, intent: str) -> "AssistantResponse":
        """Retorna resposta de erro para intent não reconhecida."""
        return cls(
            ok=False,
            intent=intent,
            tool_name=None,
            error_code="UNKNOWN_INTENT",
            message=(
                f"Intent '{intent}' não reconhecida. "
                "Use IntentCatalog.list_intents() para ver as intents disponíveis."
            ),
        )

    @classmethod
    def internal_error(cls, intent: str, tool_name: str | None, detail: str) -> "AssistantResponse":
        """Retorna resposta de erro interno (usado como fallback de segurança no router)."""
        return cls(
            ok=False,
            intent=intent,
            tool_name=tool_name,
            error_code="INTERNAL_ERROR",
            message=f"Erro interno no router: {detail}",
        )
