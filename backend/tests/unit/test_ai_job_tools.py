"""Unit tests — AI Job Tools (Fase AI-TOOLS-1).

Todas as tools são read-only. Nenhuma chamada real a banco ou LLM.
JobService é sempre mockado para garantir isolamento da camada de repository.
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.tools.job_tools import (
    get_job_ai_draft_context,
    get_job_requirements,
    get_job_summary,
    search_jobs,
)
from src.application.services.job_service import JobNotFoundError


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ctx(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id="user-test",
        role="recruiter",
        permissions=permissions if permissions is not None else ["can_view_jobs"],
        request_id="req-test",
        session_id="sess-test",
    )


def _make_job(**overrides: object) -> MagicMock:
    job = MagicMock()
    job.id = overrides.get("id", uuid4())
    job.title = overrides.get("title", "Desenvolvedor Python")
    job.status = overrides.get("status", "published")
    job.job_area = overrides.get("job_area", "technology")
    job.seniority_level = overrides.get("seniority_level", "senior")
    job.location = overrides.get("location", "São Paulo, SP")
    job.work_model = overrides.get("work_model", "hybrid")
    job.mandatory_skills = overrides.get("mandatory_skills", ["Python", "FastAPI"])
    job.nice_to_have_skills = overrides.get("nice_to_have_skills", ["Kubernetes"])
    job.behavioral_requirements = overrides.get("behavioral_requirements", ["Liderança"])
    job.screening_questions = overrides.get("screening_questions", ["Experiência com cloud?"])
    job.deal_breakers = overrides.get("deal_breakers", [])
    job.requirements = overrides.get("requirements", "3+ anos de experiência com Python.")
    job.responsibilities = overrides.get("responsibilities", "Desenvolver APIs REST.")
    job.experience_context = overrides.get("experience_context", "Startup de fintech.")
    job.description = overrides.get("description", "Vaga de desenvolvedor sênior.")
    job.minimum_education_level = overrides.get("minimum_education_level", "bachelor")
    job.minimum_years_experience = overrides.get("minimum_years_experience", None)
    job.quality_score = overrides.get("quality_score", 85)
    job.quality_status = overrides.get("quality_status", "good")
    job.created_at = overrides.get("created_at", datetime(2024, 1, 1, tzinfo=UTC))
    job.updated_at = overrides.get("updated_at", datetime(2024, 6, 1, tzinfo=UTC))
    return job


@pytest.fixture
def ctx() -> AgentContext:
    return _ctx()


@pytest.fixture
def ctx_no_perm() -> AgentContext:
    return _ctx([])


@pytest.fixture
def mock_job() -> MagicMock:
    return _make_job()


@pytest.fixture
def svc() -> MagicMock:
    service = MagicMock()
    service.get = AsyncMock()
    service.list = AsyncMock()
    return service


# ── get_job_summary ───────────────────────────────────────────────────────────


class TestGetJobSummary:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_summary(ctx, str(mock_job.id), svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_job_summary(ctx_no_perm, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_returns_expected_shape(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_summary(ctx, str(mock_job.id), svc)
        assert result.ok is True
        data = result.data
        for field in ("id", "title", "status", "area", "seniority",
                      "location", "work_model", "mandatory_skills",
                      "nice_to_have_skills", "created_at", "updated_at"):
            assert field in data, f"Campo ausente no shape: {field}"

    async def test_requires_approval_is_false(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_summary(ctx, str(mock_job.id), svc)
        assert result.requires_approval is False

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = JobNotFoundError()
        result = await get_job_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("db failure")
        result = await get_job_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_invalid_uuid_returns_controlled_error(self, ctx, svc) -> None:
        result = await get_job_summary(ctx, "not-a-uuid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get.assert_not_called()

    async def test_uses_service_not_repository(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        await get_job_summary(ctx, str(mock_job.id), svc)
        # Tool deve chamar apenas o service, nunca o repository diretamente
        svc.get.assert_called_once()

    async def test_mandatory_skills_are_list(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_summary(ctx, str(mock_job.id), svc)
        assert isinstance(result.data["mandatory_skills"], list)
        assert isinstance(result.data["nice_to_have_skills"], list)

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("internal crash")
        result = await get_job_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert "Traceback" not in (result.message or "")


# ── search_jobs ───────────────────────────────────────────────────────────────


class TestSearchJobs:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_job) -> None:
        svc.list.return_value = ([mock_job], 1, {})
        result = await search_jobs(ctx, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await search_jobs(ctx_no_perm, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_requires_approval_is_false(self, ctx, svc, mock_job) -> None:
        svc.list.return_value = ([mock_job], 1, {})
        result = await search_jobs(ctx, svc)
        assert result.requires_approval is False

    async def test_respects_limit(self, ctx, svc) -> None:
        jobs = [_make_job() for _ in range(5)]
        svc.list.return_value = (jobs, 5, {})
        result = await search_jobs(ctx, svc, limit=5)
        assert result.ok is True
        assert result.data["returned"] == 5
        # Garante que page_size foi passado corretamente ao service
        call_kwargs = svc.list.call_args
        assert call_kwargs.kwargs.get("page_size") == 5 or call_kwargs.args[1] == 5

    async def test_limit_capped_at_50(self, ctx, svc) -> None:
        svc.list.return_value = ([], 0, {})
        await search_jobs(ctx, svc, limit=999)
        call_kwargs = svc.list.call_args
        page_size = call_kwargs.kwargs.get("page_size") or call_kwargs.args[1]
        assert page_size <= 50

    async def test_limit_minimum_is_1(self, ctx, svc) -> None:
        svc.list.return_value = ([], 0, {})
        await search_jobs(ctx, svc, limit=0)
        call_kwargs = svc.list.call_args
        page_size = call_kwargs.kwargs.get("page_size") or call_kwargs.args[1]
        assert page_size >= 1

    async def test_result_shape_contains_jobs_and_total(self, ctx, svc, mock_job) -> None:
        svc.list.return_value = ([mock_job], 1, {})
        result = await search_jobs(ctx, svc)
        assert "jobs" in result.data
        assert "total" in result.data
        assert "returned" in result.data

    async def test_each_job_entry_has_required_fields(self, ctx, svc, mock_job) -> None:
        svc.list.return_value = ([mock_job], 1, {})
        result = await search_jobs(ctx, svc)
        entry = result.data["jobs"][0]
        for field in ("id", "title", "status", "area", "seniority", "location"):
            assert field in entry, f"Campo ausente no job entry: {field}"

    async def test_passes_query_filter_to_service(self, ctx, svc) -> None:
        svc.list.return_value = ([], 0, {})
        await search_jobs(ctx, svc, query="Python")
        call_kwargs = svc.list.call_args
        assert call_kwargs.kwargs.get("search") == "Python"

    async def test_passes_status_filter_to_service(self, ctx, svc) -> None:
        svc.list.return_value = ([], 0, {})
        await search_jobs(ctx, svc, status="published")
        call_kwargs = svc.list.call_args
        assert call_kwargs.kwargs.get("status") == "published"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.list.side_effect = RuntimeError("db failure")
        result = await search_jobs(ctx, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_uses_service_not_repository(self, ctx, svc, mock_job) -> None:
        svc.list.return_value = ([mock_job], 1, {})
        await search_jobs(ctx, svc)
        svc.list.assert_called_once()


# ── get_job_requirements ──────────────────────────────────────────────────────


class TestGetJobRequirements:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_requirements(ctx, str(mock_job.id), svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_job_requirements(ctx_no_perm, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_requires_approval_is_false(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_requirements(ctx, str(mock_job.id), svc)
        assert result.requires_approval is False

    async def test_returns_expected_shape(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_requirements(ctx, str(mock_job.id), svc)
        data = result.data
        for field in ("job_id", "title", "mandatory_skills", "nice_to_have_skills",
                      "behavioral_requirements", "screening_questions", "deal_breakers",
                      "requirements", "minimum_education_level", "minimum_years_experience"):
            assert field in data, f"Campo ausente: {field}"

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = JobNotFoundError()
        result = await get_job_requirements(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("db failure")
        result = await get_job_requirements(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_invalid_uuid_returns_controlled_error(self, ctx, svc) -> None:
        result = await get_job_requirements(ctx, "bad-uuid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get.assert_not_called()

    async def test_minimum_years_experience_serialized_as_string(self, ctx, svc) -> None:
        from decimal import Decimal
        job = _make_job(minimum_years_experience=Decimal("3.0"))
        svc.get.return_value = job
        result = await get_job_requirements(ctx, str(job.id), svc)
        assert result.ok is True
        value = result.data["minimum_years_experience"]
        assert isinstance(value, str)

    async def test_minimum_years_experience_none_when_absent(self, ctx, svc) -> None:
        job = _make_job(minimum_years_experience=None)
        svc.get.return_value = job
        result = await get_job_requirements(ctx, str(job.id), svc)
        assert result.data["minimum_years_experience"] is None

    async def test_uses_service_not_repository(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        await get_job_requirements(ctx, str(mock_job.id), svc)
        svc.get.assert_called_once()


# ── get_job_ai_draft_context ──────────────────────────────────────────────────


class TestGetJobAiDraftContext:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_ai_draft_context(ctx, str(mock_job.id), svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_job_ai_draft_context(ctx_no_perm, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_requires_approval_is_false(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_ai_draft_context(ctx, str(mock_job.id), svc)
        assert result.requires_approval is False

    async def test_returns_expected_shape(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_ai_draft_context(ctx, str(mock_job.id), svc)
        data = result.data
        for field in ("job_id", "title", "description", "requirements",
                      "responsibilities", "experience_context", "mandatory_skills",
                      "nice_to_have_skills", "behavioral_requirements",
                      "seniority_level", "work_model", "job_area",
                      "status", "quality_score", "quality_status"):
            assert field in data, f"Campo ausente: {field}"

    async def test_does_not_expose_salary(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        result = await get_job_ai_draft_context(ctx, str(mock_job.id), svc)
        data = result.data
        assert "salary_min" not in data
        assert "salary_max" not in data
        assert "salary" not in data

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = JobNotFoundError()
        result = await get_job_ai_draft_context(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("db failure")
        result = await get_job_ai_draft_context(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_invalid_uuid_returns_controlled_error(self, ctx, svc) -> None:
        result = await get_job_ai_draft_context(ctx, "not-valid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get.assert_not_called()

    async def test_uses_service_not_repository(self, ctx, svc, mock_job) -> None:
        svc.get.return_value = mock_job
        await get_job_ai_draft_context(ctx, str(mock_job.id), svc)
        svc.get.assert_called_once()
