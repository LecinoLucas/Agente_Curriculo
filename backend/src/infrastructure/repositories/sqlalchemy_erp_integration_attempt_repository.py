"""Repository for ERP integration attempts."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

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
            status=status,
            request_payload_json=request_payload_json,
            validation_errors_json=validation_errors_json,
            attempted_by=attempted_by,
        )
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def get_by_id(self, attempt_id: UUID) -> ErpIntegrationAttemptModel | None:
        return await self.session.get(ErpIntegrationAttemptModel, attempt_id)

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
        attempt.status = "simulated"
        attempt.response_payload_json = response_payload_json
        attempt.error_message = None
        attempt.attempted_by = attempted_by
        attempt.updated_at = now
        attempt.completed_at = now
        await self.session.flush()
        return attempt
