from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from src.infrastructure.repositories.sqlalchemy_audit_log_repository import (
    AuditLogListItem,
    AuditLogListResult,
    AuditLogListFilters,
    SQLAlchemyAuditLogRepository,
)


@dataclass(slots=True)
class AuditLogQuery:
    page: int = 1
    page_size: int = 20
    action: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    user_id: UUID | None = None
    search: str | None = None
    date_from: date | None = None
    date_to: date | None = None


class AuditLogService:
    def __init__(self, repository: SQLAlchemyAuditLogRepository) -> None:
        self._repository = repository

    async def list_audit_logs(self, query: AuditLogQuery) -> AuditLogListResult:
        return await self._repository.list_audit_logs(
            filters=AuditLogListFilters(
                action=self._clean_text(query.action),
                entity_type=self._clean_text(query.entity_type),
                entity_id=self._clean_text(query.entity_id),
                user_id=query.user_id,
                search=self._clean_text(query.search),
                date_from=query.date_from,
                date_to=query.date_to,
            ),
            page=query.page,
            page_size=query.page_size,
        )

    async def get_audit_log_by_id(self, audit_log_id: UUID) -> AuditLogListItem | None:
        return await self._repository.get_audit_log_by_id(audit_log_id)

    @staticmethod
    def _clean_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None
