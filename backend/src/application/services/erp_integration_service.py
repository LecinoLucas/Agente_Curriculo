"""Dry-run ERP integration service for admission packages."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.database.models import (
    AdmissionExportPackageModel,
    PreAdmissionEventModel,
)
from src.infrastructure.repositories.sqlalchemy_admission_package_repository import (
    SQLAlchemyAdmissionPackageRepository,
)
from src.infrastructure.repositories.sqlalchemy_erp_integration_attempt_repository import (
    SQLAlchemyErpIntegrationAttemptRepository,
)

DRY_RUN_MODE = "dry_run"
PROVIDER_PROTHEUS = "protheus"
PACKAGE_ALLOWED_STATUSES = {"approved_for_export", "exported"}


class ErpIntegrationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.package_repository = SQLAlchemyAdmissionPackageRepository(session)
        self.attempt_repository = SQLAlchemyErpIntegrationAttemptRepository(session)

    async def create_protheus_dry_run_attempt(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
    ):
        package = await self._required_package(package_id)
        if package.status not in PACKAGE_ALLOWED_STATUSES:
            raise ValidationException(
                "Simulação Protheus disponível apenas para pacote approved_for_export ou exported."
            )

        request_payload = self._build_protheus_payload(package.payload_json)
        validation_errors = self._validate_payload(request_payload)
        status = "validation_failed" if validation_errors else "ready"

        attempt = await self.attempt_repository.create(
            package_id=package.id,
            case_id=package.case_id,
            candidate_id=package.candidate_id,
            job_id=package.job_id,
            provider=PROVIDER_PROTHEUS,
            mode=DRY_RUN_MODE,
            status=status,
            request_payload_json=request_payload,
            validation_errors_json=validation_errors if validation_errors else None,
            attempted_by=user_id,
        )
        await self._register_event(
            case_id=package.case_id,
            event_type="erp_dry_run_attempt_created",
            actor_id=user_id,
            payload={
                "attempt_id": str(attempt.id),
                "package_id": str(package.id),
                "provider": PROVIDER_PROTHEUS,
                "mode": DRY_RUN_MODE,
                "status": status,
                "validation_error_count": len(validation_errors),
            },
        )
        return attempt

    async def list_attempts(self, *, package_id: UUID):
        await self._required_package(package_id)
        return await self.attempt_repository.list_by_package_id(package_id)

    async def get_attempt(self, *, attempt_id: UUID):
        attempt = await self.attempt_repository.get_by_id(attempt_id)
        if attempt is None:
            raise NotFoundException("Tentativa de integração ERP não encontrada.")
        return attempt

    async def simulate_attempt(
        self,
        *,
        attempt_id: UUID,
        user_id: UUID | None,
    ):
        attempt = await self.get_attempt(attempt_id=attempt_id)

        if attempt.mode != DRY_RUN_MODE:
            raise ValidationException("Nesta fase, apenas mode=dry_run é permitido.")
        if attempt.status == "validation_failed":
            raise ValidationException("Tentativa com erro de validação não pode ser simulada.")
        if attempt.status not in {"ready", "failed"}:
            raise ValidationException("Somente tentativas ready ou failed podem ser simuladas.")

        response_payload = {
            "success": True,
            "external_reference": f"DRY-RUN-{uuid4().hex[:12].upper()}",
            "message": "Simulação concluída. Nenhum dado foi enviado ao ERP.",
        }
        updated = await self.attempt_repository.mark_simulated(
            attempt_id=attempt.id,
            response_payload_json=response_payload,
            attempted_by=user_id,
        )
        await self._register_event(
            case_id=updated.case_id,
            event_type="erp_dry_run_simulated",
            actor_id=user_id,
            payload={
                "attempt_id": str(updated.id),
                "package_id": str(updated.package_id),
                "external_reference": response_payload["external_reference"],
                "status": updated.status,
            },
        )
        return updated

    async def _required_package(self, package_id: UUID) -> AdmissionExportPackageModel:
        package = await self.package_repository.get_by_id(package_id)
        if package is None:
            raise NotFoundException("Pacote de admissão não encontrado.")
        return package

    def _build_protheus_payload(self, snapshot_payload: dict) -> dict:
        candidate = snapshot_payload.get("candidate", {}) or {}
        job = snapshot_payload.get("job", {}) or {}
        pre_admission = snapshot_payload.get("pre_admission", {}) or {}
        decision = snapshot_payload.get("decision", {}) or {}
        documents = snapshot_payload.get("documents", []) or []

        return {
            "provider": PROVIDER_PROTHEUS,
            "mode": DRY_RUN_MODE,
            "candidate": {
                "name": candidate.get("full_name"),
                "email": candidate.get("email"),
                "cpf": candidate.get("cpf"),
            },
            "job": {
                "title": job.get("title"),
                "department": job.get("department"),
            },
            "admission": {
                "start_date": pre_admission.get("start_date"),
                "salary_offer": pre_admission.get("salary_offer"),
                "work_model": pre_admission.get("work_model"),
            },
            "decision": {
                "hiring_decision_id": decision.get("hiring_decision_id"),
            },
            "documents": [
                {
                    "title": doc.get("title"),
                    "status": doc.get("status"),
                    "document_id": doc.get("document_id"),
                }
                for doc in documents
            ],
        }

    def _validate_payload(self, payload: dict) -> list[dict]:
        errors: list[dict] = []

        def _require(path: str, value):
            if value is None:
                errors.append({"field": path, "message": "Campo obrigatório ausente"})
                return
            if isinstance(value, str) and not value.strip():
                errors.append({"field": path, "message": "Campo obrigatório vazio"})

        _require("candidate.name", payload.get("candidate", {}).get("name"))
        _require("candidate.email", payload.get("candidate", {}).get("email"))
        _require("candidate.cpf", payload.get("candidate", {}).get("cpf"))
        _require("job.title", payload.get("job", {}).get("title"))
        _require("admission.start_date", payload.get("admission", {}).get("start_date"))
        _require("admission.salary_offer", payload.get("admission", {}).get("salary_offer"))
        _require(
            "decision.hiring_decision_id",
            payload.get("decision", {}).get("hiring_decision_id"),
        )

        docs = payload.get("documents", []) or []
        approved_docs = [
            d for d in docs if (d.get("status") or "").strip().lower() == "approved"
        ]
        if not approved_docs:
            errors.append(
                {
                    "field": "documents",
                    "message": "É necessário ao menos um documento aprovado para simulação.",
                }
            )

        return errors

    async def _register_event(
        self,
        *,
        case_id: UUID,
        event_type: str,
        actor_id: UUID | None,
        payload: dict,
    ) -> None:
        event = PreAdmissionEventModel(
            case_id=case_id,
            event_type=event_type,
            actor_id=actor_id,
            payload_json=payload,
            created_at=datetime.now(UTC),
        )
        self.session.add(event)
        await self.session.flush()
