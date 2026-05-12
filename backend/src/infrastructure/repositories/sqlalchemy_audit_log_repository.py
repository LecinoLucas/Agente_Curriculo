from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.audit_model import AuditLogModel
from src.infrastructure.database.models.user_model import UserModel


@dataclass(slots=True)
class AuditLogListFilters:
    action: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    user_id: UUID | None = None
    search: str | None = None
    date_from: date | None = None
    date_to: date | None = None


@dataclass(slots=True)
class AuditLogListItem:
    id: UUID
    action: str
    entity_type: str
    entity_id: UUID | None
    user_id: UUID | None
    user_name: str | None
    user_email: str | None
    metadata: dict[str, Any]
    before_state: dict[str, Any] | None
    after_state: dict[str, Any] | None
    created_at: datetime
    request_id: UUID | None
    correlation_id: str | None


@dataclass(slots=True)
class AuditLogListResult:
    items: list[AuditLogListItem]
    total: int


class SQLAlchemyAuditLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_audit_logs(
        self,
        *,
        filters: AuditLogListFilters,
        page: int,
        page_size: int,
    ) -> AuditLogListResult:
        where_clauses = self._build_filters(filters)
        total = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(AuditLogModel)
                    .outerjoin(UserModel, UserModel.id == AuditLogModel.user_id)
                    .where(*where_clauses)
                )
            )
            or 0
        )

        result = await self._session.execute(
            sa.select(
                AuditLogModel,
                UserModel.full_name.label("user_name"),
                UserModel.email.label("user_email"),
            )
            .outerjoin(UserModel, UserModel.id == AuditLogModel.user_id)
            .where(*where_clauses)
            .order_by(AuditLogModel.timestamp.desc(), AuditLogModel.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        items = [
            self._to_list_item(
                audit_log=row[0],
                user_name=row.user_name,
                user_email=row.user_email,
            )
            for row in result.all()
        ]
        return AuditLogListResult(items=items, total=total)

    async def get_audit_log_by_id(self, audit_log_id: UUID) -> AuditLogListItem | None:
        row = (
            await self._session.execute(
                sa.select(
                    AuditLogModel,
                    UserModel.full_name.label("user_name"),
                    UserModel.email.label("user_email"),
                )
                .outerjoin(UserModel, UserModel.id == AuditLogModel.user_id)
                .where(AuditLogModel.id == audit_log_id)
            )
        ).first()
        if row is None:
            return None
        return self._to_list_item(
            audit_log=row[0],
            user_name=row.user_name,
            user_email=row.user_email,
        )

    def _build_filters(self, filters: AuditLogListFilters) -> list[sa.ColumnElement[bool]]:
        clauses: list[sa.ColumnElement[bool]] = []

        if filters.action:
            clauses.append(AuditLogModel.action == filters.action)
        if filters.entity_type:
            clauses.append(AuditLogModel.resource_type == filters.entity_type)
        if filters.entity_id:
            parsed_entity_id = self._parse_uuid(filters.entity_id)
            if parsed_entity_id is None:
                clauses.append(sa.false())
            else:
                clauses.append(AuditLogModel.resource_id == parsed_entity_id)
        if filters.user_id is not None:
            clauses.append(AuditLogModel.user_id == filters.user_id)
        if filters.date_from is not None:
            clauses.append(AuditLogModel.timestamp >= self._start_of_day(filters.date_from))
        if filters.date_to is not None:
            clauses.append(AuditLogModel.timestamp < self._next_day(filters.date_to))
        if filters.search:
            term = f"%{filters.search.lower()}%"
            clauses.append(
                sa.or_(
                    sa.func.lower(AuditLogModel.action).like(term),
                    sa.func.lower(AuditLogModel.resource_type).like(term),
                    sa.func.lower(sa.cast(AuditLogModel.resource_id, sa.String())).like(term),
                    sa.func.lower(sa.cast(AuditLogModel.request_id, sa.String())).like(term),
                    sa.func.lower(sa.func.coalesce(UserModel.full_name, "")).like(term),
                    sa.func.lower(sa.func.coalesce(UserModel.email, "")).like(term),
                    sa.func.lower(sa.cast(AuditLogModel.metadata_, sa.Text())).like(term),
                )
            )

        return clauses

    @staticmethod
    def _to_list_item(
        *,
        audit_log: AuditLogModel,
        user_name: str | None,
        user_email: str | None,
    ) -> AuditLogListItem:
        metadata = dict(audit_log.metadata_ or {})
        correlation_id = metadata.get("correlation_id")
        return AuditLogListItem(
            id=audit_log.id,
            action=audit_log.action,
            entity_type=audit_log.resource_type,
            entity_id=audit_log.resource_id,
            user_id=audit_log.user_id,
            user_name=user_name,
            user_email=user_email,
            metadata=metadata,
            before_state=audit_log.before_state,
            after_state=audit_log.after_state,
            created_at=audit_log.timestamp,
            request_id=audit_log.request_id,
            correlation_id=str(correlation_id) if correlation_id is not None else None,
        )

    @staticmethod
    def _parse_uuid(value: str) -> UUID | None:
        try:
            return UUID(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _start_of_day(value: date) -> datetime:
        return datetime.combine(value, time.min, tzinfo=UTC)

    @staticmethod
    def _next_day(value: date) -> datetime:
        return datetime.combine(value + timedelta(days=1), time.min, tzinfo=UTC)
