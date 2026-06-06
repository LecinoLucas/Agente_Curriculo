"""Unit tests — AI Admission Tools (Fase AI-TOOLS-4).

Todas as tools são read-only. Nenhuma chamada real a banco ou LLM.
AdmissionCaseWorkspaceService e AdmissionPackageService são sempre mockados.
"""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.tools.admission_tools import (
    get_admission_case_summary,
    get_admission_checklist_status,
    get_admission_documents_status,
    get_admission_events_summary,
)
from src.ai_orchestration.tools.protheus_tools import get_protheus_export_status
from src.domain.exceptions import NotFoundException, ValidationException


# ── Helpers ──────────────────────────────────────────────────────────────────


def _ctx(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id="user-test",
        role="recruiter",
        permissions=permissions if permissions is not None else [
            "can_view_admissions",
            "can_view_protheus_status",
        ],
        request_id="req-test",
        session_id="sess-test",
    )


_CASE_ID = str(uuid4())
_PKG_ID = str(uuid4())
_NOW = datetime(2024, 6, 1, 12, 0, tzinfo=UTC)


def _make_progress(**overrides: object) -> MagicMock:
    p = MagicMock()
    p.total = overrides.get("total", 5)
    p.approved = overrides.get("approved", 3)
    p.pending = overrides.get("pending", 1)
    p.rejected = overrides.get("rejected", 0)
    p.in_review = overrides.get("in_review", 0)
    p.waived = overrides.get("waived", 1)
    return p


def _make_integration_status(**overrides: object) -> MagicMock:
    s = MagicMock()
    s.state = overrides.get("state", "pending_export")
    s.label = overrides.get("label", "Aguardando Exportação")
    s.ready_for_export = overrides.get("ready_for_export", False)
    return s


def _make_summary_schema(**overrides: object) -> MagicMock:
    s = MagicMock()
    s.responsible_name = overrides.get("responsible_name", "Ana RH")
    s.created_at = overrides.get("created_at", _NOW)
    s.last_update_at = overrides.get("last_update_at", _NOW)
    s.readiness_status = overrides.get("readiness_status", "incomplete")
    s.ready_for_export = overrides.get("ready_for_export", False)
    return s


def _make_case_schema(**overrides: object) -> MagicMock:
    c = MagicMock()
    c.id = overrides.get("id", uuid4())
    c.status = overrides.get("status", "in_progress")
    c.current_stage = overrides.get("current_stage", "document_collection")
    c.created_at = overrides.get("created_at", _NOW)
    c.updated_at = overrides.get("updated_at", _NOW)
    return c


def _make_candidate_schema(**overrides: object) -> MagicMock:
    c = MagicMock()
    c.id = overrides.get("id", uuid4())
    c.name = overrides.get("name", "João Silva")
    c.initials = overrides.get("initials", "JS")
    return c


def _make_job_schema(**overrides: object) -> MagicMock:
    j = MagicMock()
    j.id = overrides.get("id", uuid4())
    j.title = overrides.get("title", "Desenvolvedor Python")
    return j


def _make_overview(**overrides: object) -> MagicMock:
    ov = MagicMock()
    ov.case = overrides.get("case", _make_case_schema())
    ov.candidate = overrides.get("candidate", _make_candidate_schema())
    ov.job = overrides.get("job", _make_job_schema())
    ov.status_label = overrides.get("status_label", "Em Andamento")
    ov.progress = overrides.get("progress", _make_progress())
    ov.integration_status = overrides.get("integration_status", _make_integration_status())
    ov.summary = overrides.get("summary", _make_summary_schema())
    ov.main_blocker = overrides.get("main_blocker", None)
    ov.next_action = overrides.get("next_action", None)
    ov.updated_at = overrides.get("updated_at", _NOW)
    return ov


def _make_checklist_item(**overrides: object) -> MagicMock:
    i = MagicMock()
    i.id = overrides.get("id", uuid4())
    i.title = overrides.get("title", "RG")
    i.status = overrides.get("status", "pending")
    i.required = overrides.get("required", True)
    i.position = overrides.get("position", 1)
    i.updated_at = overrides.get("updated_at", _NOW)
    i.updated_by_name = overrides.get("updated_by_name", "Ana RH")
    return i


