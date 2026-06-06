"""Unit tests — AI Assistant Router (Fase AI-ASSISTANT-1).

Cobre AssistantRequest, AssistantResponse, IntentCatalog e AssistantRouter.
Nenhum banco, LLM, endpoint ou migration é criado aqui.
ToolRuntime é sempre mockado para isolar o router.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from src.ai_orchestration.assistant.assistant_request import AssistantRequest
from src.ai_orchestration.assistant.assistant_response import AssistantResponse
from src.ai_orchestration.assistant.assistant_router import AssistantRouter
from src.ai_orchestration.assistant.intent_catalog import (
    DEFAULT_CATALOG,
    INTENT_TO_TOOL,
    IntentCatalog,
)
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_registry import ToolRegistry
from src.ai_orchestration.core.tool_runtime import ToolRuntime
from src.ai_orchestration.tools.registry import DEFAULT_REGISTRY


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ctx(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id="user-test",
        role="recruiter",
        permissions=permissions if permissions is not None else [
            "can_view_jobs", "can_view_candidates", "can_view_pipeline",
            "can_view_admissions", "can_view_protheus_status",
        ],
        request_id="req-test",
        session_id="sess-test",
    )


def _exec_ctx(permissions: list[str] | None = None) -> ToolExecutionContext:
    return ToolExecutionContext(
        agent_context=_ctx(permissions),
        services={},
        read_only=True,
    )


class _MockRuntime:
    """Mock controlado do ToolRuntime para isolar o router nos testes."""

    def __init__(self, return_value: ToolResult | None = None) -> None:
        self._return_value = return_value or ToolResult.success(data={"mocked": True})
        self.calls: list[dict[str, Any]] = []

    async def execute(
        self,
        tool_name: str,
        args: dict[str, Any],
        execution_context: ToolExecutionContext,
    ) -> ToolResult:
        self.calls.append({
            "tool_name": tool_name,
            "args": args,
            "execution_context": execution_context,
        })
        return self._return_value


def _router(return_value: ToolResult | None = None, catalog: IntentCatalog | None = None) -> tuple[AssistantRouter, _MockRuntime]:
    mock_rt = _MockRuntime(return_value)
    router = AssistantRouter(runtime=mock_rt, catalog=catalog)  # type: ignore[arg-type]
    return router, mock_rt


# ── AssistantRequest ──────────────────────────────────────────────────────────


class TestAssistantRequest:
    def test_has_intent_field(self) -> None:
        req = AssistantRequest(intent="job.summary")
        assert req.intent == "job.summary"

    def test_arguments_defaults_to_empty_dict(self) -> None:
        req = AssistantRequest(intent="job.summary")
        assert req.arguments == {}

    def test_accepts_arguments(self) -> None:
        req = AssistantRequest(intent="job.summary", arguments={"job_id": "abc"})
        assert req.arguments["job_id"] == "abc"

    def test_message_is_optional(self) -> None:
        req = AssistantRequest(intent="job.summary")
        assert req.message is None

    def test_request_id_is_optional(self) -> None:
        req = AssistantRequest(intent="job.summary")
        assert req.request_id is None

    def test_session_id_is_optional(self) -> None:
        req = AssistantRequest(intent="job.summary")
        assert req.session_id is None

    def test_has_no_tool_name_field(self) -> None:
        """Router não deve aceitar tool_name direto — apenas intent."""
        req = AssistantRequest(intent="job.summary")
        assert not hasattr(req, "tool_name"), (
            "AssistantRequest não deve ter campo 'tool_name' — routing é por intent"
        )


# ── AssistantResponse ─────────────────────────────────────────────────────────


class TestAssistantResponse:
    def test_from_tool_result_success_propagates_ok_true(self) -> None:
        result = ToolResult.success(data={"id": "abc"})
        resp = AssistantResponse.from_tool_result("job.summary", "get_job_summary", result)
        assert resp.ok is True
        assert resp.data == {"id": "abc"}

    def test_from_tool_result_error_propagates_ok_false(self) -> None:
        result = ToolResult.error("NOT_FOUND", "Vaga não encontrada.")
        resp = AssistantResponse.from_tool_result("job.summary", "get_job_summary", result)
        assert resp.ok is False
        assert resp.error_code == "NOT_FOUND"

    def test_from_tool_result_preserves_error_code(self) -> None:
        result = ToolResult.error("PERMISSION_DENIED", "Sem permissão.")
        resp = AssistantResponse.from_tool_result("job.summary", "get_job_summary", result)
        assert resp.error_code == "PERMISSION_DENIED"

    def test_from_tool_result_propagates_requires_approval(self) -> None:
        result = ToolResult.pending_approval("send_offer", "Aprovação necessária.")
        resp = AssistantResponse.from_tool_result("job.offer", "send_offer_tool", result)
        assert resp.requires_approval is True

    def test_from_tool_result_propagates_message(self) -> None:
        result = ToolResult.error("NOT_FOUND", "Candidato não encontrado.")
        resp = AssistantResponse.from_tool_result("candidate.summary", "get_candidate_summary", result)
        assert resp.message == "Candidato não encontrado."

    def test_from_tool_result_propagates_intent_and_tool_name(self) -> None:
        result = ToolResult.success(data={})
        resp = AssistantResponse.from_tool_result("pipeline.overview", "get_job_pipeline_overview", result)
        assert resp.intent == "pipeline.overview"
        assert resp.tool_name == "get_job_pipeline_overview"

    def test_from_tool_result_warnings_default_empty(self) -> None:
        result = ToolResult.success(data={})
        resp = AssistantResponse.from_tool_result("job.summary", "get_job_summary", result)
        assert resp.warnings == []

    def test_from_tool_result_accepts_warnings(self) -> None:
        result = ToolResult.success(data={})
        resp = AssistantResponse.from_tool_result(
            "job.summary", "get_job_summary", result, warnings=["Dado parcialmente disponível."]
        )
        assert len(resp.warnings) == 1
        assert resp.warnings[0] == "Dado parcialmente disponível."

    def test_unknown_intent_factory_sets_error_code(self) -> None:
        resp = AssistantResponse.unknown_intent("gibberish.intent")
        assert resp.ok is False
        assert resp.error_code == "UNKNOWN_INTENT"

    def test_unknown_intent_factory_preserves_intent(self) -> None:
        resp = AssistantResponse.unknown_intent("unknown.xyz")
        assert resp.intent == "unknown.xyz"
        assert resp.tool_name is None

    def test_unknown_intent_message_contains_intent_name(self) -> None:
        resp = AssistantResponse.unknown_intent("job.typo")
        assert "job.typo" in (resp.message or "")


# ── IntentCatalog ─────────────────────────────────────────────────────────────


class TestIntentCatalog:
    def test_known_intent_resolves_to_tool_name(self) -> None:
        catalog = IntentCatalog({"job.summary": "get_job_summary"})
        assert catalog.resolve("job.summary") == "get_job_summary"

    def test_unknown_intent_resolves_to_none(self) -> None:
        catalog = IntentCatalog({"job.summary": "get_job_summary"})
        assert catalog.resolve("ghost.intent") is None

    def test_all_intents_map_to_non_empty_tool_names(self) -> None:
        for intent, tool_name in INTENT_TO_TOOL.items():
            assert tool_name, f"Intent '{intent}' mapeia para tool_name vazio"

    def test_list_intents_returns_all_keys(self) -> None:
        catalog = IntentCatalog({"a.b": "tool_a", "c.d": "tool_c"})
        assert set(catalog.list_intents()) == {"a.b", "c.d"}

    def test_list_domains_extracts_unique_prefixes(self) -> None:
        catalog = IntentCatalog({"job.summary": "t1", "job.search": "t2", "candidate.summary": "t3"})
        assert set(catalog.list_domains()) == {"job", "candidate"}

    def test_contains_operator(self) -> None:
        catalog = IntentCatalog({"job.summary": "get_job_summary"})
        assert "job.summary" in catalog
        assert "ghost" not in catalog

    def test_len_reflects_intent_count(self) -> None:
        catalog = IntentCatalog({"a.b": "t1", "c.d": "t2"})
        assert len(catalog) == 2

    def test_default_catalog_covers_all_required_domains(self) -> None:
        domains = set(DEFAULT_CATALOG.list_domains())
        required = {"job", "candidate", "pipeline", "admission", "protheus"}
        assert required.issubset(domains), f"Domínios faltando: {required - domains}"

    def test_default_catalog_has_at_least_one_intent_per_domain(self) -> None:
        for domain in ("job", "candidate", "pipeline", "admission", "protheus"):
            intents_in_domain = [i for i in DEFAULT_CATALOG.list_intents() if i.startswith(f"{domain}.")]
            assert len(intents_in_domain) >= 1, f"Nenhuma intent para domínio '{domain}'"

    def test_all_default_catalog_tool_names_exist_in_registry(self) -> None:
        for intent, tool_name in INTENT_TO_TOOL.items():
            assert tool_name in DEFAULT_REGISTRY, (
                f"Intent '{intent}' aponta para '{tool_name}' que não existe no DEFAULT_REGISTRY"
            )

    def test_default_catalog_list_is_a_copy(self) -> None:
        intents = DEFAULT_CATALOG.list_intents()
        intents.clear()
        assert len(DEFAULT_CATALOG) > 0


# ── AssistantRouter ───────────────────────────────────────────────────────────


class TestAssistantRouterKnownIntent:
    async def test_known_intent_returns_ok_true(self) -> None:
        router, _ = _router(ToolResult.success(data={"id": "abc"}))
        req = AssistantRequest(intent="job.summary", arguments={"job_id": "abc"})
        resp = await router.handle(req, _exec_ctx())
        assert resp.ok is True

    async def test_known_intent_resolves_correct_tool(self) -> None:
        router, mock_rt = _router()
        req = AssistantRequest(intent="job.summary", arguments={"job_id": "abc"})
        await router.handle(req, _exec_ctx())
        assert mock_rt.calls[0]["tool_name"] == "get_job_summary"

    async def test_known_intent_response_contains_tool_name(self) -> None:
        router, _ = _router(ToolResult.success(data={}))
        req = AssistantRequest(intent="candidate.summary", arguments={"candidate_id": "x"})
        resp = await router.handle(req, _exec_ctx())
        assert resp.tool_name == "get_candidate_summary"

    async def test_known_intent_response_preserves_intent(self) -> None:
        router, _ = _router(ToolResult.success(data={}))
        req = AssistantRequest(intent="pipeline.overview", arguments={})
        resp = await router.handle(req, _exec_ctx())
        assert resp.intent == "pipeline.overview"


class TestAssistantRouterUnknownIntent:
    async def test_unknown_intent_returns_ok_false(self) -> None:
        router, _ = _router()
        req = AssistantRequest(intent="ghost.intent")
        resp = await router.handle(req, _exec_ctx())
        assert resp.ok is False

    async def test_unknown_intent_returns_unknown_intent_error_code(self) -> None:
        router, _ = _router()
        req = AssistantRequest(intent="totally.unknown")
        resp = await router.handle(req, _exec_ctx())
        assert resp.error_code == "UNKNOWN_INTENT"

    async def test_unknown_intent_does_not_call_runtime(self) -> None:
        router, mock_rt = _router()
        req = AssistantRequest(intent="invalid.xyz")
        await router.handle(req, _exec_ctx())
        assert len(mock_rt.calls) == 0

    async def test_unknown_intent_tool_name_is_none(self) -> None:
        router, _ = _router()
        resp = await router.handle(AssistantRequest(intent="nope"), _exec_ctx())
        assert resp.tool_name is None


class TestAssistantRouterCallsRuntime:
    async def test_router_calls_runtime_not_tool_directly(self) -> None:
        """O router DEVE usar ToolRuntime.execute, nunca chamar a tool function diretamente."""
        router, mock_rt = _router()
        await router.handle(AssistantRequest(intent="job.search"), _exec_ctx())
        # Se o runtime foi chamado, o router está usando a infra correta
        assert len(mock_rt.calls) == 1
        assert mock_rt.calls[0]["tool_name"] == "search_jobs"

    async def test_arguments_are_passed_to_runtime_unchanged(self) -> None:
        router, mock_rt = _router()
        args = {"job_id": "uuid-abc", "limit": 5}
        req = AssistantRequest(intent="job.summary", arguments=args)
        await router.handle(req, _exec_ctx())
        assert mock_rt.calls[0]["args"] == args

    async def test_execution_context_is_passed_to_runtime(self) -> None:
        router, mock_rt = _router()
        exec_ctx = _exec_ctx()
        await router.handle(AssistantRequest(intent="job.summary"), exec_ctx)
        assert mock_rt.calls[0]["execution_context"] is exec_ctx


class TestAssistantRouterResultPropagation:
    async def test_tool_result_ok_true_gives_response_ok_true(self) -> None:
        router, _ = _router(ToolResult.success(data={"title": "Dev Python"}))
        resp = await router.handle(AssistantRequest(intent="job.summary"), _exec_ctx())
        assert resp.ok is True
        assert resp.data == {"title": "Dev Python"}

    async def test_tool_result_ok_false_gives_response_ok_false(self) -> None:
        router, _ = _router(ToolResult.error("NOT_FOUND", "Vaga não encontrada."))
        resp = await router.handle(AssistantRequest(intent="job.summary"), _exec_ctx())
        assert resp.ok is False

    async def test_tool_result_error_code_preserved(self) -> None:
        router, _ = _router(ToolResult.error("PERMISSION_DENIED", "Sem permissão."))
        resp = await router.handle(AssistantRequest(intent="job.summary"), _exec_ctx())
        assert resp.error_code == "PERMISSION_DENIED"

    async def test_tool_result_message_preserved(self) -> None:
        router, _ = _router(ToolResult.error("NOT_FOUND", "Candidato não encontrado."))
        resp = await router.handle(AssistantRequest(intent="candidate.summary"), _exec_ctx())
        assert resp.message == "Candidato não encontrado."

    async def test_requires_approval_propagated_from_tool_result(self) -> None:
        pending = ToolResult.pending_approval("send_offer", "Precisa de aprovação.")
        router, _ = _router(pending)
        resp = await router.handle(AssistantRequest(intent="admission.case_summary"), _exec_ctx())
        assert resp.requires_approval is True

    async def test_warnings_default_empty_in_response(self) -> None:
        router, _ = _router(ToolResult.success(data={}))
        resp = await router.handle(AssistantRequest(intent="job.summary"), _exec_ctx())
        assert resp.warnings == []


class TestAssistantRouterDomainCoverage:
    async def test_handles_jobs_intent(self) -> None:
        router, mock_rt = _router()
        await router.handle(AssistantRequest(intent="job.search"), _exec_ctx())
        assert mock_rt.calls[0]["tool_name"] == "search_jobs"

    async def test_handles_candidate_intent(self) -> None:
        router, mock_rt = _router()
        await router.handle(AssistantRequest(intent="candidate.summary"), _exec_ctx())
        assert mock_rt.calls[0]["tool_name"] == "get_candidate_summary"

    async def test_handles_pipeline_intent(self) -> None:
        router, mock_rt = _router()
        await router.handle(AssistantRequest(intent="pipeline.overview"), _exec_ctx())
        assert mock_rt.calls[0]["tool_name"] == "get_job_pipeline_overview"

    async def test_handles_admission_intent(self) -> None:
        router, mock_rt = _router()
        await router.handle(AssistantRequest(intent="admission.case_summary"), _exec_ctx())
        assert mock_rt.calls[0]["tool_name"] == "get_admission_case_summary"

    async def test_handles_protheus_intent(self) -> None:
        router, mock_rt = _router()
        await router.handle(AssistantRequest(intent="protheus.export_status"), _exec_ctx())
        assert mock_rt.calls[0]["tool_name"] == "get_protheus_export_status"


class TestAssistantRouterWithRealRuntime:
    async def test_router_works_with_default_registry_and_real_runtime(self) -> None:
        """Integração mínima: router + DEFAULT_REGISTRY + ToolRuntime real (sem services)."""
        runtime = ToolRuntime(DEFAULT_REGISTRY, read_only=True)
        router = AssistantRouter(runtime=runtime)
        req = AssistantRequest(intent="job.summary", arguments={"job_id": "abc"})
        exec_ctx = ToolExecutionContext(agent_context=_ctx(), services={})
        # Deve retornar INTERNAL_ERROR (job_service ausente), nunca levantar
        resp = await router.handle(req, exec_ctx)
        assert isinstance(resp, AssistantResponse)
        assert resp.intent == "job.summary"
        assert resp.tool_name == "get_job_summary"

    async def test_router_unknown_intent_works_with_real_runtime(self) -> None:
        runtime = ToolRuntime(DEFAULT_REGISTRY, read_only=True)
        router = AssistantRouter(runtime=runtime)
        resp = await router.handle(AssistantRequest(intent="nao.existe"), _exec_ctx())
        assert resp.error_code == "UNKNOWN_INTENT"
        assert resp.ok is False
