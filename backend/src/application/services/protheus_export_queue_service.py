from __future__ import annotations

import hashlib
import re
import urllib.parse
from typing import Any
from uuid import UUID, uuid4

import httpx
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.protheus_case_payload_adapter import (
    ProtheusCasePayloadAdapter,
    ProtheusCasePayloadAdapterNotFoundError,
)
from src.application.services.protheus_export_status import (
    can_cancel,
    can_request_new,
    can_show_export_button,
    payload_status_label_pt_br,
    recommended_action_pt_br,
    status_label_pt_br,
)
from src.core.settings import settings
from src.infrastructure.database.models.job_model import JobUnitModel
from src.infrastructure.database.models.operational_master_model import OperationalUnitModel
from src.infrastructure.database.models.pre_admission_model import PreAdmissionCaseModel

_STUB_DISCLAIMER = (
    "Fase STUB: nenhuma gravação no ERP é realizada. Apenas simulação segura."
)
_DASHBOARD_LIMIT_MAX = 100
_SENSITIVE_TEXT_PATTERNS = [
    re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b"),
    re.compile(r"\b\d{3}\.?\d{5}\.?\d{2}-?\d\b"),
    re.compile(r"\b\d{7,14}\b"),
]

class ProtheusExportQueueDisabledError(Exception):
    pass


class ProtheusExportQueueUnavailableError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class ProtheusExportQueueDuplicateError(Exception):
    def __init__(self, existing_id: str, case_id: str) -> None:
        self.existing_id = existing_id
        self.case_id = case_id
        super().__init__(f"Solicitação ativa já existe para o caso {case_id}")


class ProtheusExportQueueNotFoundError(Exception):
    pass


class ProtheusExportQueueValidationError(Exception):
    def __init__(
        self,
        message: str,
        pending_requirements: list[str],
        payload_status: str = "incomplete",
        shape_debug: dict | None = None,
        safe_error_code: str | None = None,
        safe_error_message: str | None = None,
    ) -> None:
        self.message = message
        self.pending_requirements = pending_requirements
        self.payload_status = payload_status
        self.shape_debug = shape_debug
        self.safe_error_code = safe_error_code
        self.safe_error_message = safe_error_message
        super().__init__(message)


class ProtheusExportQueueNotCancellableError(Exception):
    def __init__(self, status: str) -> None:
        self.status = status
        super().__init__(f"Solicitação não pode ser cancelada no estado: {status}")


class ProtheusExportQueueRequestNewNotAllowedError(Exception):
    def __init__(self, status: str) -> None:
        self.status = status
        super().__init__(f"Nova solicitação não permitida no estado: {status}")


async def _resolve_case_unit_names(
    session: AsyncSession,
    case_ids: list[UUID],
) -> dict[str, str]:
    if not case_ids:
        return {}

    # Priority 1: cases that already have operational_unit_id set (propagated from candidate preference).
    direct_stmt = (
        sa.select(PreAdmissionCaseModel.id, OperationalUnitModel.name)
        .join(OperationalUnitModel, OperationalUnitModel.id == PreAdmissionCaseModel.operational_unit_id)
        .where(
            PreAdmissionCaseModel.id.in_(case_ids),
            PreAdmissionCaseModel.operational_unit_id.is_not(None),
            OperationalUnitModel.is_active.is_(True),
        )
    )
    direct_rows = (await session.execute(direct_stmt)).all()
    resolved: dict[str, str] = {}
    for case_id, unit_name in direct_rows:
        if not unit_name:
            continue
        resolved[str(case_id)] = str(unit_name).strip()

    # Priority 2: fallback to first active job_unit by priority for cases without a direct unit.
    missing_ids = [cid for cid in case_ids if str(cid) not in resolved]
    if missing_ids:
        fallback_stmt = (
            sa.select(PreAdmissionCaseModel.id, OperationalUnitModel.name)
            .join(JobUnitModel, JobUnitModel.job_id == PreAdmissionCaseModel.job_id)
            .join(OperationalUnitModel, OperationalUnitModel.id == JobUnitModel.operational_unit_id)
            .where(
                PreAdmissionCaseModel.id.in_(missing_ids),
                JobUnitModel.is_active.is_(True),
                OperationalUnitModel.is_active.is_(True),
            )
            .order_by(
                PreAdmissionCaseModel.id.asc(),
                JobUnitModel.priority.asc().nullslast(),
                JobUnitModel.created_at.asc(),
            )
        )
        fallback_rows = (await session.execute(fallback_stmt)).all()
        for case_id, unit_name in fallback_rows:
            if not unit_name:
                continue
            key = str(case_id)
            resolved.setdefault(key, str(unit_name).strip())

    return resolved


