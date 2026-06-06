"""
ToolResult e AgentResult: Contratos de resultado para tools e agentes.

Tools sempre retornam ToolResult.
Agentes agregam resultados em AgentResult.
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolResult:
    """
    Resultado padronizado de uma Tool.

    Campos:
        ok: True se a tool executou com sucesso.
        data: Dado retornado pela tool (dict, list, etc.). None em caso de erro.
        error_code: Código de erro legível. Ex: "PERMISSION_DENIED", "NOT_FOUND".
        message: Mensagem amigável (exibível ao usuário ou agente).
        requires_approval: True se a ação precisa de confirmação humana antes de prosseguir.
        approval_reason: Motivo pelo qual a aprovação é necessária.
    """
    ok: bool
    data: dict[str, Any] | list[Any] | None = None
    error_code: str | None = None
    message: str | None = None
    requires_approval: bool = False
    approval_reason: str | None = None

    @classmethod
    def success(cls, data: dict[str, Any] | list[Any] | None = None, message: str | None = None) -> "ToolResult":
        """Cria um ToolResult de sucesso."""
        return cls(ok=True, data=data, message=message)

    @classmethod
    def error(cls, error_code: str, message: str) -> "ToolResult":
        """Cria um ToolResult de erro."""
        return cls(ok=False, error_code=error_code, message=message)

    @classmethod
    def pending_approval(cls, action: str, reason: str, context: dict[str, Any] | None = None) -> "ToolResult":
        """Cria um ToolResult sinalizando que aprovação humana é necessária."""
        return cls(
            ok=True,
            data={"action": action, "context": context or {}},
            requires_approval=True,
            approval_reason=reason,
            message=f"Ação '{action}' requer aprovação humana: {reason}",
        )


@dataclass
class AgentResult:
    """
    Resultado agregado de um agente especializado.

    Campos:
        response: Resposta textual final para o usuário ou supervisor.
        tool_results: Lista de resultados de tools invocadas durante a execução.
        requires_approval: True se qualquer tool sinalizou necessidade de aprovação.
        approval_actions: Lista de ações pendentes de aprovação.
        handoff_to: Nome do próximo agente, se houver delegação de execução.
        metadata: Metadados extras (duração, tokens, etc.).
    """
    response: str
    tool_results: list[ToolResult] = field(default_factory=list)
    requires_approval: bool = False
    approval_actions: list[str] = field(default_factory=list)
    handoff_to: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
