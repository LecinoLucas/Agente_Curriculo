from copy import deepcopy

from src.application.services.protheus_payload_builder import (
    SCHEMA_VERSION,
    ProtheusPayloadBuilder,
)
from src.application.services.protheus_payload_validator import ProtheusPayloadValidator


def _snapshot_payload() -> dict:
    return {
        "candidate": {
            "id": "cand-1",
            "full_name": "Candidate ERP",
            "email": "candidate@example.com",
            "phone": "+5511999999999",
            "cpf": "390.533.447-05",
        },
        "job": {
            "id": "job-1",
            "title": "Backend Engineer",
            "department": "Tech",
            "location": "São Paulo",
        },
        "pre_admission": {
            "case_id": "case-1",
            "status": "ready_for_admission",
            "start_date": "2026-06-01",
            "salary_offer": 8500,
            "work_model": "hybrid",
        },
        "documents": [
            {
                "title": "CPF",
                "status": "approved",
                "document_id": "doc-1",
                "mime_type": "application/pdf",
                "size_bytes": 1024,
            }
        ],
        "decision": {
            "hiring_decision_id": "dec-1",
            "decision_outcome": "hire",
            "reason_code": "strong_fit",
            "submitted_at": "2026-05-14T10:00:00Z",
        },
    }


def test_builder_generates_v1_schema():
    builder = ProtheusPayloadBuilder()
    payload = builder.build_from_snapshot(snapshot_payload=_snapshot_payload(), mode="mock")

    assert payload["schema_version"] == SCHEMA_VERSION
    assert payload["provider"] == "protheus"
    assert payload["mode"] == "mock"
    assert payload["candidate"]["name"] == "Candidate ERP"
    assert payload["admission"]["start_date"] == "2026-06-01"


def test_builder_uses_snapshot_not_live_data():
    builder = ProtheusPayloadBuilder()
    snapshot = _snapshot_payload()
    original = deepcopy(snapshot)

    payload = builder.build_from_snapshot(snapshot_payload=snapshot, mode="mock")
    snapshot["candidate"]["full_name"] = "MUTATED"

    assert payload["candidate"]["name"] == "Candidate ERP"
    assert original["candidate"]["full_name"] == "Candidate ERP"


def test_validator_blocks_missing_candidate_cpf():
    builder = ProtheusPayloadBuilder()
    validator = ProtheusPayloadValidator()
    snapshot = _snapshot_payload()
    snapshot["candidate"]["cpf"] = None
    payload = builder.build_from_snapshot(snapshot_payload=snapshot, mode="mock")

    errors = validator.validate(payload)
    assert any(err["field"] == "candidate.cpf" for err in errors)


def test_validator_blocks_missing_start_date():
    builder = ProtheusPayloadBuilder()
    validator = ProtheusPayloadValidator()
    snapshot = _snapshot_payload()
    snapshot["pre_admission"]["start_date"] = None
    payload = builder.build_from_snapshot(snapshot_payload=snapshot, mode="mock")

    errors = validator.validate(payload)
    assert any(err["field"] == "admission.start_date" for err in errors)
