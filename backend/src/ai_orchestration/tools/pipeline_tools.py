"""
Pipeline Tools: Stubs de tools para o Pipeline Agent.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-2

Tools definidas (contratos em TOOL_CONTRACTS.md):
    - get_pipeline_status(context, job_id) → ToolResult
"""
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard

_REQUIRED_PERMISSION = "can_view_pipeline"

async def get_pipeline_status(context: AgentContext, job_id: str) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied
    return ToolResult.error("NOT_IMPLEMENTED", "get_pipeline_status ainda não implementado (AI-AGENT-2).")
