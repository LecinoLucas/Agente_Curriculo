"""
PermissionGuard: Validação de permissões para tools e agentes.

Garante que nenhuma tool é executada sem o contexto correto.
Regra fundamental: agentes nunca têm permissões maiores que o usuário que os invocou.
"""
from dataclasses import dataclass

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult


@dataclass(frozen=True)
class GuardResult:
    """
    Resultado da verificação de permissão.

    Campos:
        allowed: True se o contexto possui a permissão necessária.
        reason: Explicação em caso de negação.
    """
    allowed: bool
    reason: str | None = None


class ToolPermissionGuard:
    """
    Guarda de permissões para tools.

    Uso:
        result = ToolPermissionGuard.check(context, "can_view_jobs")
        if not result.allowed:
            return ToolResult.error("PERMISSION_DENIED", result.reason)
    """

    @staticmethod
    def check(context: AgentContext, required_permission: str) -> GuardResult:
        """
        Verifica se o AgentContext possui a permissão requerida.

        Args:
            context: Contexto de execução do agente.
            required_permission: Permissão necessária para executar a tool.

        Returns:
            GuardResult com allowed=True se a permissão está presente.
        """
        if context.actor_type == "candidate" and not required_permission.startswith("candidate_"):
            return GuardResult(
                allowed=False,
                reason=(
                    "Contexto de candidato só pode executar tools com permissões "
                    f"candidate_* seguras. Permissão solicitada: '{required_permission}'. "
                    f"Canal: {context.channel or 'unknown'}."
                ),
            )

        if context.has_permission(required_permission):
            return GuardResult(allowed=True)
        return GuardResult(
            allowed=False,
            reason=(
                f"Permissão '{required_permission}' não encontrada para o role '{context.role}'. "
                f"Usuário: {context.user_id}."
            ),
        )

    @staticmethod
    def check_any(context: AgentContext, required_permissions: list[str]) -> GuardResult:
        """
        Verifica se o AgentContext possui pelo menos uma das permissões.

        Args:
            context: Contexto de execução do agente.
            required_permissions: Lista de permissões alternativas.

        Returns:
            GuardResult com allowed=True se ao menos uma permissão está presente.
        """
        if context.has_any_permission(required_permissions):
            return GuardResult(allowed=True)
        perms_str = ", ".join(f"'{p}'" for p in required_permissions)
        return GuardResult(
            allowed=False,
            reason=(
                f"Nenhuma das permissões [{perms_str}] encontrada para o role '{context.role}'. "
                f"Usuário: {context.user_id}."
            ),
        )

    @staticmethod
    def enforce(context: AgentContext, required_permission: str) -> ToolResult | None:
        """
        Atalho conveniente: retorna um ToolResult de erro se a permissão estiver ausente.
        Retorna None se permitido (o caller decide continuar).

        Uso:
            if denied := ToolPermissionGuard.enforce(context, "can_view_jobs"):
                return denied
            # ... lógica da tool
        """
        result = ToolPermissionGuard.check(context, required_permission)
        if not result.allowed:
            return ToolResult.error("PERMISSION_DENIED", result.reason or "Permissão negada.")
        return None
