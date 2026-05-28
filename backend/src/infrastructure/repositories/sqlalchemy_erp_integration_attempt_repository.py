"""Repository for ERP integration attempts."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pre_admission_state_machine import (
    ERP_INTEGRATION_ATTEMPT_ENTITY,
    transition_status,
)
from src.infrastructure.database.models.erp_integration_attempt_model import (
    ErpIntegrationAttemptModel,
)


class SQLAlchemyErpIntegrationAttemptRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        *,
        package_id: UUID,
        case_id: UUID,
        candidate_id: UUID,
        job_id: UUID,
        provider: str,
        mode: str,
        status: str,
        idempotency_key: str | None,
        external_reference: str | None,
        http_status: int | None,
        request_headers_json: dict | None,
        response_headers_json: dict | None,
        attempt_number: int,
        request_payload_json: dict,
        validation_errors_json: list[dict] | None,
        attempted_by: UUID | None,
    ) -> ErpIntegrationAttemptModel:
        attempt = ErpIntegrationAttemptModel(
            package_id=package_id,
            case_id=case_id,
            candidate_id=candidate_id,
            job_id=job_id,
            provider=provider,
            mode=mode,
            status="draft",
            idempotency_key=idempotency_key,
            external_reference=external_reference,
            http_status=http_status,
            request_headers_json=request_headers_json,
            response_headers_json=response_headers_json,
            attempt_number=attempt_number,
            request_payload_json=request_payload_json,
            validation_errors_json=validation_errors_json,
            attempted_by=attempted_by,
        )
        transition_status(attempt, entity=ERP_INTEGRATION_ATTEMPT_ENTITY, to_status=status)
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def get_latest_by_idempotency_key(
        self,
        *,
        package_id: UUID,
        provider: str,
        mode: str,
        idempotency_key: str,
    ) -> ErpIntegrationAttemptModel | None:
        stmt = (
            sa.select(ErpIntegrationAttemptModel)
            .where(ErpIntegrationAttemptModel.package_id == package_id)
            .where(ErpIntegrationAttemptModel.provider == provider)
            .where(ErpIntegrationAttemptModel.mode == mode)
            .where(ErpIntegrationAttemptModel.idempotency_key == idempotency_key)
            .order_by(
                ErpIntegrationAttemptModel.attempt_number.desc(),
                ErpIntegrationAttemptModel.created_at.desc(),
                ErpIntegrationAttemptModel.id.desc(),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, attempt_id: UUID) -> ErpIntegrationAttemptModel | None:
        return await self.session.get(ErpIntegrationAttemptModel, attempt_id)

    async def get_latest_by_package_provider_mode(
        self,
        *,
        package_id: UUID,
        provider: str,
        mode: str,
    ) -> ErpIntegrationAttemptModel | None:
        stmt = (
            sa.select(ErpIntegrationAttemptModel)
            .where(ErpIntegrationAttemptModel.package_id == package_id)
            .where(ErpIntegrationAttemptModel.provider == provider)
            .where(ErpIntegrationAttemptModel.mode == mode)
            .order_by(
                ErpIntegrationAttemptModel.created_at.desc(),
                ErpIntegrationAttemptModel.attempt_number.desc(),
                ErpIntegrationAttemptModel.id.desc(),
            )
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_package_id(self, package_id: UUID) -> list[ErpIntegrationAttemptModel]:
        stmt = (
            sa.select(ErpIntegrationAttemptModel)
            .where(ErpIntegrationAttemptModel.package_id == package_id)
            .order_by(ErpIntegrationAttemptModel.created_at.desc(), ErpIntegrationAttemptModel.id.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def mark_simulated(
        self,
        *,
        attempt_id: UUID,
        response_payload_json: dict,
        attempted_by: UUID | None,
    ) -> ErpIntegrationAttemptModel:
        attempt = await self.get_by_id(attempt_id)
        if attempt is None:
            raise ValueError(f"ERP integration attempt {attempt_id} not found")

        now = datetime.now(UTC)
        transition_status(attempt, entity=ERP_INTEGRATION_ATTEMPT_ENTITY, to_status="simulated")
        attempt.response_payload_json = response_payload_json
        attempt.external_reference = response_payload_json.get("external_reference")
        attempt.http_status = 200
        attempt.error_message = None
        attempt.attempted_by = attempted_by
        attempt.updated_at = now
        attempt.completed_at = now
        await self.session.flush()
        return attempt

    async def mark_failed(
        self,
        *,
        attempt_id: UUID,
        response_payload_json: dict | None,
        error_message: str,
        http_status: int | None,
        request_headers_json: dict | None,
        response_headers_json: dict | None,
        attempted_by: UUID | None,
    ) -> ErpIntegrationAttemptModel:
        attempt = await self.get_by_id(attempt_id)
        if attempt is None:
            raise ValueError(f"ERP integration attempt {attempt_id} not found")

        now = datetime.now(UTC)
        transition_status(attempt, entity=ERP_INTEGRATION_ATTEMPT_ENTITY, to_status="failed")
        attempt.response_payload_json = response_payload_json
        attempt.error_message = error_message
        attempt.http_status = http_status
        attempt.request_headers_json = request_headers_json
        attempt.response_headers_json = response_headers_json
        attempt.attempted_by = attempted_by
        attempt.updated_at = now
        attempt.completed_at = now
        await self.session.flush()
        return attempt

    async def mark_sent(
        self,
        *,
        attempt_id: UUID,
        response_payload_json: dict | None,
        external_reference: str | None,
        http_status: int | None,
        request_headers_json: dict | None,
        response_headers_json: dict | None,
        attempted_by: UUID | None,
    ) -> ErpIntegrationAttemptModel:
        attempt = await self.get_by_id(attempt_id)
        if attempt is None:
            raise ValueError(f"ERP integration attempt {attempt_id} not found")

        now = datetime.now(UTC)
        transition_status(attempt, entity=ERP_INTEGRATION_ATTEMPT_ENTITY, to_status="sent")
        attempt.response_payload_json = response_payload_json
        attempt.external_reference = external_reference
        attempt.error_message = None
        attempt.http_status = http_status
        attempt.request_headers_json = request_headers_json
        attempt.response_headers_json = response_headers_json
        attempt.attempted_by = attempted_by
        attempt.updated_at = now
        attempt.completed_at = now
        await self.session.flush()
        return attempt
