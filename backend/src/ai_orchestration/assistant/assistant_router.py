"""
AssistantRouter: Router determinístico read-only do assistente de IA.

Responsável por:
- Receber AssistantRequest com intent estruturada.
- Resolver a tool correspondente via IntentCatalog.
- Executar via ToolRuntime (sem chamar tools diretamente).
- Converter ToolResult → AssistantResponse.
- Bloquear intents desconhecidas com UNKNOWN_INTENT.
- Preservar error_code, requires_approval e warnings do ToolResult.

Não chama LLM. Não acessa banco. Não acessa repository.
Não executa tool fora do registry.
"""
from __future__ import annotations

from src.ai_orchestration.assistant.assistant_request import AssistantRequest
from src.ai_orchestration.assistant.assistant_response import AssistantResponse
from src.ai_orchestration.assistant.intent_catalog import DEFAULT_CATALOG, IntentCatalog
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_runtime import ToolRuntime


class AssistantRouter:
    """Router determinístico read-only do assistente de IA.

    Fluxo:
        AssistantRequest → IntentCatalog → tool_name → ToolRuntime → AssistantResponse

    Nunca chama LLM. Nunca chama tool diretamente. Sempre usa ToolRuntime.
    """

    def __init__(
        self,
        runtime: ToolRuntime,
        catalog: IntentCatalog | None = None,
    ) -> None:
        self._runtime = runtime
        self._catalog = catalog if catalog is not None else DEFAULT_CATALOG

    async def handle(
        self,
        request: AssistantRequest,
        execution_context: ToolExecutionContext,
    ) -> AssistantResponse:
        """Processa uma AssistantRequest e retorna AssistantResponse.

        Args:
            request: Intenção estruturada com arguments.
            execution_context: Contexto com AgentContext e services injetáveis.

        Returns:
            AssistantResponse — sempre retorna, nunca propaga exceção.
        """
        # 0. Garante que o contexto está em modo read-only
        if not execution_context.read_only:
            return AssistantResponse(
                ok=False,
                intent=request.intent,
                error_code="READ_ONLY_REQUIRED",
                message=(
                    "O AssistantRouter opera exclusivamente em modo read-only. "
                    "Defina read_only=True no ToolExecutionContext."
                ),
            )

        # 1. Resolve intent → tool_name
        tool_name = self._catalog.resolve(request.intent)
        if tool_name is None:
            return AssistantResponse.unknown_intent(request.intent)

        # 2. Executa via ToolRuntime (o runtime já captura todas as exceções)
        try:
            tool_result = await self._runtime.execute(
                tool_name=tool_name,
                args=request.arguments,
                execution_context=execution_context,
            )
        except Exception as exc:  # noqa: BLE001  — fallback extra de segurança
            return AssistantResponse.internal_error(
                intent=request.intent,
                tool_name=tool_name,
                detail=type(exc).__name__,
            )

        # 3. Converte ToolResult → AssistantResponse
        return AssistantResponse.from_tool_result(
            intent=request.intent,
            tool_name=tool_name,
            result=tool_result,
        )
