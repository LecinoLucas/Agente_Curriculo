from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_provider_health_service import AIProviderHealthService
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.system_health_schemas import AIProviderOperationalHealthResponse

router = APIRouter(prefix="/admin/ai-provider-health", tags=["admin-ai-provider-health"])


def _get_service(db: AsyncSession = Depends(get_db)) -> AIProviderHealthService:
    return AIProviderHealthService(db)


@router.get("", response_model=list[AIProviderOperationalHealthResponse])
async def get_ai_provider_health(
    _current_user: AdminOnly,
    service: AIProviderHealthService = Depends(_get_service),
) -> list[AIProviderOperationalHealthResponse]:
    return [
        AIProviderOperationalHealthResponse.model_validate(item)
        for item in await service.list_or_current_health()
    ]
