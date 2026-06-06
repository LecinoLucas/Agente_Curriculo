"""
AgentContext: Contexto de execução de um agente ou tool.

Carrega a identidade e permissões do usuário que iniciou a sessão.
Agentes nunca têm permissões maiores que o usuário que os invocou.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class AgentContext:
    """
    Contexto imutável de execução de um agente ou tool.

    Gerado pelo Application Service no início de cada requisição e
    passado para o graph via LangGraph RunnableConfig["configurable"].

    Campos:
        user_id: UUID do usuário autenticado que iniciou a sessão.
        role: Role principal do usuário (recruiter, hr_manager, admin, etc.).
        permissions: Lista de permissões granulares do usuário.
        request_id: UUID único da requisição HTTP ou tarefa assíncrona.
        session_id: UUID da sessão do assistente (pode abranger múltiplas mensagens).
        tenant_id: ID do tenant/empresa, quando aplicável em ambientes multi-tenant.
        source: Origem da execução — "assistant" | "graph" | "api" | "worker".
    """
    user_id: str
    role: str
    permissions: list[str]
    request_id: str
    session_id: str
    tenant_id: str | None = None
    source: str = "assistant"

    def has_permission(self, permission: str) -> bool:
        """Verifica se este contexto possui uma permissão específica."""
        return permission in self.permissions

    def has_any_permission(self, permissions: list[str]) -> bool:
        """Verifica se este contexto possui pelo menos uma das permissões."""
        return any(p in self.permissions for p in permissions)

    def has_all_permissions(self, permissions: list[str]) -> bool:
        """Verifica se este contexto possui todas as permissões listadas."""
        return all(p in self.permissions for p in permissions)
