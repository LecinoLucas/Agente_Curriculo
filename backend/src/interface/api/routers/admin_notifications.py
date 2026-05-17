from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admin_notification_service import AdminNotificationService
from src.interface.api.dependencies import AdminOnly, get_db

router = APIRouter(prefix="/admin/notifications", tags=["admin-notifications"])


def _get_service(db: AsyncSession = Depends(get_db)) -> AdminNotificationService:
    return AdminNotificationService(db)


@router.get("", response_model=list[dict])
async def get_admin_notifications(
    _current_user: AdminOnly,
    service: AdminNotificationService = Depends(_get_service),
) -> list[dict]:
    """Retorna notificações operacionais reais para o painel de administração."""
    return await service.get_notifications()
