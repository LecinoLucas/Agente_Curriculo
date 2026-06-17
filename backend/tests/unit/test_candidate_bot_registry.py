from __future__ import annotations

import logging
from types import SimpleNamespace
from uuid import uuid4

import pytest

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_runtime import ToolRuntime
from src.ai_orchestration.tools.candidate_bot_registry import (
    CANDIDATE_BOT_REGISTRY,
    FORBIDDEN_FOR_CANDIDATE_MVP,
    _EXPECTED_CANDIDATE_TOOL_COUNT,
)


def _candidate_context(*permissions: str) -> AgentContext:
    return AgentContext(
        user_id=str(uuid4()),
        role="candidate",
        permissions=list(permissions),
        request_id="req-candidate",
        session_id="sess-candidate",
        actor_type="candidate",
        channel="candidate_portal",
        audience="candidate",
    )


class _FakeJobRepository:
    async def list_active(self, **kwargs):
        jobs = [
            SimpleNamespace(
                id=uuid4(),
                title="Frentista",
                location="Goiânia/GO",
                job_area="Operações",
                work_model="Presencial",
                seniority_level="Junior",
            )
        ]
        return jobs, len(jobs), {}


def test_candidate_registry_contains_only_safe_allowlisted_tools() -> None:
    assert len(CANDIDATE_BOT_REGISTRY) == _EXPECTED_CANDIDATE_TOOL_COUNT
    assert set(CANDIDATE_BOT_REGISTRY.list_names()) == {
        "search_public_jobs",
        "get_public_job_detail",
        "get_public_job_units",
        "search_candidate_knowledge",
        "answer_candidate_knowledge",
        "get_my_application_status",
    }
    assert "search_candidates" not in CANDIDATE_BOT_REGISTRY
    assert "get_candidate_pipeline_history" not in CANDIDATE_BOT_REGISTRY
    assert "get_protheus_export_status" not in CANDIDATE_BOT_REGISTRY


def test_candidate_registry_logs_blocked_internal_tool_request(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.WARNING)
    tool = CANDIDATE_BOT_REGISTRY.get("search_candidates")
    assert tool is None
    assert "search_candidates" in FORBIDDEN_FOR_CANDIDATE_MVP
    assert "candidate_bot_registry.tool_blocked" in caplog.text


def test_tool_permission_guard_allows_candidate_safe_permission() -> None:
    ctx = _candidate_context("candidate_read_public_jobs")
    result = ToolPermissionGuard.check(ctx, "candidate_read_public_jobs")
    assert result.allowed is True


def test_tool_permission_guard_blocks_internal_permission_for_candidate() -> None:
    ctx = _candidate_context("can_view_jobs")
    result = ToolPermissionGuard.check(ctx, "can_view_jobs")
    assert result.allowed is False
    assert "candidate_* seguras" in str(result.reason)


@pytest.mark.asyncio
async def test_candidate_runtime_executes_allowed_read_only_tool() -> None:
    ctx = _candidate_context("candidate_read_public_jobs")
    runtime = ToolRuntime(CANDIDATE_BOT_REGISTRY, read_only=True)
    execution_context = ToolExecutionContext(
        agent_context=ctx,
        services={"job_repository": _FakeJobRepository()},
        read_only=True,
    )

    result = await runtime.execute(
        "search_public_jobs",
        {"query": "frentista", "limit": 5},
        execution_context,
    )

    assert result.ok is True
    assert isinstance(result.data, dict)
    assert result.data["returned"] == 1
    assert result.data["jobs"][0]["title"] == "Frentista"


@pytest.mark.asyncio
async def test_candidate_runtime_blocks_forbidden_tool_request() -> None:
    ctx = _candidate_context("candidate_read_public_jobs")
    runtime = ToolRuntime(CANDIDATE_BOT_REGISTRY, read_only=True)
    execution_context = ToolExecutionContext(agent_context=ctx, services={}, read_only=True)

    result = await runtime.execute("search_candidates", {}, execution_context)

    assert result.ok is False
    assert result.error_code == "TOOL_NOT_FOUND"


@pytest.mark.asyncio
async def test_candidate_runtime_blocks_when_permission_missing() -> None:
    ctx = _candidate_context()
    runtime = ToolRuntime(CANDIDATE_BOT_REGISTRY, read_only=True)
    execution_context = ToolExecutionContext(
        agent_context=ctx,
        services={"job_repository": _FakeJobRepository()},
        read_only=True,
    )

    result = await runtime.execute("search_public_jobs", {}, execution_context)

    assert result.ok is False
    assert result.error_code == "PERMISSION_DENIED"
