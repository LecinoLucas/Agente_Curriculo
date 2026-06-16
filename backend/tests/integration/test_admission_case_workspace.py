from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

import httpx
import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionCaseModel,
    PreAdmissionEventModel,
)

from .test_pre_admission import (
    _create_portal_session,
    _pdf_upload,
    _seed_pre_admission_with_item,
)


async def _upload_candidate_document(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    candidate_id: UUID,
    case: dict,
    item: dict,
    token: str = "workspace-upload",
) -> dict:
    await _create_portal_session(db_session, candidate_id, token)
    client.cookies.set("candidate_portal_token", token)
    response = await client.post(
        f"/api/v1/candidate-portal/pre-admission/{case['id']}/checklist-items/{item['id']}/documents",
        files=_pdf_upload("rg_workspace.pdf"),
    )
    client.cookies.clear()
    assert response.status_code == status.HTTP_201_CREATED, response.text
    return response.json()


@pytest.mark.asyncio
async def test_workspace_returns_case_candidate_active_job_checklist_documents_blockers_and_events(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
    )

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["case"]["id"] == case["id"]
    assert payload["candidate"]["id"] == str(candidate_id)
    assert payload["candidate"]["initials"]
    assert payload["job"]["id"] == str(job_id)
    assert payload["checklist"]["total"] == 1
    assert payload["checklist"]["items"][0]["id"] == item["id"]
    assert payload["checklist"]["items"][0]["document_id"] == document["id"]
    assert payload["documents"][0]["id"] == document["id"]
    assert payload["documents"][0]["checklist_item_id"] == item["id"]
    assert payload["documents"][0]["checklist_title"] == item["title"]
    assert payload["documents"][0]["filename"] == "rg_workspace.pdf"
    assert payload["documents"][0]["mime_type"] == "application/pdf"
    assert payload["documents"][0]["size_bytes"] > 0
    assert payload["documents"][0]["is_current_for_item"] is True
    assert payload["main_blockers"][0]["type"] == "pending_checklist_item"
    assert payload["summary"]["ready_for_export"] is False
    assert any(event["type"] == "document_uploaded" for event in payload["recent_events"])


@pytest.mark.asyncio
async def test_overview_is_lightweight_and_calculates_progress(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-overview",
    )

    extra_item_response = await client.post(
        f"/api/v1/pre-admission/{case['id']}/checklist-items",
        headers=headers,
        json={"item_type": "rg", "title": "RG", "required": True},
    )
    assert extra_item_response.status_code == status.HTTP_201_CREATED, extra_item_response.text
    extra_item = extra_item_response.json()
    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={"rejection_reason_public": "Reenvie o documento legível."},
    )
    assert reject_response.status_code == status.HTTP_200_OK, reject_response.text
    waive_response = await client.post(
        f"/api/v1/admission/checklist-items/{extra_item['id']}/mark-not-required",
        headers=headers,
    )
    assert waive_response.status_code == status.HTTP_200_OK, waive_response.text

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/overview",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["case"]["id"] == case["id"]
    assert payload["candidate"]["id"] == str(candidate_id)
    assert payload["job"]["id"] == str(job_id)
    assert payload["status_label"]
    assert payload["progress"] == {
        "total": 2,
        "approved": 0,
        "pending": 0,
        "rejected": 1,
        "in_review": 0,
        "waived": 1,
    }
    assert payload["main_blocker"]["type"] == "rejected_item"
    assert "documents" not in payload
    assert "recent_events" not in payload


@pytest.mark.asyncio
async def test_documents_endpoint_returns_checklist_and_staff_review_metadata(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-documents",
    )
    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Envie um PDF legível.",
            "review_notes": "Validar frente e verso no próximo envio.",
        },
    )
    assert reject_response.status_code == status.HTTP_200_OK, reject_response.text

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/documents",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["checklist"]["items"][0]["id"] == item["id"]
    assert payload["checklist"]["items"][0]["document_id"] == document["id"]
    assert payload["documents"][0]["id"] == document["id"]
    assert payload["documents"][0]["reviewed_by_name"] is not None
    assert payload["documents"][0]["reviewed_at"] is not None
    assert payload["documents"][0]["review_notes"] == "Validar frente e verso no próximo envio."
    assert payload["documents"][0]["rejection_reason_public"] == "Envie um PDF legível."


