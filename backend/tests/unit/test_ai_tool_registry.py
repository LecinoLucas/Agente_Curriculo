"""Unit tests — AI Tool Registry (Fase AI-ASSISTANT-0).

Cobre ToolDefinition, ToolRegistry e DEFAULT_REGISTRY.
Nenhum banco, LLM, endpoint ou migration é criado aqui.
"""
from __future__ import annotations

import pytest

from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.tool_registry import (
    ToolAlreadyRegisteredError,
    ToolDefinition,
    ToolNotFoundError,
    ToolRegistry,
)
from src.ai_orchestration.tools.registry import DEFAULT_REGISTRY, _EXPECTED_TOOL_COUNT


# ── Fixtures / helpers ────────────────────────────────────────────────────────


async def _noop_tool(context, value: str = "x") -> ToolResult:
    return ToolResult.success(data={"value": value})


async def _another_tool(context) -> ToolResult:
    return ToolResult.success(data={})


def _make_def(name: str = "test_tool", **overrides: object) -> ToolDefinition:
    return ToolDefinition(
        name=overrides.get("name", name),
        domain=overrides.get("domain", "test"),
        description=overrides.get("description", "Test tool"),
        required_permissions=overrides.get("required_permissions", ["can_view_jobs"]),
        read_only=overrides.get("read_only", True),
        requires_approval=overrides.get("requires_approval", False),
        fn=overrides.get("fn", _noop_tool),
    )


# ── ToolDefinition ────────────────────────────────────────────────────────────


class TestToolDefinition:
    def test_has_all_required_fields(self) -> None:
        td = _make_def()
        assert td.name == "test_tool"
        assert td.domain == "test"
        assert isinstance(td.description, str)
        assert isinstance(td.required_permissions, list)
        assert isinstance(td.read_only, bool)
        assert isinstance(td.requires_approval, bool)
        assert callable(td.fn)

    def test_required_permissions_is_list(self) -> None:
        td = _make_def(required_permissions=["can_view_jobs", "can_view_candidates"])
        assert len(td.required_permissions) == 2

    def test_fn_is_callable(self) -> None:
        td = _make_def(fn=_noop_tool)
        assert callable(td.fn)


# ── ToolRegistry ──────────────────────────────────────────────────────────────


class TestToolRegistry:
    def test_register_valid_tool(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("tool_a"))
        assert "tool_a" in registry

    def test_prevents_duplicate_name(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("tool_dup"))
        with pytest.raises(ToolAlreadyRegisteredError):
            registry.register(_make_def("tool_dup"))

    def test_list_tools_returns_all_registered(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("tool_1"))
        registry.register(_make_def("tool_2"))
        names = {t.name for t in registry.list_tools()}
        assert {"tool_1", "tool_2"}.issubset(names)

    def test_list_names_returns_names(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("tool_x"))
        assert "tool_x" in registry.list_names()

    def test_get_returns_tool_by_name(self) -> None:
        registry = ToolRegistry()
        td = _make_def("lookup_me")
        registry.register(td)
        result = registry.get("lookup_me")
        assert result is td

    def test_get_returns_none_for_unknown_name(self) -> None:
        registry = ToolRegistry()
        assert registry.get("ghost_tool") is None

    def test_require_returns_tool_by_name(self) -> None:
        registry = ToolRegistry()
        td = _make_def("require_me")
        registry.register(td)
        assert registry.require("require_me") is td

    def test_require_raises_for_unknown_name(self) -> None:
        registry = ToolRegistry()
        with pytest.raises(ToolNotFoundError):
            registry.require("does_not_exist")

    def test_len_reflects_registered_count(self) -> None:
        registry = ToolRegistry()
        assert len(registry) == 0
        registry.register(_make_def("t1"))
        registry.register(_make_def("t2"))
        assert len(registry) == 2

    def test_contains_operator(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("present"))
        assert "present" in registry
        assert "absent" not in registry

    def test_list_tools_is_a_copy(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("original"))
        tools = registry.list_tools()
        tools.clear()
        # Registry must not be affected
        assert len(registry) == 1

    def test_list_names_is_a_copy(self) -> None:
        registry = ToolRegistry()
        registry.register(_make_def("orig"))
        names = registry.list_names()
        names.clear()
        assert "orig" in registry


# ── DEFAULT_REGISTRY ─────────────────────────────────────────────────────────


class TestDefaultRegistry:
    def test_expected_tool_count(self) -> None:
        assert len(DEFAULT_REGISTRY) == _EXPECTED_TOOL_COUNT

    def test_all_domains_represented(self) -> None:
        domains = {t.domain for t in DEFAULT_REGISTRY.list_tools()}
        assert domains == {"jobs", "candidates", "pipeline", "admission", "protheus"}

    def test_all_registered_tools_have_required_permissions(self) -> None:
        for tool in DEFAULT_REGISTRY.list_tools():
            assert len(tool.required_permissions) > 0, (
                f"Tool '{tool.name}' não tem required_permissions definidas"
            )

    def test_all_registered_tools_are_read_only(self) -> None:
        for tool in DEFAULT_REGISTRY.list_tools():
            assert tool.read_only is True, (
                f"Tool '{tool.name}' não é read_only — não deve estar no DEFAULT_REGISTRY"
            )

    def test_all_registered_tools_have_requires_approval_false(self) -> None:
        for tool in DEFAULT_REGISTRY.list_tools():
            assert tool.requires_approval is False, (
                f"Tool '{tool.name}' tem requires_approval=True — "
                "não deve estar no DEFAULT_REGISTRY sem aprovação explícita"
            )

    def test_all_registered_tools_have_callable_fn(self) -> None:
        for tool in DEFAULT_REGISTRY.list_tools():
            assert callable(tool.fn), f"Tool '{tool.name}' tem fn não-callable"

    def test_jobs_tools_registered(self) -> None:
        for name in ("get_job_summary", "search_jobs", "get_job_requirements", "get_job_ai_draft_context"):
            assert name in DEFAULT_REGISTRY, f"Tool esperada '{name}' não está no DEFAULT_REGISTRY"

    def test_candidates_tools_registered(self) -> None:
        for name in ("get_candidate_summary", "search_candidates",
                     "get_candidate_profile_context", "get_candidate_resume_analysis_summary"):
            assert name in DEFAULT_REGISTRY, f"Tool esperada '{name}' não está no DEFAULT_REGISTRY"

    def test_pipeline_tools_registered(self) -> None:
        for name in ("get_job_pipeline_overview", "get_candidate_pipeline_position",
                     "get_candidate_pipeline_history", "search_pipeline_candidates"):
            assert name in DEFAULT_REGISTRY, f"Tool esperada '{name}' não está no DEFAULT_REGISTRY"

    def test_admission_tools_registered(self) -> None:
        for name in ("get_admission_case_summary", "get_admission_checklist_status",
                     "get_admission_documents_status", "get_admission_events_summary"):
            assert name in DEFAULT_REGISTRY, f"Tool esperada '{name}' não está no DEFAULT_REGISTRY"

    def test_protheus_tool_registered(self) -> None:
        assert "get_protheus_export_status" in DEFAULT_REGISTRY

    def test_no_duplicate_names_in_default_registry(self) -> None:
        names = DEFAULT_REGISTRY.list_names()
        assert len(names) == len(set(names)), "DEFAULT_REGISTRY contém nomes duplicados"
