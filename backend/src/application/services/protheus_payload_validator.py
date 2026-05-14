"""Validation rules for Protheus payload contract v1."""

from __future__ import annotations

from src.application.services.protheus_payload_builder import SCHEMA_VERSION


class ProtheusPayloadValidator:
    def validate(self, payload: dict) -> list[dict]:
        errors: list[dict] = []

        def _require(path: str, value) -> None:
            if value is None:
                errors.append({"field": path, "message": "Campo obrigatório ausente"})
                return
            if isinstance(value, str) and not value.strip():
                errors.append({"field": path, "message": "Campo obrigatório vazio"})

        _require("schema_version", payload.get("schema_version"))
        if payload.get("schema_version") != SCHEMA_VERSION:
            errors.append(
                {
                    "field": "schema_version",
                    "message": f"Schema inválido. Esperado: {SCHEMA_VERSION}",
                }
            )

        _require("candidate.name", payload.get("candidate", {}).get("name"))
        _require("candidate.email", payload.get("candidate", {}).get("email"))
        _require("candidate.cpf", payload.get("candidate", {}).get("cpf"))
        _require("job.title", payload.get("job", {}).get("title"))
        _require("admission.start_date", payload.get("admission", {}).get("start_date"))
        _require("admission.salary_offer", payload.get("admission", {}).get("salary_offer"))
        _require("decision.hiring_decision_id", payload.get("decision", {}).get("hiring_decision_id"))

        docs = payload.get("documents", []) or []
        approved_docs = [
            d for d in docs if (d.get("status") or "").strip().lower() == "approved"
        ]
        if not approved_docs:
            errors.append(
                {
                    "field": "documents",
                    "message": "É necessário ao menos um documento aprovado para envio Protheus.",
                }
            )

        return errors