@pytest.mark.asyncio
async def test_events_endpoint_returns_paginated_items_most_recent_first(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    case_id = UUID(case["id"])
    base_time = datetime.now(UTC)
    for index in range(5):
        db_session.add(
            PreAdmissionEventModel(
                case_id=case_id,
                event_type=f"manual_event_{index}",
                actor_id=None,
                payload_json={"index": index},
                created_at=(base_time + timedelta(minutes=index)).replace(microsecond=0),
            )
        )
    await db_session.commit()

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/events?page=1&page_size=3",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["page"] == 1
    assert payload["page_size"] == 3
    assert payload["total"] >= 5
    assert len(payload["items"]) == 3
    assert payload["has_next"] is True
    created_at = [item["created_at"] for item in payload["items"]]
    assert created_at == sorted(created_at, reverse=True)


@pytest.mark.asyncio
async def test_staff_slice_endpoints_require_staff_auth_and_block_candidate_portal_session(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )

    unauthenticated = await client.get(f"/api/v1/pre-admission/cases/{case['id']}/overview")
    assert unauthenticated.status_code == status.HTTP_401_UNAUTHORIZED

    await _create_portal_session(db_session, candidate_id, "staff-slice-portal")
    client.cookies.set("candidate_portal_token", "staff-slice-portal")
    portal_response = await client.get(f"/api/v1/pre-admission/cases/{case['id']}/documents")
    client.cookies.clear()

    assert portal_response.status_code == status.HTTP_401_UNAUTHORIZED

    bridge_response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/protheus-bridge-summary"
    )
    assert bridge_response.status_code == status.HTTP_401_UNAUTHORIZED


def _bridge_http_response(payload: dict) -> httpx.Response:
    return httpx.Response(
        status_code=status.HTTP_200_OK,
        json=payload,
        request=httpx.Request("GET", "http://127.0.0.1:8010/internal/protheus/dashboard/status"),
    )


class _BridgeClientSuccess:
    last_url: str | None = None
    last_headers: dict[str, str] | None = None

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str, *, headers: dict[str, str] | None = None) -> httpx.Response:
        type(self).last_url = url
        type(self).last_headers = headers
        return _bridge_http_response(
            {
                "overall_status": "ready",
                "storage_mode": "memory",
                "logical_environment": "homolog",
                "real_send_enabled": False,
                "erp_allow_real_send": False,
                "latest_trace": {
                    "trace_id": "trace-123",
                    "action_type": "precheck",
                    "status": "success",
                    "blocked_reason": None,
                    "error_code": None,
                    "created_at": "2026-06-15T11:22:33Z",
                    "payload_raw": {"cpf": "123.456.789-00"},
                },
                "token": "secret-bridge-token",
                "headers": {"Authorization": "Bearer secret"},
            }
        )


class _BridgeClientTimeout:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str, *, headers: dict[str, str] | None = None) -> httpx.Response:
        raise httpx.ReadTimeout("bridge timeout")


class _BridgeClientNonExecBlocked:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str, *, headers: dict[str, str] | None = None) -> httpx.Response:
        return _bridge_http_response(
            {
                "overall_status": "warning",
                "storage_mode": "memory",
                "logical_environment": "homolog",
                "real_send_enabled": False,
                "erp_allow_real_send": False,
                "latest_trace": {
                    "trace_id": "trace-blocked",
                    "action_type": "precheck",
                    "status": "nonexec_blocked",
                    "blocked_reason": "malicious_would_execute",
                    "error_code": "ERR_NONEXEC_WOULD_EXECUTE_BLOCKED",
                    "created_at": "2026-06-15T11:30:00Z",
                    "headers": {"Authorization": "Bearer secret"},
                    "payload_raw": {"cpf": "123.456.789-00"},
                },
                "token": "secret-bridge-token",
                "headers": {"X-Internal-Api-Key": "dev-bridge-key-local"},
            }
        )


