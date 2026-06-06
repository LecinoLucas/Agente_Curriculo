"""Unit tests — AI Tool Runtime (Fase AI-ASSISTANT-0).

Cobre ToolRuntime: lookup, validação, injeção de services e execução.
Nenhum banco, LLM, endpoint ou migration é criado aqui.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_registry import ToolDefinition, ToolRegistry
from src.ai_orchestration.core.tool_runtime import ToolRuntime


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ctx(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id="user-test",
        role="recruiter",
        permissions=permissions if permissions is not None else ["can_view_jobs"],
        request_id="req-test",
        session_id="sess-test",
    )


def _exec_ctx(
    permissions: list[str] | None = None,
    services: dict | None = None,
) -> ToolExecutionContext:
    return ToolExecutionContext(
        agent_context=_ctx(permissions),
        services=services or {},
        read_only=True,
    )


# ── Mock tool functions ───────────────────────────────────────────────────────


async def _tool_simple(context, job_id: str) -> ToolResult:
    return ToolResult.success(data={"job_id": job_id})


async def _tool_with_service(context, job_id: str, job_service) -> ToolResult:
    return ToolResult.success(data={"job_id": job_id, "service_id": id(job_service)})


async def _tool_optional_param(context, job_id: str, limit: int = 10) -> ToolResult:
    return ToolResult.success(data={"job_id": job_id, "limit": limit})


async def _tool_raises(context, job_id: str) -> ToolResult:
    raise ValueError("unexpected internal error")


async def _tool_write_action(context, job_id: str) -> ToolResult:
    return ToolResult.success(data={"written": True})


async def _tool_approval_needed(context, job_id: str) -> ToolResult:
    return ToolResult.success(data={"done": True})


# ── ToolDefinition factories ─────────────────────────────────────────────────


def _def_read_ok(name: str = "tool_read_ok") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        domain="test",
        description="Read-only test tool",
        required_permissions=["can_view_jobs"],
        read_only=True,
        requires_approval=False,
        fn=_tool_simple,
    )


def _def_with_service(name: str = "tool_with_service") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        domain="test",
        description="Tool that needs a service",
        required_permissions=["can_view_jobs"],
        read_only=True,
        requires_approval=False,
        fn=_tool_with_service,
    )


def _def_write(name: str = "tool_write") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        domain="test",
        description="Write tool (blocked in read-only runtime)",
        required_permissions=["can_view_jobs"],
        read_only=False,
        requires_approval=False,
        fn=_tool_write_action,
    )


def _def_requires_approval(name: str = "tool_approval") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        domain="test",
        description="Tool requiring approval",
        required_permissions=["can_view_jobs"],
        read_only=True,
        requires_approval=True,
        fn=_tool_approval_needed,
    )


def _def_raises(name: str = "tool_raises") -> ToolDefinition:
    return ToolDefinition(
        name=name,
        domain="test",
        description="Tool that raises",
        required_permissions=["can_view_jobs"],
        read_only=True,
        requires_approval=False,
        fn=_tool_raises,
    )


def _build_registry(*defs: ToolDefinition) -> ToolRegistry:
    registry = ToolRegistry()
    for d in defs:
        registry.register(d)
    return registry


# ── ToolRuntime core behavior ─────────────────────────────────────────────────


class TestToolRuntimeExecution:
    async def test_executes_read_only_tool_with_valid_permission(self) -> None:
        registry = _build_registry(_def_read_ok())
        runtime = ToolRuntime(registry)
        result = await runtime.execute(
            "tool_read_ok",
            {"job_id": "abc"},
            _exec_ctx(["can_view_jobs"]),
        )
        assert result.ok is True
        assert result.data["job_id"] == "abc"

    async def test_returns_tool_result_type(self) -> None:
        registry = _build_registry(_def_read_ok())
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_read_ok", {"job_id": "x"}, _exec_ctx())
        assert isinstance(result, ToolResult)

    async def test_passes_args_to_tool(self) -> None:
        registry = _build_registry(_def_read_ok())
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_read_ok", {"job_id": "my-job"}, _exec_ctx())
        assert result.data["job_id"] == "my-job"

    async def test_optional_param_uses_default_when_not_in_args(self) -> None:
        td = ToolDefinition(
            name="tool_opt",
            domain="test",
            description="",
            required_permissions=["can_view_jobs"],
            read_only=True,
            requires_approval=False,
            fn=_tool_optional_param,
        )
        registry = _build_registry(td)
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_opt", {"job_id": "x"}, _exec_ctx())
        assert result.ok is True
        assert result.data["limit"] == 10  # default value used


# ── TOOL_NOT_FOUND ────────────────────────────────────────────────────────────


class TestToolRuntimeToolNotFound:
    async def test_unknown_tool_returns_tool_not_found(self) -> None:
        runtime = ToolRuntime(ToolRegistry())
        result = await runtime.execute("ghost_tool", {}, _exec_ctx())
        assert result.ok is False
        assert result.error_code == "TOOL_NOT_FOUND"

    async def test_tool_not_found_message_contains_tool_name(self) -> None:
        runtime = ToolRuntime(ToolRegistry())
        result = await runtime.execute("unknown_xyz", {}, _exec_ctx())
        assert "unknown_xyz" in (result.message or "")

    async def test_tool_not_found_does_not_raise(self) -> None:
        runtime = ToolRuntime(ToolRegistry())
        result = await runtime.execute("nonexistent", {}, _exec_ctx())
        assert isinstance(result, ToolResult)


# ── PERMISSION_DENIED ─────────────────────────────────────────────────────────


class TestToolRuntimePermissions:
    async def test_missing_permission_returns_permission_denied(self) -> None:
        registry = _build_registry(_def_read_ok())
        runtime = ToolRuntime(registry)
        result = await runtime.execute(
            "tool_read_ok",
            {"job_id": "x"},
            _exec_ctx(permissions=[]),  # no permissions
        )
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_wrong_permission_returns_permission_denied(self) -> None:
        registry = _build_registry(_def_read_ok())
        runtime = ToolRuntime(registry)
        result = await runtime.execute(
            "tool_read_ok",
            {"job_id": "x"},
            _exec_ctx(permissions=["can_view_pipeline"]),  # wrong permission
        )
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_permission_denied_does_not_call_tool(self) -> None:
        called = []

        async def _spy(context, job_id: str) -> ToolResult:
            called.append(True)
            return ToolResult.success(data={})

        td = ToolDefinition(
            name="spy_tool",
            domain="test",
            description="",
            required_permissions=["can_view_jobs"],
            read_only=True,
            requires_approval=False,
            fn=_spy,
        )
        registry = _build_registry(td)
        runtime = ToolRuntime(registry)
        await runtime.execute("spy_tool", {"job_id": "x"}, _exec_ctx(permissions=[]))
        assert len(called) == 0


# ── TOOL_NOT_ALLOWED (read-only mode) ─────────────────────────────────────────


class TestToolRuntimeReadOnlyMode:
    async def test_write_tool_blocked_in_read_only_runtime(self) -> None:
        registry = _build_registry(_def_write())
        runtime = ToolRuntime(registry, read_only=True)
        result = await runtime.execute("tool_write", {"job_id": "x"}, _exec_ctx())
        assert result.ok is False
        assert result.error_code == "TOOL_NOT_ALLOWED"

    async def test_write_tool_allowed_in_non_read_only_runtime(self) -> None:
        registry = _build_registry(_def_write())
        runtime = ToolRuntime(registry, read_only=False)
        result = await runtime.execute("tool_write", {"job_id": "x"}, _exec_ctx())
        assert result.ok is True

    async def test_read_only_default_is_true(self) -> None:
        registry = _build_registry(_def_write())
        runtime = ToolRuntime(registry)  # default read_only=True
        result = await runtime.execute("tool_write", {"job_id": "x"}, _exec_ctx())
        assert result.error_code == "TOOL_NOT_ALLOWED"


# ── REQUIRES_APPROVAL ─────────────────────────────────────────────────────────


class TestToolRuntimeRequiresApproval:
    async def test_requires_approval_tool_blocked(self) -> None:
        registry = _build_registry(_def_requires_approval())
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_approval", {"job_id": "x"}, _exec_ctx())
        assert result.ok is False
        assert result.error_code == "REQUIRES_APPROVAL"

    async def test_requires_approval_tool_does_not_execute(self) -> None:
        executed = []

        async def _spy_approval(context, job_id: str) -> ToolResult:
            executed.append(True)
            return ToolResult.success(data={})

        td = ToolDefinition(
            name="approval_spy",
            domain="test",
            description="",
            required_permissions=["can_view_jobs"],
            read_only=True,
            requires_approval=True,
            fn=_spy_approval,
        )
        registry = _build_registry(td)
        runtime = ToolRuntime(registry)
        await runtime.execute("approval_spy", {"job_id": "x"}, _exec_ctx())
        assert len(executed) == 0


# ── INTERNAL_ERROR (exception in tool) ────────────────────────────────────────


class TestToolRuntimeInternalError:
    async def test_tool_exception_returns_internal_error(self) -> None:
        registry = _build_registry(_def_raises())
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_raises", {"job_id": "x"}, _exec_ctx())
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_internal_error_message(self) -> None:
        registry = _build_registry(_def_raises())
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_raises", {"job_id": "x"}, _exec_ctx())
        assert "Traceback" not in (result.message or "")

    async def test_internal_error_includes_exception_type(self) -> None:
        registry = _build_registry(_def_raises())
        runtime = ToolRuntime(registry)
        result = await runtime.execute("tool_raises", {"job_id": "x"}, _exec_ctx())
        assert "ValueError" in (result.message or "")


# ── Service injection ─────────────────────────────────────────────────────────


class TestToolRuntimeServiceInjection:
    async def test_injects_service_by_parameter_name(self) -> None:
        mock_svc = MagicMock()
        mock_svc.name = "mock_job_service"

        registry = _build_registry(_def_with_service())
        runtime = ToolRuntime(registry)
        result = await runtime.execute(
            "tool_with_service",
            {"job_id": "abc"},
            _exec_ctx(services={"job_service": mock_svc}),
        )
        assert result.ok is True
        assert result.data["service_id"] == id(mock_svc)

    async def test_missing_required_service_returns_internal_error(self) -> None:
        registry = _build_registry(_def_with_service())
        runtime = ToolRuntime(registry)
        result = await runtime.execute(
            "tool_with_service",
            {"job_id": "abc"},
            _exec_ctx(services={}),  # no service provided
        )
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_missing_service_error_mentions_param_name(self) -> None:
        registry = _build_registry(_def_with_service())
        runtime = ToolRuntime(registry)
        result = await runtime.execute(
            "tool_with_service",
            {"job_id": "abc"},
            _exec_ctx(services={}),
        )
        assert "job_service" in (result.message or "")

    async def test_context_is_always_injected_from_execution_context(self) -> None:
        captured = {}

        async def _capture_ctx(context, job_id: str) -> ToolResult:
            captured["ctx"] = context
            return ToolResult.success(data={})

        td = ToolDefinition(
            name="ctx_capture",
            domain="test",
            description="",
            required_permissions=["can_view_jobs"],
            read_only=True,
            requires_approval=False,
            fn=_capture_ctx,
        )
        registry = _build_registry(td)
        runtime = ToolRuntime(registry)
        exec_ctx = _exec_ctx()
        await runtime.execute("ctx_capture", {"job_id": "x"}, exec_ctx)
        assert captured["ctx"] is exec_ctx.agent_context
