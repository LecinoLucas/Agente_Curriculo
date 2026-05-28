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
    PreAdmissionCaseModel,
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
EXPORTABLE_MODES = {MODE_MOCK, MODE_REAL}
RETRYABLE_ERROR_CODES = {
    "PROTHEUS_TIMEOUT",
    "PROTHEUS_CONNECTION_ERROR",
    "PROTHEUS_ERROR",
    "PROTHEUS_MOCK_VALIDATION_ERROR",
}
NON_RETRYABLE_ERROR_CODES = {
    "PROTHEUS_AUTH_ERROR",
    "PROTHEUS_VALIDATION_ERROR",
    "PROTHEUS_UNEXPECTED_ERROR",
}


class ErpIntegrationService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.package_repository = SQLAlchemyAdmissionPackageRepository(session)
        self.attempt_repository = SQLAlchemyErpIntegrationAttemptRepository(session)
        self.payload_builder = ProtheusPayloadBuilder()
        self.payload_validator = ProtheusPayloadValidator()
        self.mock_adapter = ProtheusMockAdapter()

    def get_protheus_capabilities(self) -> dict:
        mode = self._configured_mode()
        dry_run = self._dry_run_capability(mode)
        mock = self._mock_capability(mode)
        return {
            "provider": PROVIDER_PROTHEUS,
            "environment": settings.APP_ENV,
            "integration_mode": mode,
            "dry_run": dry_run,
            "simulation": dry_run,
            "mock": mock,
            "real_send": self._real_send_capability(),
        }

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
        return await self._create_export_attempt(
            package_id=package_id,
            user_id=user_id,
            mode=MODE_MOCK,
            simulate_failure=simulate_failure,
            allow_retry=False,
        )

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

        if not settings.PROTHEUS_REAL_SEND_ENABLED:
            raise ValidationException(
                "Envio real para Protheus está desabilitado pela feature flag. "
                "Configure PROTHEUS_REAL_SEND_ENABLED=true apenas em homologação controlada."
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
        return await self._create_export_attempt(
            package_id=package_id,
            user_id=user_id,
            mode=MODE_REAL,
            simulate_failure=False,
            allow_retry=False,
        )

    async def export_package_to_erp(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
        simulate_failure: bool = False,
    ):
        mode = self._configured_mode()
        if mode == MODE_DISABLED:
            raise ValidationException("Integração ERP está desabilitada.")
        if mode == MODE_DRY_RUN:
            raise ValidationException(
                "Exportação ERP explícita indisponível em mode=dry_run. "
                "Use o endpoint de dry-run ou configure ERP_INTEGRATION_MODE=mock/real."
            )
        if mode not in EXPORTABLE_MODES:
            raise ValidationException("Modo de exportação ERP não suportado.")

        if mode == MODE_REAL:
            return await self.create_protheus_homolog_attempt(
                package_id=package_id,
                user_id=user_id,
            )

        return await self._create_export_attempt(
            package_id=package_id,
            user_id=user_id,
            mode=MODE_MOCK,
            simulate_failure=simulate_failure,
            allow_retry=False,
        )

    async def retry_package_export(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
        simulate_failure: bool = False,
        mode_override: str | None = None,
    ):
        mode = mode_override or self._configured_mode()
        if mode not in EXPORTABLE_MODES:
            raise ValidationException(
                "Retry explícito indisponível para o modo atual de integração ERP."
            )

        latest = await self.attempt_repository.get_latest_by_package_provider_mode(
            package_id=package_id,
            provider=PROVIDER_PROTHEUS,
            mode=mode,
        )
        if latest is None:
            raise ValidationException("Nenhuma tentativa de exportação ERP encontrada para retry.")
        if latest.mode == MODE_DRY_RUN:
            raise ValidationException("Retry não é suportado para tentativas dry-run.")
        if latest.status != "failed":
            raise ValidationException("Retry permitido apenas após falha retryable.")

        error = latest.response_payload_json.get("error") if latest.response_payload_json else None
        if not isinstance(error, dict) or not error.get("retryable"):
            raise ValidationException("Retry permitido apenas após falha marcada como retryable.")

        await self._register_event(
            case_id=latest.case_id,
            event_type="erp_export_retry_requested",
            actor_id=user_id,
            payload={
                "attempt_id": str(latest.id),
                "package_id": str(latest.package_id),
                "provider": latest.provider,
                "mode": latest.mode,
                "attempt_number": latest.attempt_number,
            },
        )

        return await self._create_export_attempt(
            package_id=package_id,
            user_id=user_id,
            mode=mode,
            simulate_failure=simulate_failure,
            allow_retry=True,
        )

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
            return await self.retry_package_export(
                package_id=attempt.package_id,
                user_id=user_id,
                simulate_failure=simulate_failure,
                mode_override=attempt.mode,
            )

        if attempt.mode == MODE_REAL:
            return await self.retry_package_export(
                package_id=attempt.package_id,
                user_id=user_id,
                mode_override=attempt.mode,
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

    @staticmethod
    def _dry_run_capability(mode: str) -> dict:
        if mode == MODE_DISABLED:
            return {
                "available": False,
                "disabled_reason": "Integração ERP está desabilitada.",
            }
        if mode == MODE_REAL:
            return {
                "available": False,
                "disabled_reason": "mode=real bloqueado nesta fase.",
            }
        return {"available": True, "disabled_reason": None}

    @staticmethod
    def _mock_capability(mode: str) -> dict:
        if mode == MODE_MOCK:
            return {"available": True, "disabled_reason": None}
        if mode == MODE_DISABLED:
            return {
                "available": False,
                "disabled_reason": "Integração ERP está desabilitada.",
            }
        return {
            "available": False,
            "disabled_reason": "Mock send permitido apenas quando ERP_INTEGRATION_MODE=mock.",
        }

    @staticmethod
    def _real_send_capability() -> dict:
        blockers: list[str] = []
        missing_configuration: list[str] = []
        blocking_flags: list[str] = []

        if settings.APP_ENV == "production":
            blockers.append("Envio real para Protheus é proibido em produção.")
        if not settings.PROTHEUS_REAL_SEND_ENABLED:
            blocking_flags.append("PROTHEUS_REAL_SEND_ENABLED")
        if not settings.ERP_ALLOW_REAL_SEND:
            blocking_flags.append("ERP_ALLOW_REAL_SEND")

        if not settings.PROTHEUS_BASE_URL:
            missing_configuration.append("PROTHEUS_BASE_URL")
        auth_mode = (settings.PROTHEUS_AUTH_MODE or "").strip().lower()
        if auth_mode == "basic":
            if not settings.PROTHEUS_USERNAME:
                missing_configuration.append("PROTHEUS_USERNAME")
            if not settings.PROTHEUS_PASSWORD:
                missing_configuration.append("PROTHEUS_PASSWORD")
        elif auth_mode == "token":
            if not settings.PROTHEUS_TOKEN:
                missing_configuration.append("PROTHEUS_TOKEN")
        else:
            missing_configuration.append("PROTHEUS_AUTH_MODE")

        reasons = blockers.copy()
        if blocking_flags:
            reasons.append(
                "Feature flags de envio real desligadas: "
                + ", ".join(blocking_flags)
                + "."
            )
        if missing_configuration:
            reasons.append(
                "Configuração Protheus incompleta: "
                + ", ".join(missing_configuration)
                + "."
            )

        return {
            "available": not reasons,
            "disabled_reason": " ".join(reasons) if reasons else None,
            "missing_configuration": missing_configuration,
            "blocking_flags": blocking_flags,
        }

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

    async def _create_export_attempt(
        self,
        *,
        package_id: UUID,
        user_id: UUID | None,
        mode: str,
        simulate_failure: bool,
        allow_retry: bool,
    ):
        package = await self._required_package(package_id)
        self._ensure_package_allowed(package)
        await self._ensure_package_case_ready_for_erp(package)

        request_payload = self.payload_builder.build_from_snapshot(
            snapshot_payload=package.payload_json,
            mode=mode,
        )
        validation_errors = self.payload_validator.validate(request_payload)
        idempotency_key = self._build_idempotency_key(
            package_id=package.id,
            mode=mode,
            request_payload=request_payload,
        )
        existing = await self.attempt_repository.get_latest_by_idempotency_key(
            package_id=package.id,
            provider=PROVIDER_PROTHEUS,
            mode=mode,
            idempotency_key=idempotency_key,
        )
        if existing:
            if existing.status == "sent":
                if package.status != "exported":
                    await self.package_repository.mark_exported(package.id, exported_by=user_id)
                return existing
            if existing.status == "validation_failed":
                raise ValidationException(
                    "Última tentativa falhou em validação. Corrija o snapshot antes de exportar."
                )
            if existing.status == "failed" and not allow_retry:
                raise ValidationException(
                    "Última tentativa falhou. Use o endpoint de retry explícito."
                )

        attempt_number = (existing.attempt_number + 1) if existing else 1
        attempt = await self.attempt_repository.create(
            package_id=package.id,
            case_id=package.case_id,
            candidate_id=package.candidate_id,
            job_id=package.job_id,
            provider=PROVIDER_PROTHEUS,
            mode=mode,
            status="validation_failed" if validation_errors else "ready",
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

        await self._register_event(
            case_id=attempt.case_id,
            event_type="erp_export_requested",
            actor_id=user_id,
            payload={
                "attempt_id": str(attempt.id),
                "package_id": str(package.id),
                "provider": PROVIDER_PROTHEUS,
                "mode": mode,
                "attempt_number": attempt.attempt_number,
            },
        )

        if validation_errors:
            error_summary = self._build_error_summary(
                code="ERP_EXPORT_VALIDATION_FAILED",
                message="Snapshot inválido para exportação ERP.",
                stage="validation",
                retryable=False,
                field=validation_errors[0].get("field") if validation_errors else None,
                http_status=None,
            )
            attempt.response_payload_json = {
                "success": False,
                "error": error_summary,
                "validation_error_count": len(validation_errors),
            }
            attempt.error_message = error_summary["message"]
            attempt.completed_at = datetime.now(UTC)
            await self.session.flush()
            await self._register_event(
                case_id=attempt.case_id,
                event_type="erp_export_failed",
                actor_id=user_id,
                payload={
                    "attempt_id": str(attempt.id),
                    "package_id": str(package.id),
                    "provider": PROVIDER_PROTHEUS,
                    "mode": mode,
                    "error_code": error_summary["code"],
                    "retryable": False,
                },
            )
            return attempt

        await self._register_event(
            case_id=attempt.case_id,
            event_type="erp_export_started",
            actor_id=user_id,
            payload={
                "attempt_id": str(attempt.id),
                "package_id": str(package.id),
                "provider": PROVIDER_PROTHEUS,
                "mode": mode,
                "attempt_number": attempt.attempt_number,
            },
        )

        adapter_result = await self._send_to_adapter(
            mode=mode,
            request_payload=request_payload,
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
            if package.status != "exported":
                await self.package_repository.mark_exported(package.id, exported_by=user_id)
            await self._register_event(
                case_id=attempt.case_id,
                event_type="erp_export_succeeded",
                actor_id=user_id,
                payload={
                    "attempt_id": str(attempt.id),
                    "package_id": str(package.id),
                    "provider": PROVIDER_PROTHEUS,
                    "mode": mode,
                    "external_reference": attempt.external_reference,
                },
            )
            return attempt

        error_summary = self._build_error_summary(
            code=adapter_result.error_code or "ERP_EXPORT_FAILED",
            message=adapter_result.message,
            stage="delivery",
            retryable=self._is_retryable_error(adapter_result.error_code, adapter_result.http_status),
            field=None,
            http_status=adapter_result.http_status,
        )
        attempt = await self.attempt_repository.mark_failed(
            attempt_id=attempt.id,
            response_payload_json={
                "success": False,
                "error": error_summary,
            },
            error_message=error_summary["message"],
            http_status=adapter_result.http_status,
            request_headers_json=adapter_result.request_headers,
            response_headers_json=adapter_result.response_headers,
            attempted_by=user_id,
        )
        await self._register_event(
            case_id=attempt.case_id,
            event_type="erp_export_failed",
            actor_id=user_id,
            payload={
                "attempt_id": str(attempt.id),
                "package_id": str(package.id),
                "provider": PROVIDER_PROTHEUS,
                "mode": mode,
                "error_code": error_summary["code"],
                "retryable": error_summary["retryable"],
            },
        )
        return attempt

    @staticmethod
    def _build_idempotency_key(
        *,
        package_id: UUID,
        mode: str,
        request_payload: dict,
    ) -> str:
        payload_hash = hashlib.sha256(
            json.dumps(request_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return f"{PROVIDER_PROTHEUS}:{mode}:{package_id}:{SCHEMA_VERSION}:{payload_hash}"

    async def _send_to_adapter(
        self,
        *,
        mode: str,
        request_payload: dict,
        idempotency_key: str,
        simulate_failure: bool,
    ):
        if mode == MODE_MOCK:
            return self.mock_adapter.send(
                payload=request_payload,
                idempotency_key=idempotency_key,
                simulate_failure=simulate_failure,
            )

        adapter = ProtheusRealAdapter(
            base_url=settings.PROTHEUS_BASE_URL,
            auth_mode=settings.PROTHEUS_AUTH_MODE,
            username=settings.PROTHEUS_USERNAME if settings.PROTHEUS_AUTH_MODE == "basic" else None,
            password=settings.PROTHEUS_PASSWORD if settings.PROTHEUS_AUTH_MODE == "basic" else None,
            token=settings.PROTHEUS_TOKEN if settings.PROTHEUS_AUTH_MODE == "token" else None,
            timeout_seconds=settings.PROTHEUS_TIMEOUT_SECONDS,
            app_env=settings.APP_ENV,
            allow_real_send=settings.protheus_real_send_allowed,
        )
        return await adapter.send(
            payload=request_payload,
            idempotency_key=idempotency_key,
        )

    @staticmethod
    def _is_retryable_error(error_code: str | None, http_status: int | None) -> bool:
        if error_code in RETRYABLE_ERROR_CODES:
            return True
        if error_code in NON_RETRYABLE_ERROR_CODES:
            return False
        return bool(http_status and http_status >= 500)

    @staticmethod
    def _build_error_summary(
        *,
        code: str,
        message: str,
        stage: str,
        retryable: bool,
        field: str | None,
        http_status: int | None,
    ) -> dict:
        return {
            "code": code,
            "message": (message or "Falha na exportação ERP.")[:240],
            "stage": stage,
            "field": field,
            "retryable": retryable,
            "http_status": http_status,
            "timestamp": datetime.now(UTC).isoformat(),
        }

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

    async def _ensure_package_case_ready_for_erp(
        self,
        package: AdmissionExportPackageModel,
    ) -> None:
        case = await self.session.get(PreAdmissionCaseModel, package.case_id)
        if case is None:
            raise NotFoundException("Caso de pré-admissão não encontrado para exportação ERP.")
        if case.status not in {"ready_for_admission", "admitted"}:
            raise ValidationException(
                "Exportação ERP permitida apenas quando o caso está ready_for_admission ou admitted."
            )