def _make_checklist_summary(**overrides: object) -> MagicMock:
    s = MagicMock()
    s.total = overrides.get("total", 3)
    s.approved = overrides.get("approved", 1)
    s.pending = overrides.get("pending", 1)
    s.blocked = overrides.get("blocked", 1)
    s.items = overrides.get("items", [_make_checklist_item()])
    return s


def _make_workspace(**overrides: object) -> MagicMock:
    w = MagicMock()
    w.case = overrides.get("case", _make_case_schema())
    w.candidate = overrides.get("candidate", _make_candidate_schema())
    w.job = overrides.get("job", _make_job_schema())
    w.checklist = overrides.get("checklist", _make_checklist_summary())
    w.documents = overrides.get("documents", [])
    w.main_blockers = overrides.get("main_blockers", [])
    w.next_actions = overrides.get("next_actions", [])
    w.summary = overrides.get("summary", _make_summary_schema())
    w.recent_events = overrides.get("recent_events", [])
    return w


def _make_document(**overrides: object) -> MagicMock:
    d = MagicMock()
    d.id = overrides.get("id", uuid4())
    d.checklist_item_id = overrides.get("checklist_item_id", uuid4())
    d.checklist_title = overrides.get("checklist_title", "RG")
    d.required = overrides.get("required", True)
    d.filename = overrides.get("filename", "rg.pdf")
    d.document_type = overrides.get("document_type", "identity")
    d.mime_type = overrides.get("mime_type", "application/pdf")
    d.size_bytes = overrides.get("size_bytes", 102400)
    d.status = overrides.get("status", "pending_review")
    d.uploaded_at = overrides.get("uploaded_at", _NOW)
    d.reviewed_at = overrides.get("reviewed_at", None)
    d.reviewed_by_name = overrides.get("reviewed_by_name", None)
    d.review_notes = overrides.get("review_notes", "Nota interna sigilosa do revisor")
    d.rejection_reason_public = overrides.get("rejection_reason_public", None)
    d.approved_at = overrides.get("approved_at", None)
    d.is_current_for_item = overrides.get("is_current_for_item", True)
    return d


