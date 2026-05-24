from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.audit_model import AuditLogModel


class AuditService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def log_event(
        self,
        *,
        action: str,
        resource_type: str,
        resource_id: UUID,
        user_id: UUID | None,
        metadata: dict[str, Any] | None = None,
        before_state: dict[str, Any] | None = None,
        after_state: dict[str, Any] | None = None,
    ) -> AuditLogModel:
        event = AuditLogModel(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id=user_id,
            before_state=before_state,
            after_state=after_state,
            metadata_=metadata or {},
        )
        self._session.add(event)
        await self._session.flush()
        return event
