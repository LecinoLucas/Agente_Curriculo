from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from src.domain.exceptions import InvalidPreAdmissionStatusTransition, ValidationException

PRE_ADMISSION_CASE_ENTITY = "pre_admission_case"
PRE_ADMISSION_CHECKLIST_ITEM_ENTITY = "pre_admission_checklist_item"
PRE_ADMISSION_DOCUMENT_ENTITY = "pre_admission_document"
ADMISSION_PACKAGE_ENTITY = "admission_package"
ERP_INTEGRATION_ATTEMPT_ENTITY = "erp_integration_attempt"

TERMINAL_CASE_STATUSES = frozenset({"admitted", "dismissed", "cancelled", "offer_declined"})
READY_CHECKLIST_ITEM_STATUSES = frozenset({"approved", "waived"})

# [TECNICO: STATE_MACHINE]
# As transições permitidas são declaradas explicitamente para impedir mudança
# arbitrária de status nas rotas da API.
_ALLOWED_TRANSITIONS: dict[str, dict[str, frozenset[str]]] = {
    PRE_ADMISSION_CASE_ENTITY: {
        "draft": frozenset(
            {"offer_preparing", "offer_sent", "offer_accepted", "documents_pending", "documents_received", "cancelled"}
        ),
        "offer_preparing": frozenset(
            {"offer_sent", "offer_accepted", "documents_pending", "documents_received", "cancelled"}
        ),
        "offer_sent": frozenset(
            {"offer_accepted", "offer_declined", "documents_pending", "documents_received", "cancelled"}
        ),
        "offer_accepted": frozenset({"documents_pending", "documents_received", "ready_for_admission", "cancelled"}),
        "offer_declined": frozenset(),
        "documents_pending": frozenset({"documents_received", "ready_for_admission", "cancelled"}),
        "documents_received": frozenset({"documents_pending", "ready_for_admission", "cancelled"}),
        "ready_for_admission": frozenset({"documents_pending", "documents_received", "admitted", "cancelled"}),
        "admitted": frozenset({"dismissed"}),
        "dismissed": frozenset(),
        "cancelled": frozenset(),
    },
    PRE_ADMISSION_CHECKLIST_ITEM_ENTITY: {
        "pending": frozenset({"received", "waived"}),
        "received": frozenset({"approved", "rejected", "waived"}),
        "approved": frozenset(),
        "rejected": frozenset({"received", "waived"}),
        "waived": frozenset(),
    },
    PRE_ADMISSION_DOCUMENT_ENTITY: {
        "uploaded": frozenset({"approved", "rejected"}),
        "approved": frozenset(),
        "rejected": frozenset({"replaced"}),
        "replaced": frozenset(),
    },
    ADMISSION_PACKAGE_ENTITY: {
        "draft": frozenset({"ready_for_review", "cancelled"}),
        "ready_for_review": frozenset({"approved_for_export", "cancelled"}),
        "approved_for_export": frozenset({"exported", "cancelled"}),
        "exported": frozenset(),
        "cancelled": frozenset(),
    },
    ERP_INTEGRATION_ATTEMPT_ENTITY: {
        "draft": frozenset({"ready", "validation_failed"}),
        "ready": frozenset({"sent", "failed", "simulated"}),
        "validation_failed": frozenset(),
        "failed": frozenset({"simulated"}),
        "simulated": frozenset(),
        "sent": frozenset(),
    },
}


def assert_transition_allowed(entity: str, from_status: str, to_status: str) -> None:
    if from_status == to_status:
        return

    transitions = _ALLOWED_TRANSITIONS.get(entity)
    if transitions is None:
        raise ValidationException(f"Máquina de estados desconhecida para '{entity}'.")

    allowed_statuses = transitions.get(from_status)
    if allowed_statuses is None:
        raise ValidationException(f"Status desconhecido para {entity}: '{from_status}'.")

    if to_status not in allowed_statuses:
        raise InvalidPreAdmissionStatusTransition(
            entity=entity,
            from_status=from_status,
            to_status=to_status,
            allowed_statuses=sorted(allowed_statuses),
        )


def transition_status(subject: Any, *, entity: str, to_status: str) -> tuple[str, str]:
    from_status = str(getattr(subject, "status"))
    assert_transition_allowed(entity, from_status, to_status)
    setattr(subject, "status", to_status)
    return from_status, to_status


def case_is_terminal(status: str) -> bool:
    return status in TERMINAL_CASE_STATUSES


def derive_case_status_from_checklist(
    *,
    current_status: str,
    checklist_items: Iterable[Any],
) -> str:
    if case_is_terminal(current_status):
        return current_status

    items = list(checklist_items)
    if not items:
        return "documents_pending"

    required_items = [item for item in items if getattr(item, "required", False)]
    has_rejected = any(getattr(item, "status", None) == "rejected" for item in items)
    has_progress = any(getattr(item, "status", None) in {"received", "approved", "waived"} for item in items)
    required_items_resolved = all(
        getattr(item, "status", None) in READY_CHECKLIST_ITEM_STATUSES for item in required_items
    )

    if current_status == "ready_for_admission" and required_items_resolved:
        return current_status
    if has_rejected:
        return "documents_pending"
    if has_progress:
        return "documents_received"
    return "documents_pending"


def transition_payload(*, old_status: str, new_status: str) -> dict[str, str]:
    return {
        "old_status": old_status,
        "new_status": new_status,
        "from": old_status,
        "to": new_status,
    }


def required_items_ready(checklist_items: Iterable[Any]) -> bool:
    return all(
        (not getattr(item, "required", False))
        or getattr(item, "status", None) in READY_CHECKLIST_ITEM_STATUSES
        for item in checklist_items
    )
