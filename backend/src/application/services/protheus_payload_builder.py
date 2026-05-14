"""Versioned Protheus payload builder based on admission package snapshots."""

from __future__ import annotations

from copy import deepcopy

SCHEMA_VERSION = "protheus_admission_payload_v1"


class ProtheusPayloadBuilder:
    """Build Protheus payload strictly from frozen package snapshots."""

    def build_from_snapshot(self, *, snapshot_payload: dict, mode: str) -> dict:
        payload = deepcopy(snapshot_payload or {})
        candidate = payload.get("candidate", {}) or {}
        job = payload.get("job", {}) or {}
        pre_admission = payload.get("pre_admission", {}) or {}
        decision = payload.get("decision", {}) or {}
        documents = payload.get("documents", []) or []

        return {
            "provider": "protheus",
            "mode": mode,
            "schema_version": SCHEMA_VERSION,
            "candidate": {
                "name": candidate.get("full_name"),
                "email": candidate.get("email"),
                "cpf": candidate.get("cpf"),
                "phone": candidate.get("phone"),
            },
            "job": {
                "title": job.get("title"),
                "department": job.get("department"),
                "location": job.get("location"),
            },
            "admission": {
                "start_date": pre_admission.get("start_date"),
                "salary_offer": pre_admission.get("salary_offer"),
                "work_model": pre_admission.get("work_model"),
            },
            "documents": [
                {
                    "title": doc.get("title"),
                    "status": doc.get("status"),
                    "document_id": doc.get("document_id"),
                    "mime_type": doc.get("mime_type"),
                    "size_bytes": doc.get("size_bytes"),
                }
                for doc in documents
            ],
            "decision": {
                "hiring_decision_id": decision.get("hiring_decision_id"),
                "decision_outcome": decision.get("decision_outcome"),
                "reason_code": decision.get("reason_code"),
                "submitted_at": decision.get("submitted_at"),
            },
        }
