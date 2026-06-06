"""
Admission Tools: Stubs de tools para o Admission Agent.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-AGENT-3
"""
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard

_REQUIRED_PERMISSION = "can_view_admissions"

async def get_admission_case(context: AgentContext, candidate_id: str) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied
    return ToolResult.error("NOT_IMPLEMENTED", "get_admission_case ainda não implementado (AI-AGENT-3).")

async def get_pre_admission_documents(context: AgentContext, admission_id: str) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied
    return ToolResult.error("NOT_IMPLEMENTED", "get_pre_admission_documents ainda não implementado (AI-AGENT-3).")
