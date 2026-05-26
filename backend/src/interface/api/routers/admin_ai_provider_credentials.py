from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_provider_credential_service import (
    AIProviderCredentialConflictError,
    AIProviderCredentialNotFoundError,
    AIProviderCredentialService,
    InvalidAIProviderCredentialError,
    mask_api_key_last4,
)
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.rate_limiting import rate_limit_admin_ai_credentials
from src.interface.api.schemas.ai_provider_credential_schemas import (
    AIProviderCredentialCreateRequest,
    AIProviderCredentialResponse,
    AIProviderCredentialRotateRequest,
)

router = APIRouter(
    prefix="/admin/ai-provider-credentials",
    tags=["admin-ai-provider-credentials"],
    dependencies=[Depends(rate_limit_admin_ai_credentials)],
)


def _service(db: AsyncSession) -> AIProviderCredentialService:
    return AIProviderCredentialService(db)


def _handle_error(exc: Exception) -> None:
    if isinstance(exc, AIProviderCredentialNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credencial IA não encontrada",
        )
    if isinstance(exc, AIProviderCredentialConflictError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe credencial com este label para o provider",
        )
    if isinstance(exc, InvalidAIProviderCredentialError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Campos obrigatórios inválidos",
        )
    raise exc


def _to_response(credential) -> AIProviderCredentialResponse:
    return AIProviderCredentialResponse(
        id=credential.id,
        provider=credential.provider,
        model_id=credential.model_id,
        label=credential.label,
        masked_key=mask_api_key_last4(credential.key_last4),
        status=credential.status,
        priority=credential.priority,
        cooldown_until=credential.cooldown_until,
        last_used_at=credential.last_used_at,
        last_error_at=credential.last_error_at,
        last_error_type=credential.last_error_type,
        consecutive_rate_limit_count=credential.consecutive_rate_limit_count,
        created_at=credential.created_at,
        updated_at=credential.updated_at,
    )


@router.post("", response_model=AIProviderCredentialResponse, status_code=status.HTTP_201_CREATED)
async def create_ai_provider_credential(
    body: AIProviderCredentialCreateRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialResponse:
    try:
        credential = await _service(db).create_credential(
            provider=body.provider,
            model_id=body.model_id,
            label=body.label,
            raw_api_key=body.api_key,
            actor=current_user,
            priority=body.priority,
        )
        await db.commit()
        await db.refresh(credential)
        return _to_response(credential)
    except Exception as exc:
        await db.rollback()
        _handle_error(exc)
        raise


@router.get("", response_model=list[AIProviderCredentialResponse])
async def list_ai_provider_credentials(
    _current_user: AdminOnly,
    provider: str | None = Query(default=None),
    model_id: str | None = Query(default=None),
    credential_status: Literal["active", "disabled", "rate_limited", "invalid"] | None = Query(
        default=None,
        alias="status",
    ),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[AIProviderCredentialResponse]:
    try:
        credentials = await _service(db).list_credentials(
            provider=provider,
            model_id=model_id,
            status=credential_status,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        _handle_error(exc)
        raise
    return [_to_response(credential) for credential in credentials]


@router.patch("/{credential_id}/disable", response_model=AIProviderCredentialResponse)
async def disable_ai_provider_credential(
    credential_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialResponse:
    try:
        credential = await _service(db).disable_credential(credential_id, current_user)
        await db.commit()
        await db.refresh(credential)
        return _to_response(credential)
    except Exception as exc:
        await db.rollback()
        _handle_error(exc)
        raise


@router.patch("/{credential_id}/enable", response_model=AIProviderCredentialResponse)
async def enable_ai_provider_credential(
    credential_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialResponse:
    try:
        credential = await _service(db).enable_credential(credential_id, current_user)
        await db.commit()
        await db.refresh(credential)
        return _to_response(credential)
    except Exception as exc:
        await db.rollback()
        _handle_error(exc)
        raise


@router.patch("/{credential_id}/rotate", response_model=AIProviderCredentialResponse)
async def rotate_ai_provider_credential(
    credential_id: UUID,
    body: AIProviderCredentialRotateRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIProviderCredentialResponse:
    try:
        credential = await _service(db).rotate_credential(
            credential_id,
            new_raw_api_key=body.api_key,
            actor=current_user,
        )
        await db.commit()
        await db.refresh(credential)
        return _to_response(credential)
    except Exception as exc:
        await db.rollback()
        _handle_error(exc)
        raise