def _sanitize(raw: dict, *, unit_name: str | None = None) -> dict:
    status = str(raw.get("status") or "")
    payload_status_raw = raw.get("payload_status")
    payload_status = str(payload_status_raw) if payload_status_raw is not None else None
    is_stub = not settings.PROTHEUS_REAL_SEND_ENABLED and not settings.ERP_ALLOW_REAL_SEND
    raw_can_cancel = raw.get("can_cancel")
    resolved_can_cancel = can_cancel(status) if raw_can_cancel is None else bool(raw_can_cancel) and can_cancel(status)
    resolved_can_request_new = can_request_new(status)
    resolved_unit_name = (str(raw.get("unit_name") or "").strip() or unit_name or None)
    return {
        "id": raw.get("id", ""),
        "case_id": raw.get("case_id", ""),
        "unit_name": resolved_unit_name,
        "status": status,
        "status_label": status_label_pt_br(status),
        "recommended_action": recommended_action_pt_br(status),
        "attempt_count": raw.get("attempt_count", 0),
        "max_attempts": raw.get("max_attempts", 3),
        "next_attempt_at": raw.get("next_attempt_at"),
        "last_error_code": raw.get("last_error_code"),
        "last_error_message_redacted": raw.get("last_error_message_redacted"),
        "last_trace_id": raw.get("last_trace_id"),
        "can_cancel": resolved_can_cancel,
        "can_request_new": resolved_can_request_new,
        "can_enqueue": can_show_export_button(payload_status, status or None),
        "can_retry_manually": bool(raw.get("can_retry_manually", False)),
        "created_at": raw.get("created_at", ""),
        "updated_at": raw.get("updated_at", ""),
        "finished_at": raw.get("finished_at"),
        "payload_status": payload_status,
        "payload_status_label": (
            payload_status_label_pt_br(payload_status) if payload_status is not None else None
        ),
        "pending_requirements": list(raw.get("pending_requirements") or []),
        "is_stub_mode": is_stub,
        "disclaimer": _STUB_DISCLAIMER if is_stub else None,
    }


