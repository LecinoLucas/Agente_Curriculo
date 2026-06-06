"""
Tool Contracts: Utilitários e tools transversais do AI Orchestration.

Inclui a tool de aprovação humana, que pode ser invocada por qualquer agente.
"""
from typing import Any

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult


async def request_human_approval(
    context: AgentContext,
    action: str,
    reason: str,
    action_context: dict[str, Any] | None = None,
) -> ToolResult:
    """
    Sinaliza que uma ação requer aprovação humana antes de prosseguir.
    
    Esta tool não executa a ação, apenas retorna um ToolResult formatado
    para interromper o agente e notificar o usuário.

    Args:
        context: Contexto com permissões do usuário.
        action: Nome ou descrição curta da ação pendente.
        reason: Justificativa de por que a aprovação é necessária.
        action_context: Dados adicionais necessários para executar a ação futura.

    Returns:
        ToolResult configurado com requires_approval=True.
    """
    # Qualquer usuário autenticado pode solicitar aprovação para si mesmo ou superiores
    if not context.user_id:
        return ToolResult.error("UNAUTHORIZED", "Usuário não autenticado.")
        
    return ToolResult.pending_approval(
        action=action,
        reason=reason,
        context=action_context,
    )