def _make_docs_response(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.checklist = overrides.get("checklist", _make_checklist_summary())
    r.documents = overrides.get("documents", [_make_document()])
    return r


def _make_event(**overrides: object) -> MagicMock:
    e = MagicMock()
    e.id = overrides.get("id", uuid4())
    e.type = overrides.get("type", "document_uploaded")
    e.title = overrides.get("title", "Documento Enviado")
    e.description = overrides.get("description", "Candidato enviou RG.")
    e.actor_name = overrides.get("actor_name", "João Silva")
    e.created_at = overrides.get("created_at", _NOW)
    return e


def _make_events_response(**overrides: object) -> MagicMock:
    r = MagicMock()
    r.items = overrides.get("items", [_make_event()])
    r.total = overrides.get("total", 1)
    r.page = overrides.get("page", 1)
    r.page_size = overrides.get("page_size", 20)
    r.has_next = overrides.get("has_next", False)
    return r


def _make_package(**overrides: object) -> MagicMock:
    pkg = MagicMock()
    pkg.id = overrides.get("id", uuid4())
    pkg.case_id = overrides.get("case_id", uuid4())
    pkg.candidate_id = overrides.get("candidate_id", uuid4())
    pkg.job_id = overrides.get("job_id", uuid4())
    pkg.status = overrides.get("status", "draft")
    pkg.payload_json = overrides.get("payload_json", {"cpf": "000.000.000-00", "erp_data": {}})
    pkg.validation_errors_json = overrides.get("validation_errors_json", None)
    pkg.created_by = overrides.get("created_by", uuid4())
    pkg.approved_by = overrides.get("approved_by", None)
    pkg.exported_by = overrides.get("exported_by", None)
    pkg.created_at = overrides.get("created_at", _NOW)
    pkg.updated_at = overrides.get("updated_at", _NOW)
    pkg.approved_at = overrides.get("approved_at", None)
    pkg.exported_at = overrides.get("exported_at", None)
    pkg.cancelled_at = overrides.get("cancelled_at", None)
    return pkg


@pytest.fixture
def ctx() -> AgentContext:
    return _ctx()


@pytest.fixture
def ctx_no_adm() -> AgentContext:
    return _ctx(["can_view_protheus_status"])


@pytest.fixture
def ctx_no_protheus() -> AgentContext:
    return _ctx(["can_view_admissions"])


@pytest.fixture
def ctx_empty() -> AgentContext:
    return _ctx([])


@pytest.fixture
def svc() -> MagicMock:
    service = MagicMock()
    service.get_overview = AsyncMock()
    service.get_workspace = AsyncMock()
    service.get_documents = AsyncMock()
    service.get_events = AsyncMock()
    return service


@pytest.fixture
def pkg_svc() -> MagicMock:
    service = MagicMock()
    service.get_export_payload = AsyncMock()
    return service


# ── get_admission_case_summary ────────────────────────────────────────────────


class TestGetAdmissionCaseSummary:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview()
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_adm, svc) -> None:
        result = await get_admission_case_summary(ctx_no_adm, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_overview.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview()
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_admission_case_summary(ctx, "not-a-uuid", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_overview.assert_not_called()

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_overview.side_effect = NotFoundException("case not found")
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_overview.side_effect = RuntimeError("db crash")
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_overview.side_effect = RuntimeError("crash")
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview()
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        data = result.data
        for field in ("case_id", "status", "current_stage", "status_label",
                      "candidate_id", "candidate_name", "job_id", "job_title",
                      "ready_for_export", "readiness_status", "progress",
                      "integration_status", "main_blocker", "next_action",
                      "created_at", "updated_at"):
            assert field in data, f"Campo ausente: {field}"

    async def test_progress_has_all_counts(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview()
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        prog = result.data["progress"]
        for field in ("total", "approved", "pending", "rejected", "in_review", "waived"):
            assert field in prog, f"Campo ausente em progress: {field}"

    async def test_integration_status_has_required_fields(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview()
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        integ = result.data["integration_status"]
        for field in ("state", "label", "ready_for_export"):
            assert field in integ, f"Campo ausente em integration_status: {field}"

    async def test_main_blocker_none_when_absent(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview(main_blocker=None)
        result = await get_admission_case_summary(ctx, _CASE_ID, svc)
        assert result.data["main_blocker"] is None

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_overview.return_value = _make_overview()
        await get_admission_case_summary(ctx, _CASE_ID, svc)
        svc.get_overview.assert_called_once()


# ── get_admission_checklist_status ────────────────────────────────────────────


class TestGetAdmissionChecklistStatus:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_workspace.return_value = _make_workspace()
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_adm, svc) -> None:
        result = await get_admission_checklist_status(ctx_no_adm, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_workspace.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_workspace.return_value = _make_workspace()
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_admission_checklist_status(ctx, "bad", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_workspace.assert_not_called()

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_workspace.side_effect = NotFoundException("not found")
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_workspace.side_effect = RuntimeError("crash")
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_workspace.side_effect = RuntimeError("crash")
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_workspace.return_value = _make_workspace()
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        data = result.data
        for field in ("case_id", "total_items", "approved_count", "pending_count",
                      "blocked_count", "rejected_count", "not_required_count", "items"):
            assert field in data, f"Campo ausente: {field}"

    async def test_counts_not_required_from_items(self, ctx, svc) -> None:
        items = [
            _make_checklist_item(status="approved"),
            _make_checklist_item(status="waived"),
            _make_checklist_item(status="not_required"),
            _make_checklist_item(status="pending"),
        ]
        checklist = _make_checklist_summary(items=items)
        svc.get_workspace.return_value = _make_workspace(checklist=checklist)
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert result.data["not_required_count"] == 2

    async def test_counts_rejected_from_items(self, ctx, svc) -> None:
        items = [
            _make_checklist_item(status="rejected"),
            _make_checklist_item(status="correction_needed"),
            _make_checklist_item(status="approved"),
        ]
        checklist = _make_checklist_summary(items=items)
        svc.get_workspace.return_value = _make_workspace(checklist=checklist)
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        assert result.data["rejected_count"] == 2

    async def test_items_have_required_fields(self, ctx, svc) -> None:
        svc.get_workspace.return_value = _make_workspace()
        result = await get_admission_checklist_status(ctx, _CASE_ID, svc)
        item = result.data["items"][0]
        for field in ("id", "title", "status", "required", "position", "updated_at"):
            assert field in item, f"Campo ausente em item: {field}"

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_workspace.return_value = _make_workspace()
        await get_admission_checklist_status(ctx, _CASE_ID, svc)
        svc.get_workspace.assert_called_once()


# ── get_admission_documents_status ────────────────────────────────────────────


class TestGetAdmissionDocumentsStatus:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_documents.return_value = _make_docs_response()
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_adm, svc) -> None:
        result = await get_admission_documents_status(ctx_no_adm, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_documents.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_documents.return_value = _make_docs_response()
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_admission_documents_status(ctx, "bad-id", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_documents.assert_not_called()

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_documents.side_effect = NotFoundException("not found")
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_documents.side_effect = RuntimeError("crash")
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_documents.side_effect = RuntimeError("crash")
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_review_notes_never_in_document_entries(self, ctx, svc) -> None:
        """review_notes são notas internas do revisor — nunca devem vazar."""
        doc = _make_document(review_notes="Nota interna confidencial do revisor")
        svc.get_documents.return_value = _make_docs_response(documents=[doc])
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert result.ok is True
        for d in result.data["documents"]:
            assert "review_notes" not in d, "'review_notes' não deve aparecer na resposta"

    async def test_no_raw_file_content_in_response(self, ctx, svc) -> None:
        """Nenhum campo de bytes/conteúdo de arquivo deve aparecer."""
        svc.get_documents.return_value = _make_docs_response()
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        assert result.ok is True
        for d in result.data["documents"]:
            for forbidden in ("content", "bytes", "file_content", "raw_text", "ocr_text"):
                assert forbidden not in d, f"Campo proibido '{forbidden}' na resposta"

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_documents.return_value = _make_docs_response()
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        for field in ("case_id", "checklist_summary", "documents", "total_documents"):
            assert field in result.data, f"Campo ausente: {field}"

    async def test_document_entry_has_required_fields(self, ctx, svc) -> None:
        svc.get_documents.return_value = _make_docs_response()
        result = await get_admission_documents_status(ctx, _CASE_ID, svc)
        doc = result.data["documents"][0]
        for field in ("id", "checklist_title", "filename", "status",
                      "uploaded_at", "rejection_reason_public", "is_current_for_item"):
            assert field in doc, f"Campo ausente em document: {field}"

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_documents.return_value = _make_docs_response()
        await get_admission_documents_status(ctx, _CASE_ID, svc)
        svc.get_documents.assert_called_once()


# ── get_admission_events_summary ─────────────────────────────────────────────


class TestGetAdmissionEventsSummary:
    async def test_valid_permission_returns_ok(self, ctx, svc) -> None:
        svc.get_events.return_value = _make_events_response()
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_adm, svc) -> None:
        result = await get_admission_events_summary(ctx_no_adm, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        svc.get_events.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, svc) -> None:
        svc.get_events.return_value = _make_events_response()
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, svc) -> None:
        result = await get_admission_events_summary(ctx, "bad-id", svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        svc.get_events.assert_not_called()

    async def test_not_found_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_events.side_effect = NotFoundException("not found")
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, svc) -> None:
        svc.get_events.side_effect = RuntimeError("crash")
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, svc) -> None:
        svc.get_events.side_effect = RuntimeError("crash")
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        assert "Traceback" not in (result.message or "")

    async def test_no_payload_json_in_events(self, ctx, svc) -> None:
        """payload_json é dado interno — nunca deve aparecer na resposta."""
        svc.get_events.return_value = _make_events_response()
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        assert result.ok is True
        for e in result.data["events"]:
            assert "payload_json" not in e, "'payload_json' não deve aparecer nos eventos"
            assert "payload" not in e, "'payload' não deve aparecer nos eventos"

    async def test_returns_expected_shape(self, ctx, svc) -> None:
        svc.get_events.return_value = _make_events_response()
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        for field in ("case_id", "events", "total", "page", "page_size", "has_next"):
            assert field in result.data, f"Campo ausente: {field}"

    async def test_event_entry_has_required_fields(self, ctx, svc) -> None:
        svc.get_events.return_value = _make_events_response()
        result = await get_admission_events_summary(ctx, _CASE_ID, svc)
        event = result.data["events"][0]
        for field in ("id", "type", "title", "description", "actor_name", "created_at"):
            assert field in event, f"Campo ausente em event: {field}"

    async def test_page_size_capped_at_50(self, ctx, svc) -> None:
        svc.get_events.return_value = _make_events_response()
        await get_admission_events_summary(ctx, _CASE_ID, svc, page_size=999)
        call_kwargs = svc.get_events.call_args
        ps = call_kwargs.kwargs.get("page_size") or call_kwargs.args[2]
        assert ps <= 50

    async def test_uses_service_not_repository(self, ctx, svc) -> None:
        svc.get_events.return_value = _make_events_response()
        await get_admission_events_summary(ctx, _CASE_ID, svc)
        svc.get_events.assert_called_once()


# ── get_protheus_export_status ────────────────────────────────────────────────


class TestGetProtheusExportStatus:
    async def test_valid_permission_returns_ok(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.return_value = _make_package()
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.ok is True

    async def test_missing_permission_returns_permission_denied(self, ctx_no_protheus, pkg_svc) -> None:
        result = await get_protheus_export_status(ctx_no_protheus, _PKG_ID, pkg_svc)
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        pkg_svc.get_export_payload.assert_not_called()

    async def test_requires_approval_is_false(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.return_value = _make_package()
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.requires_approval is False

    async def test_invalid_uuid_returns_invalid_input(self, ctx, pkg_svc) -> None:
        result = await get_protheus_export_status(ctx, "not-a-uuid", pkg_svc)
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"
        pkg_svc.get_export_payload.assert_not_called()

    async def test_validation_exception_returns_not_found(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.side_effect = ValidationException("package not found")
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.ok is False
        assert result.error_code == "NOT_FOUND"

    async def test_internal_error_returns_controlled_error(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.side_effect = RuntimeError("crash")
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"

    async def test_no_stack_trace_in_message(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.side_effect = RuntimeError("crash")
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert "Traceback" not in (result.message or "")

    async def test_payload_json_never_in_response(self, ctx, pkg_svc) -> None:
        """payload_json contém dados completos do ERP — nunca deve aparecer."""
        pkg = _make_package(payload_json={"cpf": "000.000.000-00", "salary": 5000, "department": "TI"})
        pkg_svc.get_export_payload.return_value = pkg
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.ok is True
        assert "payload_json" not in result.data, "'payload_json' não deve aparecer na resposta"
        assert "payload" not in result.data, "'payload' não deve aparecer na resposta"

    async def test_created_by_uuid_not_in_response(self, ctx, pkg_svc) -> None:
        """UUIDs de created_by/approved_by/exported_by são desnecessários sem lookup."""
        pkg_svc.get_export_payload.return_value = _make_package()
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.ok is True
        for field in ("created_by", "approved_by", "exported_by"):
            assert field not in result.data, f"UUID '{field}' não deve aparecer na resposta"

    async def test_returns_expected_shape(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.return_value = _make_package()
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        for field in ("package_id", "case_id", "candidate_id", "job_id", "status",
                      "has_validation_errors", "validation_errors",
                      "created_at", "updated_at", "approved_at", "exported_at", "cancelled_at"):
            assert field in result.data, f"Campo ausente: {field}"

    async def test_validation_errors_list_returned_when_present(self, ctx, pkg_svc) -> None:
        errors = ["Item 'CPF' não aprovado", "Item 'Contrato' pendente"]
        pkg_svc.get_export_payload.return_value = _make_package(validation_errors_json=errors)
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert result.data["has_validation_errors"] is True
        assert result.data["validation_errors"] == errors

    async def test_validation_errors_truncated_at_10(self, ctx, pkg_svc) -> None:
        errors = [f"Error {i}" for i in range(15)]
        pkg_svc.get_export_payload.return_value = _make_package(validation_errors_json=errors)
        result = await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        assert len(result.data["validation_errors"]) <= 10
        assert result.data["validation_errors_truncated"] is True

    async def test_uses_service_not_repository(self, ctx, pkg_svc) -> None:
        pkg_svc.get_export_payload.return_value = _make_package()
        await get_protheus_export_status(ctx, _PKG_ID, pkg_svc)
        pkg_svc.get_export_payload.assert_called_once()
