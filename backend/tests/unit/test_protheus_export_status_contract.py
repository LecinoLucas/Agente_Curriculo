from __future__ import annotations

import json
from pathlib import Path

from src.application.services.protheus_export_status import (
    MAX_BRIDGE_RETRY_ATTEMPTS,
    PAYLOAD_STATUS_OPTIONS,
    QUEUE_STATUS_OPTIONS,
    can_cancel,
    can_request_new,
    can_show_export_button,
    payload_status_label_pt_br,
    recommended_action_pt_br,
    status_label_pt_br,
)


def test_snapshot_matches_backend_status_contract() -> None:
    snapshot = json.loads(
        Path("../docs/protheus/export_status_contract.snapshot.json").read_text(encoding="utf-8")
    )
    assert snapshot["contract_version"] == "protheus_export_status.v1"
    assert snapshot["payload_statuses"] == list(PAYLOAD_STATUS_OPTIONS)
    assert snapshot["queue_statuses"] == list(QUEUE_STATUS_OPTIONS)
    assert snapshot["max_attempts"] == MAX_BRIDGE_RETRY_ATTEMPTS
    assert snapshot["terminal_statuses"] == ["success", "failed_permanent", "blocked", "cancelled"]
    assert snapshot["active_statuses"] == ["queued", "processing", "retry_scheduled"]


def test_all_known_statuses_have_labels_and_actions() -> None:
    for status in QUEUE_STATUS_OPTIONS:
        assert status_label_pt_br(status) != "Status desconhecido"
        assert recommended_action_pt_br(status)
    for status in PAYLOAD_STATUS_OPTIONS:
        assert payload_status_label_pt_br(status) != "Status do payload desconhecido"


def test_permissions_and_unknown_fallback_are_safe() -> None:
    assert can_cancel("queued") is True
    assert can_cancel("failed_permanent") is False
    assert can_request_new("failed_permanent") is True
    assert can_request_new("success") is False
    assert can_show_export_button("ready", None) is True
    assert can_show_export_button("ready", "queued") is False
    assert can_show_export_button("incomplete", None) is False
    assert status_label_pt_br("unexpected") == "Status desconhecido"
    assert payload_status_label_pt_br("unexpected") == "Status do payload desconhecido"