def _redact_sensitive_text(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    redacted = value
    for pattern in _SENSITIVE_TEXT_PATTERNS:
        redacted = pattern.sub("[redacted]", redacted)
    return redacted


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _sanitize_dashboard_item(raw: dict[str, Any], *, unit_name: str | None = None) -> dict[str, Any]:
    item = _sanitize(raw, unit_name=unit_name)
    item.pop("pending_requirements", None)
    item.pop("can_enqueue", None)
    item.pop("disclaimer", None)
    item["blocked_reason"] = _redact_sensitive_text(raw.get("blocked_reason"))
    item["last_error_message_redacted"] = _redact_sensitive_text(
        item.get("last_error_message_redacted")
    )
    return item


def _sanitize_totals(raw: Any) -> dict[str, int]:
    source = raw if isinstance(raw, dict) else {}
    return {
        "queued": _safe_int(source.get("queued")),
        "processing": _safe_int(source.get("processing")),
        "retry_scheduled": _safe_int(source.get("retry_scheduled")),
        "success": _safe_int(source.get("success")),
        "failed_permanent": _safe_int(source.get("failed_permanent")),
        "blocked": _safe_int(source.get("blocked")),
        "cancelled": _safe_int(source.get("cancelled")),
        "unknown": _safe_int(source.get("unknown")),
    }


def _sanitize_top_error(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    return {
        "code": _redact_sensitive_text(raw.get("code")),
        "message_redacted": _redact_sensitive_text(
            raw.get("message_redacted") or raw.get("last_error_message_redacted")
        ),
        "count": _safe_int(raw.get("count"), 1),
    }


def _sanitize_dashboard_summary(raw: dict[str, Any]) -> dict[str, Any]:
    totals = _sanitize_totals(raw.get("totals_by_status") or raw.get("totals"))
    top_errors = [
        error
        for error in (_sanitize_top_error(item) for item in list(raw.get("top_errors") or []))
        if error is not None
    ]
    flags = raw.get("operational_flags") if isinstance(raw.get("operational_flags"), dict) else {}
    is_stub = not settings.PROTHEUS_REAL_SEND_ENABLED and not settings.ERP_ALLOW_REAL_SEND
    return {
        "total": _safe_int(raw.get("total"), sum(totals.values())),
        "active": _safe_int(raw.get("active")),
        "terminal": _safe_int(raw.get("terminal")),
        "action_required": _safe_int(raw.get("action_required")),
        "totals_by_status": totals,
        "top_errors": top_errors,
        "operational_flags": {
            "is_stub_mode": bool(flags.get("is_stub_mode", is_stub)),
            "bridge_enabled": bool(flags.get("bridge_enabled", settings.PROTHEUS_BRIDGE_ENABLED)),
            "real_send_enabled": bool(
                flags.get(
                    "real_send_enabled",
                    settings.PROTHEUS_REAL_SEND_ENABLED and settings.ERP_ALLOW_REAL_SEND,
                )
            ),
        },
    }


def _build_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Internal-Api-Key": settings.PROTHEUS_BRIDGE_INTERNAL_API_KEY,
    }


def _guard_available() -> str:
    """Return base_url or raise if bridge is not configured."""
    if not settings.PROTHEUS_BRIDGE_ENABLED:
        raise ProtheusExportQueueDisabledError()
    base_url = settings.PROTHEUS_BRIDGE_BASE_URL.rstrip("/")
    if not base_url or not settings.PROTHEUS_BRIDGE_INTERNAL_API_KEY.strip():
        raise ProtheusExportQueueUnavailableError(
            "Protheus Bridge não está configurada corretamente neste ambiente."
        )
    return base_url


async def get_dashboard() -> dict[str, Any]:
    base_url = _guard_available()

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.get(
                f"{base_url}/internal/protheus/exports/dashboard",
                headers=_build_headers(),
            )
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ProtheusExportQueueUnavailableError(
            "Bridge Protheus indisponível no momento: tempo limite excedido."
        )
    except (httpx.RequestError, httpx.HTTPStatusError):
        raise ProtheusExportQueueUnavailableError(
            "Bridge Protheus indisponível no momento. Tente novamente em instantes."
        )

    return _sanitize_dashboard_summary(response.json())


async def list_dashboard_items(
    *,
    status: str | None = None,
    limit: int = 25,
    offset: int = 0,
    session: AsyncSession | None = None,
) -> dict[str, Any]:
    base_url = _guard_available()
    safe_limit = max(1, min(limit, _DASHBOARD_LIMIT_MAX))
    safe_offset = max(0, offset)
    params: dict[str, str | int] = {"limit": safe_limit, "offset": safe_offset}
    if status:
        params["status"] = status.strip()
    qs = urllib.parse.urlencode(params)

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.get(
                f"{base_url}/internal/protheus/exports/dashboard/items?{qs}",
                headers=_build_headers(),
            )
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ProtheusExportQueueUnavailableError(
            "Bridge Protheus indisponível no momento: tempo limite excedido."
        )
    except (httpx.RequestError, httpx.HTTPStatusError):
        raise ProtheusExportQueueUnavailableError(
            "Bridge Protheus indisponível no momento. Tente novamente em instantes."
        )

    body = response.json()
    raw_items = body.get("items") if isinstance(body, dict) else []
    unit_names: dict[str, str] = {}
    if session is not None:
        case_ids = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            case_id_raw = item.get("case_id")
            if not case_id_raw:
                continue
            try:
                case_ids.append(UUID(str(case_id_raw)))
            except (TypeError, ValueError):
                continue
        unit_names = await _resolve_case_unit_names(session, case_ids)

    items = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        case_id_key = str(item.get("case_id") or "")
        items.append(
            _sanitize_dashboard_item(item, unit_name=unit_names.get(case_id_key))
        )
    total = _safe_int(body.get("total") if isinstance(body, dict) else None, len(items))
    return {
        "items": items,
        "total": total,
        "limit": safe_limit,
        "offset": safe_offset,
        "has_next": bool(body.get("has_next", safe_offset + safe_limit < total))
        if isinstance(body, dict)
        else False,
    }


async def enqueue(
    case_id: UUID,
    requested_by: str,
    session: AsyncSession,
    *,
    unit_code: str = "STUB",
    protheus_group_code: str = "T01",
    protheus_branch_code: str = "01",
    idempotency_key: str | None = None,
) -> tuple[bool, dict]:
    """Enqueue a Protheus export request via the bridge.

    Returns (was_existing, sanitized_export_request).
    Raises ProtheusExportQueueDuplicateError if active request already exists.
    Raises ProtheusExportQueueUnavailableError on transport/server error.
    """
    base_url = _guard_available()
    adapter = ProtheusCasePayloadAdapter(session)
    try:
        adapted = await adapter.build(
            case_id,
            requested_by=requested_by,
            fallback_unit_code=unit_code,
        )
    except ProtheusCasePayloadAdapterNotFoundError as exc:
        raise ProtheusExportQueueUnavailableError(str(exc))

    preflight = await preflight_case(
        case_id=case_id,
        requested_by=requested_by,
        session=session,
        unit_code=unit_code,
        protheus_group_code=protheus_group_code,
        protheus_branch_code=protheus_branch_code,
    )
    if preflight["payload_status"] != "ready":
        raise ProtheusExportQueueValidationError(
            "Payload Protheus incompleto para exportação.",
            list(preflight.get("pending_requirements") or []),
            str(preflight.get("payload_status") or "incomplete"),
            shape_debug=preflight.get("shape_debug"),
            safe_error_code=preflight.get("safe_error_code"),
            safe_error_message=preflight.get("safe_error_message"),
        )

    request_idempotency_key = idempotency_key or f"ats-{case_id}-{uuid4().hex[:16]}"
    payload_hash = hashlib.sha256(str(adapted.redacted_preview).encode()).hexdigest()[:32]

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.post(
                f"{base_url}/internal/protheus/exports",
                json={
                    "case_id": str(case_id),
                    "idempotency_key": request_idempotency_key,
                    "unit_code": unit_code,
                    "protheus_group_code": protheus_group_code,
                    "protheus_branch_code": protheus_branch_code,
                    "payload_hash": payload_hash,
                    "candidate_id": None,
                    "requested_by": requested_by,
                    "admission_case": adapted.admission_case,
                },
                headers=_build_headers(),
            )
    except httpx.TimeoutException:
        raise ProtheusExportQueueUnavailableError("Bridge indisponível: timeout.")
    except httpx.RequestError:
        raise ProtheusExportQueueUnavailableError("Bridge indisponível.")

    if response.status_code == 409:
        body = response.json()
        raise ProtheusExportQueueDuplicateError(
            existing_id=body.get("existing_id", ""),
            case_id=body.get("case_id", str(case_id)),
        )
    if response.status_code == 422:
        body = response.json()
        detail = body.get("detail")
        if isinstance(detail, dict):
            message = str(detail.get("message") or "Payload Protheus incompleto para exportação.")
            pending = list(detail.get("pending_requirements") or [])
            payload_status = str(detail.get("payload_status") or "blocked")
            shape_debug = detail.get("shape_debug")
            safe_error_code = detail.get("safe_error_code")
            safe_error_message = detail.get("safe_error_message")
        else:
            message = str(body.get("error") or detail or "Payload Protheus incompleto para exportação.")
            pending = list(body.get("pending_requirements") or [])
            payload_status = str(body.get("payload_status") or "incomplete")
            shape_debug = body.get("shape_debug")
            safe_error_code = body.get("safe_error_code")
            safe_error_message = body.get("safe_error_message")
        raise ProtheusExportQueueValidationError(
            message,
            pending,
            payload_status,
            shape_debug=shape_debug,
            safe_error_code=safe_error_code,
            safe_error_message=safe_error_message,
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError:
        raise ProtheusExportQueueUnavailableError(
            f"Erro ao comunicar com bridge: [redacted: {response.status_code}]"
        )

    body = response.json()
    unit_names = await _resolve_case_unit_names(session, [case_id])
    return bool(body.get("was_existing", False)), _sanitize(
        body.get("export_request", {}),
        unit_name=unit_names.get(str(case_id)),
    )


async def get_latest_by_case_id(
    case_id: UUID,
    *,
    session: AsyncSession | None = None,
) -> dict | None:
    """Return the latest export queue item for a case, or None if not found."""
    base_url = _guard_available()
    qs = urllib.parse.urlencode({"case_id": str(case_id)})

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.get(
                f"{base_url}/internal/protheus/exports?{qs}",
                headers=_build_headers(),
            )
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ProtheusExportQueueUnavailableError("Bridge indisponível: timeout.")
    except (httpx.RequestError, httpx.HTTPStatusError):
        raise ProtheusExportQueueUnavailableError("Bridge indisponível.")

    items = response.json().get("items", [])
    if not items:
        return None

    unit_name: str | None = None
    if session is not None:
        unit_name = (await _resolve_case_unit_names(session, [case_id])).get(str(case_id))
    return _sanitize(items[0], unit_name=unit_name)


async def preflight_case(
    case_id: UUID,
    requested_by: str,
    session: AsyncSession,
    *,
    unit_code: str = "STUB",
    protheus_group_code: str = "T01",
    protheus_branch_code: str = "01",
) -> dict:
    base_url = _guard_available()
    adapter = ProtheusCasePayloadAdapter(session)
    try:
        adapted = await adapter.build(
            case_id,
            requested_by=requested_by,
            fallback_unit_code=unit_code,
        )
    except ProtheusCasePayloadAdapterNotFoundError as exc:
        raise ProtheusExportQueueUnavailableError(str(exc))

    if adapted.pending_requirements:
        return {
            "payload_status": "incomplete",
            "payload_status_label": payload_status_label_pt_br("incomplete"),
            "pending_requirements": adapted.pending_requirements,
            "shape_debug": {"admission_case": "present"},
            "safe_error_code": "ERR_PROTHEUS_ADMISSION_CASE_INCOMPLETE",
            "safe_error_message": "admission_case_incomplete",
            "can_enqueue": False,
            "is_stub_mode": True,
            "disclaimer": _STUB_DISCLAIMER,
        }

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.post(
                f"{base_url}/internal/protheus/exports/preflight",
                json={
                    "case_id": str(case_id),
                    "unit_code": unit_code,
                    "protheus_group_code": protheus_group_code,
                    "protheus_branch_code": protheus_branch_code,
                    "requested_by": requested_by,
                    "admission_case": adapted.admission_case,
                },
                headers=_build_headers(),
            )
            response.raise_for_status()
    except httpx.TimeoutException:
        raise ProtheusExportQueueUnavailableError("Bridge indisponível: timeout.")
    except (httpx.RequestError, httpx.HTTPStatusError):
        raise ProtheusExportQueueUnavailableError("Bridge indisponível.")

    body = response.json()
    payload_status = str(body.get("payload_status") or "incomplete")
    return {
        "payload_status": payload_status,
        "payload_status_label": payload_status_label_pt_br(payload_status),
        "pending_requirements": list(body.get("pending_requirements") or []),
        "shape_debug": body.get("shape_debug"),
        "safe_error_code": body.get("safe_error_code"),
        "safe_error_message": body.get("safe_error_message"),
        "can_enqueue": can_show_export_button(payload_status, None),
        "is_stub_mode": True,
        "disclaimer": _STUB_DISCLAIMER,
    }


async def cancel(export_id: str, cancelled_by: str) -> dict:
    """Cancel an export queue request via the bridge."""
    base_url = _guard_available()

    try:
        async with httpx.AsyncClient(
            timeout=settings.PROTHEUS_BRIDGE_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as client:
            response = await client.post(
                f"{base_url}/internal/protheus/exports/{export_id}/cancel",
                json={"cancelled_by": cancelled_by},
                headers=_build_headers(),
            )
    except httpx.TimeoutException:
        raise ProtheusExportQueueUnavailableError("Bridge indisponível: timeout.")
    except httpx.RequestError:
        raise ProtheusExportQueueUnavailableError("Bridge indisponível.")

    if response.status_code == 404:
        raise ProtheusExportQueueNotFoundError()
    if response.status_code == 422:
        raise ProtheusExportQueueNotCancellableError(
            status=response.json().get("status", "")
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError:
        raise ProtheusExportQueueUnavailableError(
            f"Erro ao cancelar na bridge: [redacted: {response.status_code}]"
        )

    return _sanitize(response.json())


async def request_new(
    case_id: UUID,
    requested_by: str,
    session: AsyncSession,
    *,
    unit_code: str = "STUB",
    protheus_group_code: str = "T01",
    protheus_branch_code: str = "01",
) -> tuple[bool, dict]:
    latest = await get_latest_by_case_id(case_id, session=session)
    if latest is None:
        raise ProtheusExportQueueNotFoundError()

    latest_status = str(latest.get("status") or "")
    if not can_request_new(latest_status):
        raise ProtheusExportQueueRequestNewNotAllowedError(latest_status)

    retry_idempotency_key = f"ats-renew-{case_id}-{latest.get('id', 'unknown')}"
    try:
        return await enqueue(
            case_id=case_id,
            requested_by=requested_by,
            session=session,
            unit_code=unit_code,
            protheus_group_code=protheus_group_code,
            protheus_branch_code=protheus_branch_code,
            idempotency_key=retry_idempotency_key,
        )
    except ProtheusExportQueueDuplicateError:
        existing = await get_latest_by_case_id(case_id, session=session)
        if existing is None:
            raise
        return True, existing
