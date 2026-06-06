"""Unit tests — AI Pipeline Tools (Fase AI-TOOLS-3).

Todas as tools são read-only. Nenhuma chamada real a banco ou LLM.
PipelineService é sempre mockado para garantir isolamento da camada de repository.
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.tools.pipeline_tools import (
    get_candidate_pipeline_history,
    get_candidate_pipeline_position,
    get_job_pipeline_overview,
    search_pipeline_candidates,
)
from src.application.services.pipeline_service import (
    PipelineCandidateNotFoundError,
    PipelineEntryNotFoundError,
    PipelineJobNotFoundError,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ctx(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id="user-test",
        role="recruiter",
        permissions=permissions if permissions is not None else ["can_view_pipeline"],
        request_id="req-test",
        session_id="sess-test",
    )


_JOB_ID = str(uuid4())
_CANDIDATE_ID = str(uuid4())
_NOW = datetime(2024, 6, 1, 12, 0, tzinfo=UTC)


def _make_match(**overrides: object) -> MagicMock:
    m = MagicMock()
    m.candidate_id = overrides.get("candidate_id", uuid4())
    m.candidate_name = overrides.get("candidate_name", "João Silva")
    m.job_id = overrides.get("job_id", uuid4())
    m.stage = overrides.get("stage", "screening")
    m.candidate_status = overrides.get("candidate_status", "active")
    m.status = overrides.get("status", "active")
    m.entered_at = overrides.get("entered_at", _NOW)
    m.top_skills = overrides.get("top_skills", ["Python", "FastAPI"])
    m.updated_at = overrides.get("updated_at", _NOW)
    m.ai_status = overrides.get("ai_status", "scored")
    m.job_fit_score = overrides.get("job_fit_score", Decimal("78.5"))
    return m


def _make_transition(**overrides: object) -> MagicMock:
    t = MagicMock()
    t.from_stage = overrides.get("from_stage", "entry")
    t.to_stage = overrides.get("to_stage", "screening")
    t.moved_by = overrides.get("moved_by", uuid4())
    t.moved_by_name = overrides.get("moved_by_name", "Ana Recrutadora")
    t.moved_at = overrides.get("moved_at", _NOW)
    t.trigger = overrides.get("trigger", "manual")
    t.reason = overrides.get("reason", None)
    t.notes = overrides.get("notes", "Nota interna sensível do recrutador")
    return t


def _make_history(**overrides: object) -> MagicMock:
    h = MagicMock()
    h.candidate_id = overrides.get("candidate_id", uuid4())
    h.candidate_name = overrides.get("candidate_name", "João Silva")
    h.job_id = overrides.get("job_id", uuid4())
    h.job_title = overrides.get("job_title", "Desenvolvedor Python")
    h.current_stage = overrides.get("current_stage", "hr_interview")
    h.status = overrides.get("status", "active")
    h.entered_at = overrides.get("entered_at", _NOW)
    h.updated_at = overrides.get("updated_at", _NOW)
    h.transitions = overrides.get("transitions", [_make_transition()])
    return h


def _make_column(stage: str, candidates: list | None = None) -> MagicMock:
    from src.application.services.pipeline_service import STAGE_LABELS
    col = MagicMock()
    col.stage = stage
    col.label = STAGE_LABELS.get(stage, stage)
    col.candidates = candidates if candidates is not None else []
    return col


def _make_board(columns: list | None = None, *, truncated: bool = False) -> MagicMock:
    board = MagicMock()
    board.job_id = uuid4()
    board.truncated = truncated
    board.columns = columns if columns is not None else [
        _make_column("entry"),
        _make_column("screening", [_make_match(stage="screening")]),
        _make_column("hr_interview"),
    ]
    return board


@pytest.fixture
def ctx() -> AgentContext:
    return _ctx()


@pytest.fixture
def ctx_no_perm() -> AgentContext:
    return _ctx([])


@pytest.fixture
def svc() -> MagicMock:
    service = MagicMock()
    service.get_board = AsyncMock()
    service.get_candidate_history = AsyncMock()
    service.list_job_matches = AsyncMock()
    return service


# ── get_job_pipeline_overview ─────────────────────────────────────────────────


class TestGetJobPipelineOverview:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_board.return_value = _make_board()
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_job_pipeline_overview(ctx_no_perm, _JOB_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_board.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_board.return_value = _make_board()
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_job_pipeline_overview(ctx, "not-a-uuid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_board.assert_not_called()

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_board.side_effect = PipelineJobNotFoundError
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_board.side_effect = RuntimeError("db failure")
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_board.side_effect = RuntimeError("crash")
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_board.return_value = _make_board()
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        data = result.data
        for field in ("job_id", "total_candidates", "truncated", "stage_summary", "bottleneck_stage"):
            assert field in data, f"Campo ausente: {field}"

    async def test_stage_summary_has_required_fields(self, ctx, svc) -> None:
        svc.get_board.return_value = _make_board()
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        entry = result.data["stage_summary"][0]
        for field in ("stage", "label", "count", "stage_order", "is_terminal"):
            assert field in entry, f"Campo ausente em stage_summary entry: {field}"

    async def test_total_candidates_is_sum_of_columns(self, ctx, svc) -> None:
        board = _make_board(columns=[
            _make_column("entry", [_make_match(), _make_match()]),
            _make_column("screening", [_make_match()]),
            _make_column("hr_interview"),
        ])
        svc.get_board.return_value = board
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.data["total_candidates"] == 3

    async def test_bottleneck_is_none_when_no_active_candidates(self, ctx, svc) -> None:
        board = _make_board(columns=[_make_column("entry"), _make_column("screening")])
        svc.get_board.return_value = board
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.data["bottleneck_stage"] is None

    async def test_bottleneck_identifies_busiest_active_stage(self, ctx, svc) -> None:
        board = _make_board(columns=[
            _make_column("entry", [_make_match()]),
            _make_column("screening", [_make_match(), _make_match(), _make_match()]),
            _make_column("hr_interview", [_make_match()]),
        ])
        svc.get_board.return_value = board
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.data["bottleneck_stage"] == "screening"

    async def test_truncated_flag_propagated(self, ctx, svc) -> None:
        svc.get_board.return_value = _make_board(truncated=True)
        result = await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        assert result.data["truncated"] is True

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_board.return_value = _make_board()
        await get_job_pipeline_overview(ctx, _JOB_ID, svc)
        svc.get_board.assert_called_once()


# ── get_candidate_pipeline_position ──────────────────────────────────────────


class TestGetCandidatePipelinePosition:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_candidate_pipeline_position(ctx_no_perm, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_candidate_history.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_job_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_candidate_pipeline_position(ctx, "bad-id", _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_candidate_history.assert_not_called()

    async def test_invalid_candidate_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, "bad-id", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_candidate_history.assert_not_called()

    async def test_job_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = PipelineJobNotFoundError
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_candidate_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = PipelineCandidateNotFoundError
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_entry_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = PipelineEntryNotFoundError
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = RuntimeError("db failure")
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = RuntimeError("crash")
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        result = await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        data = result.data
        for field in ("candidate_id", "candidate_name", "job_id", "job_title",
                      "current_stage", "stage_label", "stage_order",
                      "is_terminal_stage", "status", "entered_at", "updated_at"):
            assert field in data, f"Campo ausente: {field}"

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        await get_candidate_pipeline_position(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        svc.get_candidate_history.assert_called_once()


# ── get_candidate_pipeline_history ────────────────────────────────────────────


class TestGetCandidatePipelineHistory:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await get_candidate_pipeline_history(ctx_no_perm, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_candidate_history.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_candidate_pipeline_history(ctx, "bad", _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_candidate_history.assert_not_called()

    async def test_job_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = PipelineJobNotFoundError
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_candidate_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = PipelineCandidateNotFoundError
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_entry_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = PipelineEntryNotFoundError
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = RuntimeError("db failure")
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_candidate_history.side_effect = RuntimeError("crash")
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_notes_never_present_in_transitions(self, ctx, svc) -> None:
        """notes é texto livre de recrutador — nunca deve vazar para o agente."""
        transition = _make_transition(notes="Candidato tem histórico problemático.")
        svc.get_candidate_history.return_value = _make_history(transitions=[transition])
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is True
        for t in result.data["transitions"]:
            assert "notes" not in t, "Campo 'notes' não deve aparecer na resposta da tool"

    async def test_moved_by_uuid_not_in_transitions(self, ctx, svc) -> None:
        """O UUID do usuário que moveu é desnecessário sem contexto — omitir."""
        transition = _make_transition()
        svc.get_candidate_history.return_value = _make_history(transitions=[transition])
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.ok is True
        for t in result.data["transitions"]:
            assert "moved_by" not in t, "UUID 'moved_by' não deve aparecer na resposta"

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        data = result.data
        for field in ("candidate_id", "candidate_name", "job_id", "job_title",
                      "current_stage", "stage_label", "status",
                      "entered_at", "updated_at", "transitions", "transitions_count"):
            assert field in data, f"Campo ausente: {field}"

    async def test_transition_has_required_safe_fields(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history(
            transitions=[_make_transition()]
        )
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        t = result.data["transitions"][0]
        for field in ("from_stage", "to_stage", "moved_by_name", "moved_at", "trigger"):
            assert field in t, f"Campo esperado ausente em transition: {field}"

    async def test_transitions_count_matches_list_length(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history(
            transitions=[_make_transition(), _make_transition()]
        )
        result = await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        assert result.data["transitions_count"] == 2
        assert len(result.data["transitions"]) == 2

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_candidate_history.return_value = _make_history()
        await get_candidate_pipeline_history(ctx, _JOB_ID, _CANDIDATE_ID, svc)
        svc.get_candidate_history.assert_called_once()


# ── search_pipeline_candidates ────────────────────────────────────────────────


class TestSearchPipelineCandidates:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = [_make_match()]
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_perm, svc) -> None:
        result = await search_pipeline_candidates(ctx_no_perm, _JOB_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.list_job_matches.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = []
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await search_pipeline_candidates(ctx, "not-a-uuid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.list_job_matches.assert_not_called()

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.list_job_matches.side_effect = PipelineJobNotFoundError
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.list_job_matches.side_effect = RuntimeError("db failure")
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.list_job_matches.side_effect = RuntimeError("crash")
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_limit_capped_at_50(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = []
        await search_pipeline_candidates(ctx, _JOB_ID, svc, limit=999)
        call_kwargs = svc.list_job_matches.call_args
        max_rows = call_kwargs.kwargs.get("max_rows") or call_kwargs.args[1]
        assert max_rows <= 50

    async def test_limit_minimum_is_1(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = []
        await search_pipeline_candidates(ctx, _JOB_ID, svc, limit=0)
        call_kwargs = svc.list_job_matches.call_args
        max_rows = call_kwargs.kwargs.get("max_rows") or call_kwargs.args[1]
        assert max_rows >= 1

    async def test_stage_filter_applied_client_side(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = [
            _make_match(stage="entry"),
            _make_match(stage="screening"),
            _make_match(stage="screening"),
        ]
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc, stage="screening")
        assert result.ok is True
        assert result.data["returned"] == 2
        for c in result.data["candidates"]:
            assert c["stage"] == "screening"

    async def test_query_filter_applied_on_candidate_name(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = [
            _make_match(candidate_name="Ana Lima"),
            _make_match(candidate_name="Carlos Souza"),
        ]
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc, query="ana")
        assert result.ok is True
        assert result.data["returned"] == 1
        assert result.data["candidates"][0]["candidate_name"] == "Ana Lima"

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = [_make_match()]
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        data = result.data
        for field in ("job_id", "candidates", "returned"):
            assert field in data, f"Campo ausente: {field}"

    async def test_each_candidate_entry_has_required_fields(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = [_make_match()]
        result = await search_pipeline_candidates(ctx, _JOB_ID, svc)
        entry = result.data["candidates"][0]
        for field in ("candidate_id", "candidate_name", "stage", "stage_label",
                      "status", "ai_status", "job_fit_score", "top_skills"):
            assert field in entry, f"Campo ausente em candidate entry: {field}"

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.list_job_matches.return_value = []
        await search_pipeline_candidates(ctx, _JOB_ID, svc)
        svc.list_job_matches.assert_called_once()