@pytest.mark.asyncio
async def test_protheus_bridge_summary_returns_sanitized_read_only_summary(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://127.0.0.1:8010")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "dev-bridge-key-local")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_DASHBOARD_URL", "http://localhost:5180")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_TIMEOUT_SECONDS", 2.0)

    with patch(
        "src.application.services.admission_case_workspace_service.httpx.AsyncClient",
        _BridgeClientSuccess,
    ):
        response = await client.get(
            f"/api/v1/pre-admission/cases/{case['id']}/protheus-bridge-summary",
            headers=headers,
        )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload == {
        "enabled": True,
        "available": True,
        "status": "ready",
        "message": "Bridge operacional para simulações seguras.",
        "environment": "homolog",
        "storage_mode": "memory",
        "readiness": "ready",
        "latest_trace": {
            "trace_id": "trace-123",
            "action_type": "precheck",
            "status": "success",
            "blocked_reason": None,
            "error_code": None,
            "created_at": "2026-06-15T11:22:33Z",
        },
        "safety": {
            "would_execute": False,
            "protheus_registration": None,
            "erp_send_attempted": False,
            "registration_routine_called": False,
        },
        "next_action": "Simulação segura disponível no cockpit técnico.",
        "dashboard_url": "http://localhost:5180",
    }
    assert _BridgeClientSuccess.last_url == "http://127.0.0.1:8010/internal/protheus/dashboard/status"
    assert _BridgeClientSuccess.last_headers == {"X-Internal-Api-Key": "dev-bridge-key-local"}
    serialized = response.text.lower()
    assert "authorization" not in serialized
    assert "x-internal-api-key" not in serialized
    assert "secret-bridge-token" not in serialized
    assert "123.456.789-00" not in serialized


@pytest.mark.asyncio
async def test_protheus_bridge_summary_maps_nonexec_blocked_to_blocked(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://127.0.0.1:8010")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "dev-bridge-key-local")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_DASHBOARD_URL", "http://localhost:5180")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_TIMEOUT_SECONDS", 2.0)

    with patch(
        "src.application.services.admission_case_workspace_service.httpx.AsyncClient",
        _BridgeClientNonExecBlocked,
    ):
        response = await client.get(
            f"/api/v1/pre-admission/cases/{case['id']}/protheus-bridge-summary",
            headers=headers,
        )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["enabled"] is True
    assert payload["available"] is True
    assert payload["status"] == "blocked"
    assert payload["next_action"] == (
        "Bloqueio de segurança detectado. Revise o cockpit técnico antes de prosseguir com novas simulações."
    )
    assert payload["latest_trace"] == {
        "trace_id": "trace-blocked",
        "action_type": "precheck",
        "status": "nonexec_blocked",
        "blocked_reason": "malicious_would_execute",
        "error_code": "ERR_NONEXEC_WOULD_EXECUTE_BLOCKED",
        "created_at": "2026-06-15T11:30:00Z",
    }
    assert payload["safety"] == {
        "would_execute": False,
        "protheus_registration": None,
        "erp_send_attempted": False,
        "registration_routine_called": False,
    }
    serialized = response.text.lower()
    assert "authorization" not in serialized
    assert "x-internal-api-key" not in serialized
    assert "secret-bridge-token" not in serialized
    assert "123.456.789-00" not in serialized


@pytest.mark.asyncio
async def test_protheus_bridge_summary_returns_disabled_when_feature_flag_is_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", False)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_DASHBOARD_URL", "http://localhost:5180")

    response = await client.get(
        f"/api/v1/pre-admission/cases/{case['id']}/protheus-bridge-summary",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json() == {
        "enabled": False,
        "available": False,
        "status": "disabled",
        "message": "Integração Protheus Bridge desativada neste ambiente.",
        "environment": None,
        "storage_mode": None,
        "readiness": None,
        "latest_trace": None,
        "safety": {
            "would_execute": False,
            "protheus_registration": None,
            "erp_send_attempted": False,
            "registration_routine_called": False,
        },
        "next_action": "Ative a bridge apenas em ambientes controlados de simulação técnica.",
        "dashboard_url": "http://localhost:5180",
    }


@pytest.mark.asyncio
async def test_protheus_bridge_summary_returns_unavailable_when_bridge_times_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://127.0.0.1:8010")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "dev-bridge-key-local")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_DASHBOARD_URL", "http://localhost:5180")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_TIMEOUT_SECONDS", 2.0)

    with patch(
        "src.application.services.admission_case_workspace_service.httpx.AsyncClient",
        _BridgeClientTimeout,
    ):
        response = await client.get(
            f"/api/v1/pre-admission/cases/{case['id']}/protheus-bridge-summary",
            headers=headers,
        )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json() == {
        "enabled": True,
        "available": False,
        "status": "unavailable",
        "message": "Protheus Bridge indisponível no momento.",
        "environment": None,
        "storage_mode": None,
        "readiness": None,
        "latest_trace": None,
        "safety": {
            "would_execute": False,
            "protheus_registration": None,
            "erp_send_attempted": False,
            "registration_routine_called": False,
        },
        "next_action": "Verifique se o serviço da bridge está rodando em modo memory ou full.",
        "dashboard_url": "http://localhost:5180",
    }


@pytest.mark.asyncio
async def test_workspace_incomplete_checklist_is_not_ready_for_export(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_200_OK
    payload = response.json()
    assert payload["summary"]["readiness_status"] == "not_ready"
    assert payload["summary"]["ready_for_export"] is False
    assert any(blocker["type"] == "missing_document" for blocker in payload["main_blockers"])


@pytest.mark.asyncio
async def test_workspace_all_required_items_approved_is_ready_for_export(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-ready",
    )

    response = await client.post(
        f"/api/v1/admission/checklist-items/{item['id']}/approve",
        headers=headers,
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    assert payload["checklist"]["approved"] == 1
    assert payload["summary"]["readiness_status"] == "ready"
    assert payload["summary"]["ready_for_export"] is True
    assert payload["main_blockers"] == []


@pytest.mark.asyncio
async def test_mark_ready_for_export_blocks_with_422_when_there_are_blockers(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, _candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )

    response = await client.post(
        f"/api/v1/admission/cases/{case['id']}/mark-ready-for-export",
        headers=headers,
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = response.json()["detail"]
    assert detail["blockers"]
    assert detail["blockers"][0]["type"] == "missing_document"


@pytest.mark.asyncio
async def test_mark_ready_for_export_marks_case_and_creates_event_when_ready(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-mark-ready",
    )
    await client.post(f"/api/v1/admission/checklist-items/{item['id']}/approve", headers=headers)

    response = await client.post(
        f"/api/v1/admission/cases/{case['id']}/mark-ready-for-export",
        headers=headers,
    )
    db_case = await db_session.get(PreAdmissionCaseModel, UUID(case["id"]))
    event_count = int(
        await db_session.scalar(
            sa.select(sa.func.count(PreAdmissionEventModel.id)).where(
                PreAdmissionEventModel.case_id == UUID(case["id"]),
                PreAdmissionEventModel.event_type == "case_ready_for_export",
            )
        )
        or 0
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json()["summary"]["ready_for_export"] is True
    assert db_case is not None
    assert db_case.ready_for_export is True
    assert db_case.status == "ready_for_admission"
    assert event_count == 1


@pytest.mark.asyncio
async def test_approve_action_creates_event_and_recalculates_readiness(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-approve-event",
    )

    response = await client.post(
        f"/api/v1/admission/checklist-items/{item['id']}/approve",
        headers=headers,
    )
    event = await db_session.scalar(
        sa.select(PreAdmissionEventModel).where(
            PreAdmissionEventModel.case_id == UUID(case["id"]),
            PreAdmissionEventModel.event_type == "checklist_item_approved",
        )
    )

    assert response.status_code == status.HTTP_200_OK, response.text
    assert response.json()["summary"]["ready_for_export"] is True
    assert event is not None
    assert event.payload_json["checklist_item_id"] == item["id"]


@pytest.mark.asyncio
async def test_workspace_document_review_fields_keep_public_and_internal_texts_separate(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, _job_id, candidate_id, case, item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    document = await _upload_candidate_document(
        client,
        db_session,
        candidate_id=candidate_id,
        case=case,
        item=item,
        token="workspace-review-fields",
    )

    reject_response = await client.post(
        f"/api/v1/pre-admission/documents/{document['id']}/reject",
        headers=headers,
        json={
            "rejection_reason_public": "Envie uma imagem legível do documento.",
            "review_notes": "Conferir assinatura em eventual reenvio.",
        },
    )
    assert reject_response.status_code == status.HTTP_200_OK, reject_response.text

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_200_OK, response.text
    payload = response.json()
    workspace_document = payload["documents"][0]
    assert workspace_document["status"] == "rejected"
    assert workspace_document["rejection_reason_public"] == "Envie uma imagem legível do documento."
    assert workspace_document["review_notes"] == "Conferir assinatura em eventual reenvio."
    assert workspace_document["reviewed_at"] is not None
    assert workspace_document["reviewed_by_name"] is not None
    assert all("review_notes" not in event["description"] for event in payload["recent_events"])


def test_workspace_service_does_not_use_legacy_analysis_or_link_fallbacks() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    source = (
        backend_dir / "src/application/services/admission_case_workspace_service.py"
    ).read_text()

    assert "latest_analysis" not in source
    assert "candidate_job_links" not in source
    assert "current_analysis_id" not in source


@pytest.mark.asyncio
async def test_workspace_blocks_case_when_pipeline_is_inactive(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    headers, job_id, candidate_id, case, _item = await _seed_pre_admission_with_item(
        client,
        db_session,
    )
    pipeline = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_id,
        )
    )
    assert pipeline is not None
    pipeline.pipeline_status = "terminal"
    pipeline.relationship_status = "withdrawn"
    pipeline.is_terminal = True
    pipeline.terminated_at = datetime.now(UTC)
    pipeline.termination_reason = "Teste de pipeline inativo"
    await db_session.commit()

    response = await client.get(f"/api/v1/admission/cases/{case['id']}/workspace", headers=headers)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
