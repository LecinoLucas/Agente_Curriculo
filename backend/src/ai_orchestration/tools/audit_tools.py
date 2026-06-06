"""
Audit Tools: Stubs de tools para o Audit Agent.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-3
"""
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard

_REQUIRED_PERMISSION = "can_view_audit_logs"

async def get_audit_context(context: AgentContext, entity_type: str, entity_id: str, limit: int = 20) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied
    return ToolResult.error("NOT_IMPLEMENTED", "get_audit_context ainda não implementado (AI-AGENT-3).")
