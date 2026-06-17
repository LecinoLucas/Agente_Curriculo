"""Integration tests for Protheus Export Queue endpoints.

These tests NEVER call the real Protheus Bridge or ERP. All HTTP calls to the
bridge are intercepted via patch("...httpx.AsyncClient", _MockClass).

Guardrails validated:
- INTERNAL_API_KEY never appears in any response body
- No real ERP call is made (httpx.AsyncClient is always mocked)
- No ExecAuto / MsExecAuto / GPEA010 is ever invoked
- Status labels are always PT-BR
- Unauthenticated requests are rejected
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch
from datetime import UTC, datetime
from uuid import UUID, uuid4

import httpx
import pytest
import sqlalchemy as sa
from fastapi import status
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.application.services.protheus_export_status import (
    can_cancel,
    can_request_new,
    can_show_export_button,
    payload_status_label_pt_br,
    status_label_pt_br,
)
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobUnitModel
from src.infrastructure.database.models.pre_admission_model import (
    PreAdmissionChecklistItemModel,
    PreAdmissionDocumentModel,
)
from src.infrastructure.storage.pre_admission_documents import (
    build_pre_admission_storage_key,
    write_pre_admission_document,
)

from .helpers import _auth_headers, _create_active_user
from .test_job_multiunit_backend import _create_operational_scope
from .test_pre_admission import _seed_pre_admission_with_item

# ── Bridge response fixtures ──────────────────────────────────────────────────

_EXPORT_ID = "exp-" + "a" * 28

_QUEUED_EXPORT = {
    "id": _EXPORT_ID,
    "case_id": "",
    "status": "queued",
    "status_label": "Solicitação enfileirada",
    "recommended_action": "Aguarde o processamento automático.",
    "attempt_count": 0,
    "max_attempts": 3,
    "next_attempt_at": None,
    "last_error_code": None,
    "last_error_message_redacted": None,
    "last_trace_id": None,
    "can_cancel": True,
    "can_retry_manually": False,
    "created_at": "2026-06-15T10:00:00Z",
    "updated_at": "2026-06-15T10:00:00Z",
    "finished_at": None,
}

_PREFLIGHT_READY = {
    "payload_status": "ready",
    "payload_status_label": "Payload pronto",
    "pending_requirements": [],
    "shape_debug": {"fields": {"RA_CIC": "present"}},
    "safe_error_code": None,
    "safe_error_message": None,
    "can_enqueue": True,
    "is_stub_mode": True,
    "disclaimer": "Fase STUB: nenhuma gravação no ERP é realizada. Apenas simulação segura.",
}

_CANCELLED_EXPORT = {**_QUEUED_EXPORT, "status": "cancelled", "can_cancel": False}

# ── httpx mock factories ──────────────────────────────────────────────────────


def _make_response(status_code: int, body: dict) -> httpx.Response:
    req = httpx.Request("POST", "http://bridge-stub/")
    return httpx.Response(status_code, json=body, request=req)


class _BridgePostOk:
    """Simulates POST /internal/protheus/exports → 201."""

    last_json: dict | None = None

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgePostOk":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
        if url.endswith("/internal/protheus/exports/preflight"):
            return _make_response(200, _PREFLIGHT_READY)
        _BridgePostOk.last_json = json
        body = {"was_existing": False, "export_request": {**_QUEUED_EXPORT, "case_id": json.get("case_id", "")}}  # type: ignore[index]
        return _make_response(201, body)


class _BridgeGetOk:
    """Simulates GET /internal/protheus/exports?case_id=... → 200."""

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgeGetOk":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
        return _make_response(200, {"items": [_QUEUED_EXPORT]})


class _BridgeCancelOk:
    """Simulates POST /internal/protheus/exports/{id}/cancel → 200."""

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgeCancelOk":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
        return _make_response(200, _CANCELLED_EXPORT)


class _BridgePostConflict:
    """Simulates POST → 409 duplicate."""

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgePostConflict":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
        if url.endswith("/internal/protheus/exports/preflight"):
            return _make_response(200, _PREFLIGHT_READY)
        return _make_response(409, {"existing_id": _EXPORT_ID, "case_id": "case-dup"})


class _BridgeTimeout:
    """Simulates timeout on any call."""

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgeTimeout":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def post(self, *a, **kw) -> httpx.Response:
        raise httpx.TimeoutException("timeout", request=httpx.Request("POST", "http://bridge-stub/"))

    async def get(self, *a, **kw) -> httpx.Response:
        raise httpx.TimeoutException("timeout", request=httpx.Request("GET", "http://bridge-stub/"))


class _BridgePostShouldNotRun:
    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgePostShouldNotRun":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def post(self, *a, **kw) -> httpx.Response:
        raise AssertionError("Bridge não deveria ser chamada quando o payload está incompleto.")


class _BridgePreflightIncomplete:
    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgePreflightIncomplete":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
        if url.endswith("/internal/protheus/exports/preflight"):
            return _make_response(200, {
                **_PREFLIGHT_READY,
                "payload_status": "incomplete",
                "pending_requirements": ["CPF ausente"],
                "safe_error_code": "ERR_PROTHEUS_PAYLOAD_CONTRACT_INVALID",
                "safe_error_message": "contract_incomplete",
            })
        raise AssertionError("Bridge não deveria enfileirar quando o preflight falha.")


_FAILED_EXPORT = {
    **_QUEUED_EXPORT,
    "status": "failed_permanent",
    "can_cancel": False,
    "can_request_new": True,
    "last_error_code": "BRIDGE_FATAL",
    "last_error_message_redacted": "[redacted: fatal]",
}

_SUCCESS_EXPORT = {
    **_QUEUED_EXPORT,
    "status": "success",
    "can_cancel": False,
    "can_request_new": False,
}


class _BridgeRequestNewOk:
    last_export_json: dict | None = None

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgeRequestNewOk":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
        return _make_response(200, {"items": [_FAILED_EXPORT]})

    async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
        if url.endswith("/internal/protheus/exports/preflight"):
            return _make_response(200, _PREFLIGHT_READY)
        _BridgeRequestNewOk.last_export_json = json
        return _make_response(201, {
            "was_existing": False,
            "export_request": {
                **_QUEUED_EXPORT,
                "case_id": json.get("case_id", ""),
                "id": "exp-renewed-safe",
            },
        })


class _BridgeRequestNewBlocked:
    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgeRequestNewBlocked":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
        return _make_response(200, {"items": [_SUCCESS_EXPORT]})

    async def post(self, *a, **kw) -> httpx.Response:
        raise AssertionError("Bridge não deveria ser chamada quando can_request_new=false.")


class _BridgeRequestNewDuplicate:
    post_attempted = False

    def __init__(self, *a, **kw) -> None:
        pass

    async def __aenter__(self) -> "_BridgeRequestNewDuplicate":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
        if _BridgeRequestNewDuplicate.post_attempted:
            return _make_response(200, {
                "items": [
                    {
                        **_QUEUED_EXPORT,
                        "id": "exp-existing-safe",
                        "case_id": url.split("case_id=")[-1],
                    }
                ]
            })
        return _make_response(200, {"items": [_FAILED_EXPORT]})

    async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
        if url.endswith("/internal/protheus/exports/preflight"):
            return _make_response(200, _PREFLIGHT_READY)
        _BridgeRequestNewDuplicate.post_attempted = True
        return _make_response(409, {"existing_id": "exp-existing-safe", "case_id": json.get("case_id", "")})


# ── Tests ─────────────────────────────────────────────────────────────────────

_MOCK_PATH = "src.application.services.protheus_export_queue_service.httpx.AsyncClient"


def test_protheus_status_helpers_cover_known_and_unknown_values() -> None:
    assert status_label_pt_br("queued") == "Solicitação enfileirada"
    assert payload_status_label_pt_br("ready") == "Payload pronto"
    assert status_label_pt_br("unexpected") == "Status desconhecido"
    assert payload_status_label_pt_br("unexpected") == "Status do payload desconhecido"
    assert can_cancel("queued") is True
    assert can_cancel("success") is False
    assert can_request_new("failed_permanent") is True
    assert can_request_new("success") is False
    assert can_show_export_button("ready", None) is True
    assert can_show_export_button("incomplete", None) is False
    assert can_show_export_button("ready", "processing") is False


async def _prepare_case_for_bridge_export(
    db_session: AsyncSession,
    *,
    case_id: str,
    job_id: UUID,
    candidate_id: UUID,
) -> None:
    candidate = await db_session.get(CandidateModel, candidate_id)
    assert candidate is not None
    candidate.cpf = "11144477735"

    _group, _location, unit = await _create_operational_scope(db_session)
    db_session.add(
        JobUnitModel(
            id=uuid4(),
            job_id=job_id,
            operational_unit_id=unit.id,
            priority=1,
            is_active=True,
        )
    )
    await db_session.flush()

    await _upsert_approved_item_document(
        db_session,
        case_id=UUID(case_id),
        candidate_id=candidate_id,
        item_type="rg",
        title="RG",
        content=(
            f"Nome completo: {candidate.full_name}\n"
            f"CPF: {candidate.cpf}\n"
            "Data de nascimento: 01/02/1990\n"
            "Registro Geral: 1234567\n"
            "Sexo: M\n"
            "Estado civil: solteiro\n"
            "Zona eleitoral: 123\n"
        ),
    )
    await _upsert_approved_item_document(
        db_session,
        case_id=UUID(case_id),
        candidate_id=candidate_id,
        item_type="pis",
        title="PIS",
        content="Documento PIS aprovado\nPIS/PASEP: 12345678901\n",
    )
    await _upsert_approved_item_document(
        db_session,
        case_id=UUID(case_id),
        candidate_id=candidate_id,
        item_type="carteira_trabalho",
        title="CTPS",
        content="Carteira de trabalho aprovada\nCTPS: 123456\nSerie: 0001\n",
    )
    await db_session.commit()


async def _upsert_approved_item_document(
    db_session: AsyncSession,
    *,
    case_id: UUID,
    candidate_id: UUID,
    item_type: str,
    title: str,
    content: str,
) -> None:
    item = await db_session.scalar(
        sa.select(PreAdmissionChecklistItemModel).where(
            PreAdmissionChecklistItemModel.case_id == case_id,
            PreAdmissionChecklistItemModel.item_type == item_type,
        )
    )
    now = datetime.now(UTC)
    if item is None:
        item = PreAdmissionChecklistItemModel(
            id=uuid4(),
            case_id=case_id,
            document_key=item_type,
            item_type=item_type,
            title=title,
            status="approved",
            required=True,
            accepted_file_types=["application/pdf"],
            max_file_size_mb=10,
            display_order=10,
            created_at=now,
            updated_at=now,
        )
        db_session.add(item)
        await db_session.flush()
    else:
        item.status = "approved"
        item.updated_at = now

    document_id = uuid4()
    storage_key, stored_filename = build_pre_admission_storage_key(
        case_id=case_id,
        candidate_id=candidate_id,
        item_id=item.id,
        document_id=document_id,
        extension=".pdf",
    )
    write_pre_admission_document(storage_key, content.encode("utf-8"))
    db_session.add(
        PreAdmissionDocumentModel(
            id=document_id,
            case_id=case_id,
            checklist_item_id=item.id,
            candidate_id=candidate_id,
            original_filename=f"{item_type}.pdf",
            stored_filename=stored_filename,
            storage_key=storage_key,
            mime_type="application/pdf",
            size_bytes=len(content.encode("utf-8")),
            status="approved",
            uploaded_at=now,
            reviewed_at=now,
            created_at=now,
            updated_at=now,
        )
    )


@pytest.mark.asyncio
async def test_01_create_export_request_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePostOk):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    body = resp.json()
    assert body["was_existing"] is False
    assert body["export_request"]["status"] == "queued"
    assert body["export_request"]["status_label"] == "Solicitação enfileirada"
    assert _BridgePostOk.last_json is not None
    admission_case = _BridgePostOk.last_json["admission_case"]
    assert admission_case["unit_code"].startswith("UNIT-")
    assert admission_case["personal"]["pis"] == "DOC_PIS_OK"
    assert admission_case["personal"]["ctps"] == "DOC_CTPS_OK"


@pytest.mark.asyncio
async def test_02_create_export_request_forwards_case_id(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePostOk):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_201_CREATED, resp.text
    body = resp.json()
    assert body["export_request"]["case_id"] == case_id


@pytest.mark.asyncio
async def test_03_create_export_request_409_duplicate(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePostConflict):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_409_CONFLICT
    assert _EXPORT_ID in resp.json()["detail"]


@pytest.mark.asyncio
async def test_04_create_export_request_bridge_unavailable_timeout(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgeTimeout):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


@pytest.mark.asyncio
async def test_05_create_export_request_bridge_disabled(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", False)

    resp = await client.post(
        f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
        headers=headers,
        json={},
    )

    assert resp.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


@pytest.mark.asyncio
async def test_06_create_export_request_requires_auth(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    resp = await client.post(
        f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
        json={},
    )

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.asyncio
async def test_07_response_never_contains_api_key(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "super-secret-key-12345")

    with patch(_MOCK_PATH, _BridgePostOk):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    raw = resp.text
    assert "super-secret-key-12345" not in raw
    assert "PROTHEUS_BRIDGE_INTERNAL_API_KEY" not in raw
    assert "X-Internal-Api-Key" not in raw


@pytest.mark.asyncio
async def test_07b_create_export_request_returns_422_for_missing_pis_and_does_not_call_bridge(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )
    await db_session.execute(
        sa.delete(PreAdmissionChecklistItemModel).where(
            PreAdmissionChecklistItemModel.case_id == UUID(case_id),
            PreAdmissionChecklistItemModel.item_type == "pis",
        )
    )
    await db_session.commit()

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePostShouldNotRun):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = resp.json()["detail"]
    assert detail["message"] == "Payload Protheus incompleto para exportação."
    assert "PIS ausente" in detail["pending_requirements"]
    assert detail["payload_status"] == "incomplete"


@pytest.mark.asyncio
async def test_07c_create_export_request_returns_422_for_missing_cpf_and_does_not_call_bridge(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, candidate_id, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=candidate_id,
    )
    candidate = await db_session.get(CandidateModel, candidate_id)
    assert candidate is not None
    candidate.cpf = None
    await db_session.commit()

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePostShouldNotRun):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    detail = resp.json()["detail"]
    assert "CPF ausente" in detail["pending_requirements"]
    assert detail["payload_status"] == "incomplete"


@pytest.mark.asyncio
async def test_07d_preflight_returns_ready(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePostOk):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/preflight",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["payload_status"] == "ready"
    assert body["pending_requirements"] == []


@pytest.mark.asyncio
async def test_07e_preflight_incomplete_blocks_enqueue(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgePreflightIncomplete):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/preflight",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["payload_status"] == "incomplete"
    assert "CPF ausente" in body["pending_requirements"]


@pytest.mark.asyncio
async def test_08_get_latest_returns_200(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgeGetOk):
        resp = await client.get(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/latest",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["status"] == "queued"
    assert body["status_label"] == "Solicitação enfileirada"


@pytest.mark.asyncio
async def test_09_get_latest_returns_404_when_bridge_returns_empty(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    class _BridgeGetEmpty:
        def __init__(self, *a, **kw) -> None:
            pass

        async def __aenter__(self) -> "_BridgeGetEmpty":
            return self

        async def __aexit__(self, *_) -> None:
            pass

        async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
            return _make_response(200, {"items": []})

    with patch(_MOCK_PATH, _BridgeGetEmpty):
        resp = await client.get(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/latest",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_09a_request_new_permitido_quando_can_request_new_true(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")
    monkeypatch.setattr(settings, "PROTHEUS_REAL_SEND_ENABLED", False)
    monkeypatch.setattr(settings, "ERP_ALLOW_REAL_SEND", False)

    with patch(_MOCK_PATH, _BridgeRequestNewOk):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/request-new",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_201_CREATED
    body = resp.json()
    assert body["was_existing"] is False
    assert body["export_request"]["status"] == "queued"
    assert body["export_request"]["is_stub_mode"] is True
    assert body["export_request"]["unit_name"]
    assert _BridgeRequestNewOk.last_export_json is not None
    assert _BridgeRequestNewOk.last_export_json["idempotency_key"].startswith(f"ats-renew-{case_id}-")


@pytest.mark.asyncio
async def test_09b_request_new_bloqueado_quando_can_request_new_false(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgeRequestNewBlocked):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/request-new",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_409_CONFLICT
    assert "Nova solicitação segura não permitida" in resp.json()["detail"]
    assert "11144477735" not in resp.text


@pytest.mark.asyncio
async def test_09c_request_new_idempotente_retorna_existente_ativo(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]
    await _prepare_case_for_bridge_export(
        db_session,
        case_id=case_id,
        job_id=UUID(case["job_id"]),
        candidate_id=UUID(case["candidate_id"]),
    )

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")
    _BridgeRequestNewDuplicate.post_attempted = False

    with patch(_MOCK_PATH, _BridgeRequestNewDuplicate):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/request-new",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["was_existing"] is True
    assert body["export_request"]["id"] == "exp-existing-safe"
    assert body["export_request"]["status"] == "queued"
    assert body["export_request"]["is_stub_mode"] is True


@pytest.mark.asyncio
async def test_09d_request_new_exige_permissao_de_escrita(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers_admin, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    del headers_admin
    email = f"protheus-request-new-viewer-{uuid4().hex[:8]}@example.com"
    await _create_active_user(db_session, email, "password123", UserRole.VIEWER)
    headers = await _auth_headers(client, email, "password123")

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgeRequestNewBlocked):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case['id']}/protheus-export-requests/request-new",
            headers=headers,
            json={},
        )

    assert resp.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_10_cancel_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgeCancelOk):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/{_EXPORT_ID}/cancel",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_200_OK
    assert resp.json()["status"] == "cancelled"


@pytest.mark.asyncio
async def test_11_cancel_not_cancellable_returns_422(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    class _BridgeCancelNotAllowed:
        def __init__(self, *a, **kw) -> None:
            pass

        async def __aenter__(self) -> "_BridgeCancelNotAllowed":
            return self

        async def __aexit__(self, *_) -> None:
            pass

        async def post(self, url: str, *, json: dict | None = None, headers: dict | None = None) -> httpx.Response:
            return _make_response(422, {"status": "success"})

    with patch(_MOCK_PATH, _BridgeCancelNotAllowed):
        resp = await client.post(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/{_EXPORT_ID}/cancel",
            headers=headers,
        )

    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_12_status_labels_are_pt_br(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    case_id = case["id"]

    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", "test-key")

    with patch(_MOCK_PATH, _BridgeGetOk):
        resp = await client.get(
            f"/api/v1/pre-admission/cases/{case_id}/protheus-export-requests/latest",
            headers=headers,
        )

    body = resp.json()
    assert body["status_label"] == "Solicitação enfileirada"
    assert body["recommended_action"] == "Aguarde o processamento automático."
