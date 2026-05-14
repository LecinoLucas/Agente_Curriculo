"""ERP integration service with dry-run and controlled Protheus mock adapter."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.protheus_adapter import ProtheusMockAdapter
from src.application.services.protheus_real_adapter import ProtheusRealAdapter
from src.application.services.protheus_payload_builder import (
    SCHEMA_VERSION,
    ProtheusPayloadBuilder,
)
from src.application.services.protheus_payload_validator import ProtheusPayloadValidator
from src.core.settings import settings
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

MODE_DISABLED = "disabled"
MODE_DRY_RUN = "dry_run"
MODE_MOCK = "mock"
MODE_REAL = "real"

PROVIDER_PROTHEUS = "protheus"
PACKAGE_ALLOWED_STATUSES = {"approved_for_export", "exported"}


class ErpIntegrationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.package_repository = SQLAlchemyAdmissionPackageRepository(session)
        self.attempt_repository = SQLAlchemyErpIntegrationAttemptRepository(session)
        self.payload_builder = ProtheusPayloadBuilder()
        self.payload_validator = ProtheusPayloadValidator()
        self.mock_adapter = ProtheusMockAdapter()

    async def create_protheus_dry_run_attempt(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
    ):
        self._ensure_allowed_for_phase()
        self._ensure_not_disabled()
        package = await self._required_package(package_id)
        self._ensure_package_allowed(package)

        request_payload = self.payload_builder.build_from_snapshot(
            snapshot_payload=package.payload_json,
            mode=MODE_DRY_RUN,
        )
        validation_errors = self.payload_validator.validate(request_payload)
        status = "validation_failed" if validation_errors else "ready"

        attempt = await self.attempt_repository.create(
            package_id=package.id,
            case_id=package.case_id,
            candidate_id=package.candidate_id,
            job_id=package.job_id,
            provider=PROVIDER_PROTHEUS,
            mode=MODE_DRY_RUN,
            status=status,
            idempotency_key=None,
            external_reference=None,
            http_status=None,
            request_headers_json=None,
            response_headers_json=None,
            attempt_number=1,
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
                "mode": MODE_DRY_RUN,
                "status": status,
                "validation_error_count": len(validation_errors),
            },
        )
        return attempt

    async def create_protheus_mock_attempt(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
        simulate_failure: bool = False,
    ):
        self._ensure_allowed_for_phase()
        if self._configured_mode() != MODE_MOCK:
            raise ValidationException(
                "Mock send permitido apenas quando ERP_INTEGRATION_MODE=mock."
            )

        package = await self._required_package(package_id)
        self._ensure_package_allowed(package)

        request_payload = self.payload_builder.build_from_snapshot(
            snapshot_payload=package.payload_json,
            mode=MODE_MOCK,
        )
        validation_errors = self.payload_validator.validate(request_payload)

        payload_hash = hashlib.sha256(
            json.dumps(request_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        idempotency_key = (
            f"{PROVIDER_PROTHEUS}:{MODE_MOCK}:{package.id}:{SCHEMA_VERSION}:{payload_hash}"
        )

        existing = await self.attempt_repository.get_latest_by_idempotency_key(
            package_id=package.id,
            provider=PROVIDER_PROTHEUS,
            mode=MODE_MOCK,
            idempotency_key=idempotency_key,
        )
        if existing and existing.status in {"sent", "simulated"}:
            return existing

        attempt_number = (existing.attempt_number + 1) if existing else 1
        attempt_status = "validation_failed" if validation_errors else "ready"

        attempt = await self.attempt_repository.create(
            package_id=package.id,
            case_id=package.case_id,
            candidate_id=package.candidate_id,
            job_id=package.job_id,
            provider=PROVIDER_PROTHEUS,
            mode=MODE_MOCK,
            status=attempt_status,
            idempotency_key=idempotency_key,
            external_reference=None,
            http_status=None,
            request_headers_json=None,
            response_headers_json=None,
            attempt_number=attempt_number,
            request_payload_json=request_payload,
            validation_errors_json=validation_errors if validation_errors else None,
            attempted_by=user_id,
        )

        if validation_errors:
            await self._register_event(
                case_id=attempt.case_id,
                event_type="erp_mock_attempt_created",
                actor_id=user_id,
                payload={
                    "attempt_id": str(attempt.id),
                    "package_id": str(package.id),
                    "mode": MODE_MOCK,
                    "status": attempt.status,
                    "idempotency_key": idempotency_key,
                    "validation_error_count": len(validation_errors),
                },
            )
            return attempt

        adapter_result = self.mock_adapter.send(
            payload=request_payload,
            idempotency_key=idempotency_key,
            simulate_failure=simulate_failure,
        )
        if adapter_result.success:
            attempt = await self.attempt_repository.mark_sent(
                attempt_id=attempt.id,
                response_payload_json={
                    "success": True,
                    "external_reference": adapter_result.external_reference,
                    "message": adapter_result.message,
                },
                external_reference=adapter_result.external_reference,
                http_status=adapter_result.http_status,
                request_headers_json=adapter_result.request_headers,
                response_headers_json=adapter_result.response_headers,
                attempted_by=user_id,
            )
            event_type = "erp_mock_sent"
        else:
            attempt = await self.attempt_repository.mark_failed(
                attempt_id=attempt.id,
                response_payload_json={
                    "success": False,
                    "error_code": adapter_result.error_code,
                    "message": adapter_result.message,
                },
                error_message=adapter_result.message,
                http_status=adapter_result.http_status,
                request_headers_json=adapter_result.request_headers,
                response_headers_json=adapter_result.response_headers,
                attempted_by=user_id,
            )
            event_type = "erp_mock_failed"

        await self._register_event(
            case_id=attempt.case_id,
            event_type=event_type,
            actor_id=user_id,
            payload={
                "attempt_id": str(attempt.id),
                "package_id": str(package.id),
                "mode": MODE_MOCK,
                "status": attempt.status,
                "idempotency_key": idempotency_key,
                "external_reference": attempt.external_reference,
            },
        )
        return attempt

    async def create_protheus_homolog_attempt(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
    ):
        """Send to real Protheus homologation environment with security gates."""
        # Security gates
        if settings.APP_ENV == "production":
            raise ValidationException(
                "Envio real para Protheus é proibido em produção. "
                "Configure APP_ENV != production."
            )

        if not settings.ERP_ALLOW_REAL_SEND:
            raise ValidationException(
                "Envio real para Protheus está desabilitado. "
                "Configure ERP_ALLOW_REAL_SEND=true apenas em homologação."
            )

        if not settings.PROTHEUS_BASE_URL:
            raise ValidationException(
                "Protheus não configurado. Configure PROTHEUS_BASE_URL."
            )
        package = await self._required_package(package_id)
        self._ensure_package_allowed(package)

        request_payload = self.payload_builder.build_from_snapshot(
            snapshot_payload=package.payload_json,
            mode=MODE_REAL,
        )
        validation_errors = self.payload_validator.validate(request_payload)

        payload_hash = hashlib.sha256(
            json.dumps(request_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        idempotency_key = (
            f"{PROVIDER_PROTHEUS}:{MODE_REAL}:{package.id}:{SCHEMA_VERSION}:{payload_hash}"
        )

        # Check for existing attempt with same idempotency key
        existing = await self.attempt_repository.get_latest_by_idempotency_key(
            package_id=package.id,
            provider=PROVIDER_PROTHEUS,
            mode=MODE_REAL,
            idempotency_key=idempotency_key,
        )
        if existing and existing.status == "sent":
            return existing

        attempt_number = (existing.attempt_number + 1) if existing else 1
        attempt_status = "validation_failed" if validation_errors else "ready"

        attempt = await self.attempt_repository.create(
            package_id=package.id,
            case_id=package.case_id,
            candidate_id=package.candidate_id,
            job_id=package.job_id,
            provider=PROVIDER_PROTHEUS,
            mode=MODE_REAL,
            status=attempt_status,
            idempotency_key=idempotency_key,
            external_reference=None,
            http_status=None,
            request_headers_json=None,
            response_headers_json=None,
            attempt_number=attempt_number,
            request_payload_json=request_payload,
            validation_errors_json=validation_errors if validation_errors else None,
            attempted_by=user_id,
        )

        if validation_errors:
            await self._register_event(
                case_id=attempt.case_id,
                event_type="erp_homolog_attempt_created",
                actor_id=user_id,
                payload={
                    "attempt_id": str(attempt.id),
                    "package_id": str(package.id),
                    "mode": MODE_REAL,
                    "status": attempt.status,
                    "idempotency_key": idempotency_key,
                    "validation_error_count": len(validation_errors),
                },
            )
            return attempt

        # Create real adapter
        adapter = ProtheusRealAdapter(
            base_url=settings.PROTHEUS_BASE_URL,
            auth_mode=settings.PROTHEUS_AUTH_MODE,
            username=settings.PROTHEUS_USERNAME if settings.PROTHEUS_AUTH_MODE == "basic" else None,
            password=settings.PROTHEUS_PASSWORD if settings.PROTHEUS_AUTH_MODE == "basic" else None,
            token=settings.PROTHEUS_TOKEN if settings.PROTHEUS_AUTH_MODE == "token" else None,
            timeout_seconds=settings.PROTHEUS_TIMEOUT_SECONDS,
            app_env=settings.APP_ENV,
            allow_real_send=settings.ERP_ALLOW_REAL_SEND,
        )

        # Send to Protheus
        adapter_result = await adapter.send(
            payload=request_payload,
            idempotency_key=idempotency_key,
        )

        if adapter_result.success:
            attempt = await self.attempt_repository.mark_sent(
                attempt_id=attempt.id,
                response_payload_json={
                    "success": True,
                    "external_reference": adapter_result.external_reference,
                    "message": adapter_result.message,
                },
                external_reference=adapter_result.external_reference,
                http_status=adapter_result.http_status,
                request_headers_json=adapter_result.request_headers,
                response_headers_json=adapter_result.response_headers,
                attempted_by=user_id,
            )
            event_type = "erp_homolog_sent"
        else:
            attempt = await self.attempt_repository.mark_failed(
                attempt_id=attempt.id,
                response_payload_json={
                    "success": False,
                    "error_code": adapter_result.error_code,
                    "message": adapter_result.message,
                    "error_details": adapter_result.error_details,
                },
                error_message=adapter_result.message,
                http_status=adapter_result.http_status,
                request_headers_json=adapter_result.request_headers,
                response_headers_json=adapter_result.response_headers,
                attempted_by=user_id,
            )
            event_type = "erp_homolog_failed"

        await self._register_event(
            case_id=attempt.case_id,
            event_type=event_type,
            actor_id=user_id,
            payload={
                "attempt_id": str(attempt.id),
                "package_id": str(package.id),
                "mode": MODE_REAL,
                "status": attempt.status,
                "idempotency_key": idempotency_key,
                "external_reference": attempt.external_reference,
            },
        )
        return attempt

    async def retry_attempt(
        self,
        *,
        attempt_id: UUID,
        user_id: UUID | None,
        simulate_failure: bool = False,
    ):
        self._ensure_allowed_for_phase()
        attempt = await self.get_attempt(attempt_id=attempt_id)
        if attempt.status not in {"failed", "validation_failed"}:
            raise ValidationException(
                "Retry permitido apenas para tentativas failed ou validation_failed."
            )

        if attempt.mode == MODE_MOCK:
            return await self.create_protheus_mock_attempt(
                package_id=attempt.package_id,
                user_id=user_id,
                simulate_failure=simulate_failure,
            )

        if attempt.mode == MODE_REAL:
            return await self.create_protheus_homolog_attempt(
                package_id=attempt.package_id,
                user_id=user_id,
            )

        if attempt.mode == MODE_DRY_RUN:
            raise ValidationException("Retry não é suportado para tentativas dry-run.")

        raise ValidationException("Retry não suportado para este modo.")

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
        self._ensure_allowed_for_phase()
        self._ensure_not_disabled()
        attempt = await self.get_attempt(attempt_id=attempt_id)

        if attempt.mode != MODE_DRY_RUN:
            raise ValidationException("Nesta fase, o endpoint simulate aceita apenas mode=dry_run.")
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

    def _configured_mode(self) -> str:
        return (settings.ERP_INTEGRATION_MODE or MODE_DRY_RUN).strip().lower()

    def _ensure_allowed_for_phase(self) -> None:
        if self._configured_mode() == MODE_REAL:
            raise ValidationException("mode=real bloqueado nesta fase.")

    def _ensure_not_disabled(self) -> None:
        if self._configured_mode() == MODE_DISABLED:
            raise ValidationException("Integração ERP está desabilitada.")

    @staticmethod
    def _ensure_package_allowed(package: AdmissionExportPackageModel) -> None:
        if package.status not in PACKAGE_ALLOWED_STATUSES:
            raise ValidationException(
                "Integração Protheus disponível apenas para pacote approved_for_export ou exported."
            )

    async def _required_package(self, package_id: UUID) -> AdmissionExportPackageModel:
        package = await self.package_repository.get_by_id(package_id)
        if package is None:
            raise NotFoundException("Pacote de admissão não encontrado.")
        return package

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
