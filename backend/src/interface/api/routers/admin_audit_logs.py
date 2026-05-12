from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.audit_log_service import AuditLogQuery, AuditLogService
from src.infrastructure.repositories.sqlalchemy_audit_log_repository import (
    SQLAlchemyAuditLogRepository,
)
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.audit_log_schemas import AuditLogResponse
from src.interface.api.schemas.common import PaginatedResponse

router = APIRouter(prefix="/admin/audit-logs", tags=["admin-audit-logs"])


def _get_service(db: AsyncSession = Depends(get_db)) -> AuditLogService:
    return AuditLogService(SQLAlchemyAuditLogRepository(db))


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
async def list_audit_logs(
    _current_user: AdminOnly,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    user_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None, description="Busca por ação, entidade, ID, usuário e metadata"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    service: AuditLogService = Depends(_get_service),
) -> PaginatedResponse[AuditLogResponse]:
    result = await service.list_audit_logs(
        AuditLogQuery(
            page=page,
            page_size=page_size,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            search=search,
            date_from=date_from,
            date_to=date_to,
        )
    )

    return PaginatedResponse[AuditLogResponse](
        data=[
            AuditLogResponse(
                id=item.id,
                action=item.action,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                user_id=item.user_id,
                user_name=item.user_name,
                user_email=item.user_email,
                metadata=item.metadata,
                before_state=item.before_state,
                after_state=item.after_state,
                created_at=item.created_at,
                request_id=item.request_id,
                correlation_id=item.correlation_id,
            )
            for item in result.items
        ],
        total=result.total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (result.total + page_size - 1) // page_size),
    )
