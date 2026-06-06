"""
Knowledge Tools: Stubs de tools para o Knowledge Agent.

STATUS: STUB — AI-ARCH-1
Implementação real: AI-RAG-1 / AI-AGENT-1
"""
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard

_REQUIRED_PERMISSION = "can_use_assistant"

async def search_knowledge(
    context: AgentContext, query: str, source_types: list[str] | None = None, limit: int = 5
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied
    return ToolResult.error("NOT_IMPLEMENTED", "search_knowledge ainda não implementado (AI-RAG-1).")
