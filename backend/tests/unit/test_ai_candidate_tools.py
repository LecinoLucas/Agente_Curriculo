"""Unit tests — AI Candidate Tools (Fase AI-TOOLS-2).

Todas as tools são read-only. Nenhuma chamada real a banco ou LLM.
CandidateService é sempre mockado — sem acesso direto a repository.
Dados sensíveis (CPF, salary, password, google_sub) nunca devem aparecer
no output das tools.
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.tools.candidate_tools import (
    get_candidate_profile_context,
    get_candidate_resume_analysis_summary,
    get_candidate_summary,
    search_candidates,
)
from src.application.services.candidate_service import CandidateNotFoundError


# ── Helpers ───────────────────────────────────────────────────────────────────

_SENSITIVE_KEYS = frozenset({
    "phone",
    "cpf", "cpf_hash", "cpf_last4",
    "salary_expectation",
    "password_hash", "password_created_at",
    "google_sub", "google_picture_url",
    "internal_notes",
    "lgpd_consent_at", "lgpd_consent_version",
    "works_at_marajo_group",
})


def _ctx(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id="user-test",
        role="recruiter",
        permissions=permissions if permissions is not None else ["can_view_candidates"],
        request_id="req-test",
        session_id="sess-test",
    )


def _make_candidate(**overrides: object) -> MagicMock:
    c = MagicMock()
    c.id = overrides.get("id", uuid4())
    c.full_name = overrides.get("full_name", "Ana Souza")
    c.email = overrides.get("email", "ana@example.com")
    c.phone = overrides.get("phone", "+55 11 99999-0000")
    c.cpf = overrides.get("cpf", "123.456.789-00")          # presente no model, NÃO deve sair na tool
    c.cpf_hash = overrides.get("cpf_hash", "hashvalue")
    c.cpf_last4 = overrides.get("cpf_last4", "9-00")
    c.location_city = overrides.get("location_city", "São Paulo")
    c.location_state = overrides.get("location_state", "SP")
    c.location_country = overrides.get("location_country", "BR")
    c.linkedin_url = overrides.get("linkedin_url", "https://linkedin.com/in/ana")
    c.github_url = overrides.get("github_url", None)
    c.portfolio_url = overrides.get("portfolio_url", None)
    c.tags = overrides.get("tags", ["Python", "Backend"])
    c.internal_notes = overrides.get("internal_notes", "Nota interna confidencial")
    c.salary_expectation = overrides.get("salary_expectation", "8000.00")
    c.password_hash = overrides.get("password_hash", "hashed")
    c.google_sub = overrides.get("google_sub", "google-sub-id")
    c.application_source = overrides.get("application_source", "manual")
    c.desired_contract_type = overrides.get("desired_contract_type", "CLT")
    c.data_quality_status = overrides.get("data_quality_status", "valid")
    c.data_quality_reason = overrides.get("data_quality_reason", None)
    c.data_quality_marked_at = overrides.get("data_quality_marked_at", datetime(2024, 5, 1, tzinfo=UTC))
    c.created_at = overrides.get("created_at", datetime(2024, 1, 1, tzinfo=UTC))
    c.updated_at = overrides.get("updated_at", datetime(2024, 6, 1, tzinfo=UTC))
    return c


def _make_summary(**overrides: object) -> MagicMock:
    s = MagicMock()
    s.id = overrides.get("id", uuid4())
    s.full_name = overrides.get("full_name", "Ana Souza")
    s.email = overrides.get("email", "ana@example.com")
    s.resume_count = overrides.get("resume_count", 1)
    s.ai_status = overrides.get("ai_status", "completed")
    s.active_job_title = overrides.get("active_job_title", "Dev Python")
    s.active_job_stage = overrides.get("active_job_stage", "screening")
    s.active_job_job_fit_score = overrides.get("active_job_job_fit_score", 82.5)
    s.tags = overrides.get("tags", ["Python"])
    return s


@pytest.fixture
def ctx() -> AgentContext:
    return _ctx()


@pytest.fixture
def ctx_no_perm() -> AgentContext:
    return _ctx([])


@pytest.fixture
def mock_candidate() -> MagicMock:
    return _make_candidate()


@pytest.fixture
def svc() -> MagicMock:
    service = MagicMock()
    service.get = AsyncMock()
    service.list_summaries = AsyncMock()
    return service


# ── get_candidate_summary ─────────────────────────────────────────────────────


class TestGetCandidateSummary:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_candidate_summary(ctx_no_perm, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_returns_expected_shape(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True
        data = result.data
        for field in ("id", "full_name", "email", "location",
                      "location_city", "location_state", "location_country",
                      "tags", "application_source", "data_quality_status",
                      "created_at", "updated_at"):
            assert field in data, f"Campo ausente: {field}"

    async def test_requires_approval_is_false(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        assert result.requires_approval is False

    async def test_does_not_expose_sensitive_fields(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True
        data = result.data
        for key in _SENSITIVE_KEYS:
            assert key not in data, f"Campo sensível exposto: {key}"

    async def test_does_not_expose_phone_cpf_salary_or_internal_notes(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True
        serialized = str(result.data)
        for key in ("phone", "cpf", "salary_expectation", "internal_notes"):
            assert key not in result.data
        for value in (
            mock_candidate.phone,
            mock_candidate.cpf,
            mock_candidate.salary_expectation,
            mock_candidate.internal_notes,
        ):
            assert value not in serialized

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = CandidateNotFoundError()
        result = await get_candidate_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("db failure")
        result = await get_candidate_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("crash")
        result = await get_candidate_summary(ctx, str(uuid4()), svc)
        assert "Traceback" not in (result.message or "")

    async def test_invalid_uuid_returns_controlled_error(self, ctx, svc) -> None:
        result = await get_candidate_summary(ctx, "not-a-uuid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get.assert_not_called()

    async def test_uses_service_not_repository(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        svc.get.assert_called_once()

    async def test_tags_are_list(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_summary(ctx, str(mock_candidate.id), svc)
        assert isinstance(result.data["tags"], list)

    async def test_location_assembled_from_parts(self, ctx, svc) -> None:
        candidate = _make_candidate(location_city="Curitiba", location_state="PR", location_country="BR")
        svc.get.return_value = candidate
        result = await get_candidate_summary(ctx, str(candidate.id), svc)
        assert result.ok is True
        # "BR" is omitted since it's the default country
        assert result.data["location"] == "Curitiba, PR"

    async def test_location_none_when_no_city_or_state(self, ctx, svc) -> None:
        candidate = _make_candidate(location_city=None, location_state=None, location_country="BR")
        svc.get.return_value = candidate
        result = await get_candidate_summary(ctx, str(candidate.id), svc)
        assert result.data["location"] is None


# ── search_candidates ─────────────────────────────────────────────────────────


class TestSearchCandidates:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([_make_summary()], 1)
        result = await search_candidates(ctx, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await search_candidates(ctx_no_perm, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        result = await search_candidates(ctx, svc)
        assert result.requires_approval is False

    async def test_respects_limit(self, ctx, svc) -> None:
        summaries = [_make_summary() for _ in range(3)]
        svc.list_summaries.return_value = (summaries, 3)
        result = await search_candidates(ctx, svc, limit=3)
        assert result.ok is True
        assert result.data["returned"] == 3
        call_kwargs = svc.list_summaries.call_args
        page_size = call_kwargs.kwargs.get("page_size") or call_kwargs.args[1]
        assert page_size == 3

    async def test_limit_capped_at_50(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        await search_candidates(ctx, svc, limit=999)
        call_kwargs = svc.list_summaries.call_args
        page_size = call_kwargs.kwargs.get("page_size") or call_kwargs.args[1]
        assert page_size <= 50

    async def test_limit_minimum_is_1(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        await search_candidates(ctx, svc, limit=0)
        call_kwargs = svc.list_summaries.call_args
        page_size = call_kwargs.kwargs.get("page_size") or call_kwargs.args[1]
        assert page_size >= 1

    async def test_result_shape_contains_candidates_total_returned(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([_make_summary()], 1)
        result = await search_candidates(ctx, svc)
        assert "candidates" in result.data
        assert "total" in result.data
        assert "returned" in result.data

    async def test_each_candidate_entry_has_required_fields(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([_make_summary()], 1)
        result = await search_candidates(ctx, svc)
        entry = result.data["candidates"][0]
        for field in ("id", "full_name", "email", "resume_count", "ai_status",
                      "active_job_title", "active_job_stage", "active_job_fit_score", "tags"):
            assert field in entry, f"Campo ausente no entry: {field}"

    async def test_search_result_has_no_sensitive_fields(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([_make_summary()], 1)
        result = await search_candidates(ctx, svc)
        entry = result.data["candidates"][0]
        for key in ("cpf", "salary_expectation", "password_hash", "google_sub", "internal_notes"):
            assert key not in entry, f"Campo sensível no resultado de busca: {key}"

    async def test_passes_query_to_service(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        await search_candidates(ctx, svc, query="Ana")
        call_kwargs = svc.list_summaries.call_args
        assert call_kwargs.kwargs.get("search") == "Ana"

    async def test_passes_seniority_to_service(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        await search_candidates(ctx, svc, seniority="senior")
        call_kwargs = svc.list_summaries.call_args
        assert call_kwargs.kwargs.get("seniority") == "senior"

    async def test_passes_has_resume_to_service(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        await search_candidates(ctx, svc, has_resume=True)
        call_kwargs = svc.list_summaries.call_args
        assert call_kwargs.kwargs.get("has_resume") is True

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.list_summaries.side_effect = RuntimeError("db failure")
        result = await search_candidates(ctx, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.list_summaries.return_value = ([], 0)
        await search_candidates(ctx, svc)
        svc.list_summaries.assert_called_once()


# ── get_candidate_profile_context ─────────────────────────────────────────────


class TestGetCandidateProfileContext:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_profile_context(ctx, str(mock_candidate.id), svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_candidate_profile_context(ctx_no_perm, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_requires_approval_is_false(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_profile_context(ctx, str(mock_candidate.id), svc)
        assert result.requires_approval is False

    async def test_returns_expected_shape(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_profile_context(ctx, str(mock_candidate.id), svc)
        data = result.data
        for field in ("candidate_id", "full_name", "location_city", "location_state",
                      "location_country", "linkedin_url", "github_url", "portfolio_url",
                      "tags", "desired_contract_type", "application_source",
                      "data_quality_status", "has_resume", "resume_parseable"):
            assert field in data, f"Campo ausente: {field}"

    async def test_does_not_expose_sensitive_fields(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_profile_context(ctx, str(mock_candidate.id), svc)
        data = result.data
        for key in _SENSITIVE_KEYS:
            assert key not in data, f"Campo sensível exposto: {key}"

    async def test_does_not_expose_internal_notes(self, ctx, svc) -> None:
        candidate = _make_candidate(internal_notes="Nota muito sigilosa")
        svc.get.return_value = candidate
        result = await get_candidate_profile_context(ctx, str(candidate.id), svc)
        assert result.ok is True
        assert "internal_notes" not in result.data
        assert "Nota muito sigilosa" not in str(result.data)

    async def test_has_resume_false_when_no_resume(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_status="no_resume")
        svc.get.return_value = candidate
        result = await get_candidate_profile_context(ctx, str(candidate.id), svc)
        assert result.data["has_resume"] is False

    async def test_has_resume_true_when_valid(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_status="valid")
        svc.get.return_value = candidate
        result = await get_candidate_profile_context(ctx, str(candidate.id), svc)
        assert result.data["has_resume"] is True

    async def test_resume_parseable_only_when_valid(self, ctx, svc) -> None:
        for status, expected in [
            ("valid", True),
            ("no_resume", False),
            ("parsing_failed", False),
            ("empty_resume", False),
            ("unknown", False),
        ]:
            candidate = _make_candidate(data_quality_status=status)
            svc.get.return_value = candidate
            result = await get_candidate_profile_context(ctx, str(candidate.id), svc)
            assert result.data["resume_parseable"] is expected, f"Falhou para status={status}"

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = CandidateNotFoundError()
        result = await get_candidate_profile_context(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("db failure")
        result = await get_candidate_profile_context(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_invalid_uuid_returns_controlled_error(self, ctx, svc) -> None:
        result = await get_candidate_profile_context(ctx, "not-valid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get.assert_not_called()

    async def test_uses_service_not_repository(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        await get_candidate_profile_context(ctx, str(mock_candidate.id), svc)
        svc.get.assert_called_once()


# ── get_candidate_resume_analysis_summary ────────────────────────────────────


class TestGetCandidateResumeAnalysisSummary:
    async def test_valid_permission_returns_ok(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_candidate_resume_analysis_summary(ctx_no_perm, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"

    async def test_requires_approval_is_false(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        assert result.requires_approval is False

    async def test_returns_expected_shape(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        data = result.data
        for field in ("candidate_id", "full_name", "analysis_status", "analysis_reason",
                      "analysis_checked_at", "has_resume", "resume_parseable",
                      "resume_raw_text_available"):
            assert field in data, f"Campo ausente: {field}"

    async def test_returns_safe_summary_not_raw_document(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True
        # Deve indicar explicitamente que texto bruto NÃO está disponível
        assert result.data["resume_raw_text_available"] is False

    async def test_does_not_expose_raw_resume_text(self, ctx, svc, mock_candidate) -> None:
        mock_candidate.raw_resume = "Curriculo bruto com telefone +55 11 99999-0000"
        svc.get.return_value = mock_candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        assert result.ok is True
        serialized = str(result.data)
        assert "raw_resume" not in result.data
        assert "Curriculo bruto com telefone" not in serialized

    async def test_does_not_expose_sensitive_fields(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        data = result.data
        for key in _SENSITIVE_KEYS:
            assert key not in data, f"Campo sensível exposto: {key}"

    async def test_analysis_status_reflects_data_quality(self, ctx, svc) -> None:
        for status in ("valid", "no_resume", "empty_resume", "parsing_failed", "unknown", "invalid"):
            candidate = _make_candidate(data_quality_status=status)
            svc.get.return_value = candidate
            result = await get_candidate_resume_analysis_summary(ctx, str(candidate.id), svc)
            assert result.data["analysis_status"] == status

    async def test_has_resume_false_when_no_resume(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_status="no_resume")
        svc.get.return_value = candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(candidate.id), svc)
        assert result.data["has_resume"] is False

    async def test_resume_parseable_true_only_for_valid(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_status="valid")
        svc.get.return_value = candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(candidate.id), svc)
        assert result.data["resume_parseable"] is True

    async def test_resume_parseable_false_for_failed(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_status="parsing_failed")
        svc.get.return_value = candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(candidate.id), svc)
        assert result.data["resume_parseable"] is False

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = CandidateNotFoundError()
        result = await get_candidate_resume_analysis_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get.side_effect = RuntimeError("db failure")
        result = await get_candidate_resume_analysis_summary(ctx, str(uuid4()), svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_invalid_uuid_returns_controlled_error(self, ctx, svc) -> None:
        result = await get_candidate_resume_analysis_summary(ctx, "bad-id", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get.assert_not_called()

    async def test_uses_service_not_repository(self, ctx, svc, mock_candidate) -> None:
        svc.get.return_value = mock_candidate
        await get_candidate_resume_analysis_summary(ctx, str(mock_candidate.id), svc)
        svc.get.assert_called_once()

    async def test_analysis_checked_at_is_isoformat_or_none(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_marked_at=datetime(2024, 5, 1, tzinfo=UTC))
        svc.get.return_value = candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(candidate.id), svc)
        assert isinstance(result.data["analysis_checked_at"], str)

    async def test_analysis_checked_at_none_when_absent(self, ctx, svc) -> None:
        candidate = _make_candidate(data_quality_marked_at=None)
        svc.get.return_value = candidate
        result = await get_candidate_resume_analysis_summary(ctx, str(candidate.id), svc)
        assert result.data["analysis_checked_at"] is None
