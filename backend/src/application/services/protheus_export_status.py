from __future__ import annotations

from typing import Literal, TypeAlias

KnownProtheusPayloadStatus: TypeAlias = Literal["ready", "incomplete"]
KnownProtheusExportQueueStatus: TypeAlias = Literal[
    "queued",
    "processing",
    "success",
    "retry_scheduled",
    "failed_permanent",
    "blocked",
    "cancelled",
]

PAYLOAD_STATUS_OPTIONS: tuple[KnownProtheusPayloadStatus, ...] = ("ready", "incomplete")
QUEUE_STATUS_OPTIONS: tuple[KnownProtheusExportQueueStatus, ...] = (
    "queued",
    "processing",
    "success",
    "retry_scheduled",
    "failed_permanent",
    "blocked",
    "cancelled",
)

MAX_BRIDGE_RETRY_ATTEMPTS = 3

_ACTIVE_STATUSES = frozenset({"queued", "processing", "retry_scheduled"})
_TERMINAL_STATUSES = frozenset({"success", "failed_permanent", "blocked", "cancelled"})
_CANCELLABLE_STATUSES = frozenset({"queued", "processing", "retry_scheduled"})
_NEW_REQUEST_ALLOWED_STATUSES = frozenset({"failed_permanent", "blocked", "cancelled"})

_STATUS_LABELS_PT: dict[str, str] = {
    "queued": "Solicitação enfileirada",
    "processing": "Aguardando processamento",
    "retry_scheduled": "Retry agendado",
    "success": "Exportação concluída",
    "failed_permanent": "Falha permanente",
    "blocked": "Bloqueado por guardrail",
    "cancelled": "Cancelado",
}

_PAYLOAD_STATUS_LABELS_PT: dict[str, str] = {
    "ready": "Payload pronto",
    "incomplete": "Payload incompleto",
}

_RECOMMENDED_ACTIONS_PT: dict[str, str] = {
    "queued": "Aguarde o processamento automático.",
    "processing": "Worker em execução. Aguarde a atualização da fila.",
    "retry_scheduled": "Retry automático agendado. Aguarde a próxima tentativa.",
    "success": "Concluído em modo seguro/STUB. Nenhum cadastro real foi executado.",
    "failed_permanent": "Falha permanente. Revise o caso antes de solicitar uma nova exportação.",
    "blocked": "Bloqueio técnico ativo. Revisão técnica obrigatória antes de nova tentativa.",
    "cancelled": "Solicitação cancelada. Nenhum envio ao Protheus real foi executado.",
}


def is_active_status(status: str | None) -> bool:
    return status in _ACTIVE_STATUSES


def is_terminal_status(status: str | None) -> bool:
    return status in _TERMINAL_STATUSES


def can_cancel(status: str | None) -> bool:
    return status in _CANCELLABLE_STATUSES


def can_request_new(status: str | None) -> bool:
    return status in _NEW_REQUEST_ALLOWED_STATUSES


def can_show_export_button(payload_status: str | None, queue_status: str | None) -> bool:
    if payload_status != "ready":
        return False
    if queue_status is None:
        return True
    return can_request_new(queue_status)


def status_label_pt_br(status: str | None) -> str:
    if status is None:
        return "Status desconhecido"
    return _STATUS_LABELS_PT.get(status, "Status desconhecido")


def payload_status_label_pt_br(status: str | None) -> str:
    if status is None:
        return "Status do payload desconhecido"
    return _PAYLOAD_STATUS_LABELS_PT.get(status, "Status do payload desconhecido")


def recommended_action_pt_br(status: str | None) -> str:
    if status is None:
        return "Revise o status da bridge antes de prosseguir."
    return _RECOMMENDED_ACTIONS_PT.get(status, "Revise o status da bridge antes de prosseguir.")
