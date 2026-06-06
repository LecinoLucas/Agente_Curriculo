"""
Protheus Tools: Stubs de tools para o Protheus Agent.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-4
"""
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard

_REQUIRED_PERMISSION = "can_view_protheus_status"

async def get_protheus_export_status(context: AgentContext, admission_id: str) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied
    return ToolResult.error("NOT_IMPLEMENTED", "get_protheus_export_status ainda não implementado (AI-AGENT-4).")
