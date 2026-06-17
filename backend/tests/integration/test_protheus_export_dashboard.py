from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import httpx
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import patch

from src.core.settings import settings
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.job_model import JobUnitModel

from .helpers import _auth_headers, _create_active_user
from .test_job_multiunit_backend import _create_operational_scope
from .test_pre_admission import _seed_pre_admission_with_item

_MOCK_PATH = "src.application.services.protheus_export_queue_service.httpx.AsyncClient"
_BRIDGE_KEY = "dev-bridge-key-local"

_DASHBOARD_BODY = {
    "total": 7,
    "active": 3,
    "terminal": 4,
    "action_required": 2,
    "totals_by_status": {
        "queued": 1,
        "processing": 1,
        "retry_scheduled": 1,
        "success": 2,
        "failed_permanent": 1,
        "blocked": 1,
        "cancelled": 0,
    },
    "top_errors": [
        {
            "code": "ERR_VALIDATION",
            "message_redacted": "CPF [redacted] inválido",
            "count": 2,
        }
    ],
    "operational_flags": {
        "is_stub_mode": True,
        "bridge_enabled": True,
        "real_send_enabled": False,
    },
    "headers": {"X-Internal-Api-Key": _BRIDGE_KEY},
    "payload_operacional": {"cpf": "111.222.333-44"},
}

_ITEM = {
    "id": "exp-dashboard-1",
    "case_id": str(uuid4()),
    "status": "failed_permanent",
    "status_label": "Falha permanente",
    "payload_status": "ready",
    "payload_status_label": "Payload pronto",
    "attempt_count": 3,
    "max_attempts": 3,
    "next_attempt_at": None,
    "last_error_code": "ERR_PROTHEUS_VALIDATION",
    "last_error_message_redacted": "CPF 111.222.333-44 rejeitado",
    "blocked_reason": "PIS 123.45678.90-1 divergente",
    "last_trace_id": "trace-dashboard-1",
    "created_at": "2026-06-16T10:00:00Z",
    "updated_at": "2026-06-16T10:05:00Z",
    "finished_at": "2026-06-16T10:05:00Z",
    "recommended_action": "Revise manualmente antes de nova solicitação.",
    "can_cancel": False,
    "can_retry_manually": False,
    "can_request_new": True,
    "is_stub_mode": True,
    "payload_operacional": {"cpf": "111.222.333-44", "ctps": "1234567"},
    "internal_headers": {"X-Internal-Api-Key": _BRIDGE_KEY},
}


def _response(status_code: int, body: dict) -> httpx.Response:
    request = httpx.Request("GET", "http://bridge-stub/internal/protheus/exports/dashboard")
    return httpx.Response(status_code, json=body, request=request)


class _BridgeDashboardOk:
    last_headers: dict | None = None
    last_items_url: str | None = None

    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "_BridgeDashboardOk":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
        _BridgeDashboardOk.last_headers = headers
        if url.endswith("/internal/protheus/exports/dashboard"):
            return _response(200, _DASHBOARD_BODY)
        _BridgeDashboardOk.last_items_url = url
        return _response(
            200,
            {
                "items": [_ITEM],
                "total": 1,
                "limit": 25,
                "offset": 0,
                "has_next": False,
                "payload_operacional": {"cpf": "111.222.333-44"},
            },
        )


class _BridgeTimeout:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "_BridgeTimeout":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, *args, **kwargs) -> httpx.Response:
        raise httpx.TimeoutException("timeout", request=httpx.Request("GET", "http://bridge-stub/"))


class _BridgeUnavailable:
    def __init__(self, *args, **kwargs) -> None:
        pass

    async def __aenter__(self) -> "_BridgeUnavailable":
        return self

    async def __aexit__(self, *_) -> None:
        pass

    async def get(self, *args, **kwargs) -> httpx.Response:
        raise httpx.ConnectError("offline", request=httpx.Request("GET", "http://bridge-stub/"))


async def _headers(
    client: AsyncClient,
    db_session: AsyncSession,
    role: UserRole,
) -> dict[str, str]:
    email = f"protheus-dashboard-{role.value}-{uuid4().hex[:8]}@example.com"
    await _create_active_user(db_session, email, "password123", role)
    return await _auth_headers(client, email, "password123")


