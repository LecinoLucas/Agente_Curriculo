"""
Erros de domínio para a camada de AI Orchestration.

Todos os erros desta camada herdam de AiOrchestrationError.
Nenhum desses erros deve vazar detalhes de implementação ao usuário final.
"""


class AiOrchestrationError(Exception):
    """Base para todos os erros de AI Orchestration."""
    error_code: str = "AI_ORCHESTRATION_ERROR"


class AgentPermissionError(AiOrchestrationError):
    """Agente tentou executar ação sem permissão suficiente."""
    error_code = "PERMISSION_DENIED"


class AgentContextError(AiOrchestrationError):
    """AgentContext inválido ou ausente."""
    error_code = "INVALID_CONTEXT"


class ToolNotFoundError(AiOrchestrationError):
    """Tool solicitada não existe ou não está registrada."""
    error_code = "TOOL_NOT_FOUND"


class ToolExecutionError(AiOrchestrationError):
    """Falha durante execução de uma tool."""
    error_code = "TOOL_EXECUTION_ERROR"


class ApprovalRequiredError(AiOrchestrationError):
    """
    Ação bloqueada porque requer aprovação humana.
    
    Não é um erro de sistema — é um gate de segurança intencional.
    O caller deve tratar este erro retornando um ToolResult com requires_approval=True.
    """
    error_code = "APPROVAL_REQUIRED"

    def __init__(self, action: str, reason: str) -> None:
        self.action = action
        self.reason = reason
        super().__init__(f"Ação '{action}' requer aprovação humana: {reason}")


class RagRetrievalError(AiOrchestrationError):
    """Falha no processo de recuperação de documentos RAG."""
    error_code = "RAG_RETRIEVAL_ERROR"


class RagInsufficientSourcesError(AiOrchestrationError):
    """
    Não foram encontradas fontes suficientes para responder a query RAG.
    
    O sistema não deve responder sem evidências na base de conhecimento.
    """
    error_code = "RAG_INSUFFICIENT_SOURCES"
