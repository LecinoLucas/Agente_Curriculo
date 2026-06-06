"""
Tool Runtime: Executor read-only de tools de IA.

Responsável por:
- Resolver tools no registry por nome.
- Validar flags read_only e requires_approval antes de executar.
- Verificar permissões via ToolPermissionGuard (AND — todas devem estar presentes).
- Injetar services por nome de parâmetro via inspect.signature.
- Executar a tool e retornar ToolResult.
- Capturar exceções internas e retornar INTERNAL_ERROR (sem stack trace).

Não chama LLM. Não cria side effects. Não acessa repository.
"""
from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any

from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_registry import ToolRegistry


class _MissingServiceError(Exception):
    """Raised internally when a required service is not in the execution context."""


class ToolRuntime:
    """Executor read-only de tools registradas.

    Em modo read_only (padrão True):
    - Tools com read_only=False → retorna TOOL_NOT_ALLOWED.
    - Tools com requires_approval=True → retorna REQUIRES_APPROVAL.
    - Tool desconhecida → retorna TOOL_NOT_FOUND.
    - Permissão ausente → retorna PERMISSION_DENIED.
    - Serviço obrigatório faltando → retorna INTERNAL_ERROR.
    - Exceção não tratada na tool → retorna INTERNAL_ERROR (sem stack trace).
    """

    def __init__(self, registry: ToolRegistry, *, read_only: bool = True) -> None:
        self._registry = registry
        self._read_only = read_only

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        execution_context: ToolExecutionContext,
    ) -> ToolResult:
        """Executa uma tool pelo nome com args e contexto de execução.

        Args:
            tool_name: Nome da tool (deve existir no registry).
            args: Argumentos fornecidos pelo caller (exclui context e services).
            execution_context: Contexto com AgentContext e services disponíveis.

        Returns:
            ToolResult — sempre retorna, nunca propaga exceção.
        """
        # 1. Resolve tool no registry
        tool_def = self._registry.get(tool_name)
        if tool_def is None:
            return ToolResult.error(
                "TOOL_NOT_FOUND",
                f"Tool '{tool_name}' não encontrada no registry.",
            )

        # 2. Bloqueia tools de escrita em modo read-only
        if self._read_only and not tool_def.read_only:
            return ToolResult.error(
                "TOOL_NOT_ALLOWED",
                f"Tool '{tool_name}' não é read-only. "
                "O runtime está em modo read-only e não pode executá-la.",
            )

        # 3. Bloqueia tools que exigem aprovação
        if tool_def.requires_approval:
            return ToolResult.error(
                "REQUIRES_APPROVAL",
                f"Tool '{tool_name}' requer aprovação humana e não pode ser "
                "executada automaticamente neste runtime.",
            )

        # 4. Verifica permissões (AND — todas as permissões devem estar presentes)
        agent_ctx = execution_context.agent_context
        for perm in tool_def.required_permissions:
            check = ToolPermissionGuard.check(agent_ctx, perm)
            if not check.allowed:
                return ToolResult.error(
                    "PERMISSION_DENIED",
                    f"Permissão '{perm}' ausente para executar a tool '{tool_name}'.",
                )

        # 5. Monta kwargs por inspeção de assinatura
        try:
            call_kwargs = _build_kwargs(tool_def.fn, args, execution_context)
        except _MissingServiceError as exc:
            return ToolResult.error("MISSING_SERVICE", str(exc))

        # 6. Executa a tool (captura qualquer exceção não tratada)
        try:
            return await tool_def.fn(**call_kwargs)
        except Exception as exc:  # noqa: BLE001
            return ToolResult.error(
                "INTERNAL_ERROR",
                f"Erro interno ao executar tool '{tool_name}': {type(exc).__name__}",
            )


def _build_kwargs(
    fn: Callable,
    args: dict[str, Any],
    execution_context: ToolExecutionContext,
) -> dict[str, Any]:
    """Constrói o dict de kwargs para a chamada da tool por inspeção de assinatura.

    Regras de resolução (em ordem de prioridade):
    1. Parâmetro 'context' → execution_context.agent_context
    2. Parâmetro em args → valor de args
    3. Parâmetro em execution_context.services → service injetado
    4. Parâmetro com default → omite (função usa o default)
    5. Parâmetro obrigatório sem fonte → levanta _MissingServiceError

    Raises:
        _MissingServiceError: Se parâmetro obrigatório não tiver fonte disponível.
    """
    sig = inspect.signature(fn)
    call_kwargs: dict[str, Any] = {}

    for param_name, param in sig.parameters.items():
        if param_name == "context":
            call_kwargs["context"] = execution_context.agent_context
        elif param_name in args:
            call_kwargs[param_name] = args[param_name]
        elif param_name in execution_context.services:
            call_kwargs[param_name] = execution_context.services[param_name]
        elif param.default is not inspect.Parameter.empty:
            # Parâmetro opcional com default — omite, função usa o valor padrão
            pass
        else:
            raise _MissingServiceError(
                f"Parâmetro obrigatório '{param_name}' não disponível "
                "em args nem em services do contexto de execução."
            )

    return call_kwargs