def _configure_bridge(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_ENABLED", True)
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_BASE_URL", "http://bridge-stub")
    monkeypatch.setattr(settings, "PROTHEUS_BRIDGE_INTERNAL_API_KEY", _BRIDGE_KEY)


def _assert_safe_response(body: dict) -> None:
    encoded = json.dumps(body, ensure_ascii=False)
    assert _BRIDGE_KEY not in encoded
    assert "X-Internal-Api-Key" not in encoded
    assert "PROTHEUS_BRIDGE_INTERNAL_API_KEY" not in encoded
    assert "payload_operacional" not in encoded
    assert "admission_case" not in encoded
    assert "111.222.333-44" not in encoded
    assert "123.45678.90-1" not in encoded
    assert "1234567" not in encoded


async def test_dashboard_chama_bridge_com_api_key_e_retorna_resumo_seguro(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    _configure_bridge(monkeypatch)
    headers = await _headers(client, db_session, UserRole.HR)

    with patch(_MOCK_PATH, _BridgeDashboardOk):
        response = await client.get(
            "/api/v1/pre-admission/protheus-export-dashboard",
            headers=headers,
        )

    assert response.status_code == 200
    assert _BridgeDashboardOk.last_headers is not None
    assert _BridgeDashboardOk.last_headers["X-Internal-Api-Key"] == _BRIDGE_KEY
    body = response.json()
    assert body["total"] == 7
    assert body["totals_by_status"]["failed_permanent"] == 1
    assert body["operational_flags"]["is_stub_mode"] is True
    _assert_safe_response(body)


async def test_items_retorna_lista_segura_e_repassa_filtros(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    _configure_bridge(monkeypatch)
    headers = await _headers(client, db_session, UserRole.ADMIN)

    with patch(_MOCK_PATH, _BridgeDashboardOk):
        response = await client.get(
            "/api/v1/pre-admission/protheus-export-dashboard/items"
            "?status=failed_permanent&limit=500&offset=20",
            headers=headers,
        )

    assert response.status_code == 200
    parsed = urlparse(_BridgeDashboardOk.last_items_url or "")
    query = parse_qs(parsed.query)
    assert query["status"] == ["failed_permanent"]
    assert query["limit"] == ["100"]
    assert query["offset"] == ["20"]
    body = response.json()
    assert body["items"][0]["id"] == "exp-dashboard-1"
    assert body["items"][0]["last_error_message_redacted"] == "CPF [redacted] rejeitado"
    assert body["items"][0]["blocked_reason"] == "PIS [redacted] divergente"
    _assert_safe_response(body)


async def test_items_enriquece_unit_name_quando_disponivel_no_caso(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    headers, _, _, case, _ = await _seed_pre_admission_with_item(client, db_session)
    _group, _location, unit = await _create_operational_scope(db_session)
    db_session.add(
        JobUnitModel(
            id=uuid4(),
            job_id=UUID(case["job_id"]),
            operational_unit_id=unit.id,
            priority=1,
            is_active=True,
        )
    )
    await db_session.commit()

    class _BridgeDashboardCaseOk(_BridgeDashboardOk):
        async def get(self, url: str, *, headers: dict | None = None) -> httpx.Response:
            _BridgeDashboardOk.last_headers = headers
            if url.endswith("/internal/protheus/exports/dashboard"):
                return _response(200, _DASHBOARD_BODY)
            item = dict(_ITEM)
            item["case_id"] = case["id"]
            item.pop("unit_name", None)
            return _response(
                200,
                {
                    "items": [item],
                    "total": 1,
                    "limit": 25,
                    "offset": 0,
                    "has_next": False,
                },
            )

    _configure_bridge(monkeypatch)
    with patch(_MOCK_PATH, _BridgeDashboardCaseOk):
        response = await client.get(
            "/api/v1/pre-admission/protheus-export-dashboard/items",
            headers=headers,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["unit_name"] == unit.name
    _assert_safe_response(body)


async def test_timeout_da_bridge_vira_erro_humanizado(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    _configure_bridge(monkeypatch)
    headers = await _headers(client, db_session, UserRole.HR)

    with patch(_MOCK_PATH, _BridgeTimeout):
        response = await client.get(
            "/api/v1/pre-admission/protheus-export-dashboard",
            headers=headers,
        )

    assert response.status_code == 503
    assert "tempo limite" in response.json()["detail"]
    assert _BRIDGE_KEY not in response.text


async def test_bridge_indisponivel_vira_erro_humanizado(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    _configure_bridge(monkeypatch)
    headers = await _headers(client, db_session, UserRole.ADMIN)

    with patch(_MOCK_PATH, _BridgeUnavailable):
        response = await client.get(
            "/api/v1/pre-admission/protheus-export-dashboard/items",
            headers=headers,
        )

    assert response.status_code == 503
    assert "Bridge Protheus indisponível" in response.json()["detail"]
    assert _BRIDGE_KEY not in response.text


async def test_usuario_sem_permissao_recebe_403_sem_chamar_bridge(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch,
) -> None:
    _configure_bridge(monkeypatch)
    headers = await _headers(client, db_session, UserRole.VIEWER)

    with patch(_MOCK_PATH, _BridgeUnavailable):
        response = await client.get(
            "/api/v1/pre-admission/protheus-export-dashboard",
            headers=headers,
        )

    assert response.status_code == 403
