from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_admin_service import (
    AIAdminService,
    AIModelConflictError,
    AIModelNotFoundError,
    InvalidAIAdminTextError,
    PromptTemplateConflictError,
    PromptTemplateNotFoundError,
)
from src.infrastructure.repositories.sqlalchemy_ai_repository import SQLAlchemyAIRepository
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.ai_schemas import (
    AIModelResponse,
    CreateAIModelRequest,
    CreatePromptTemplateRequest,
    PatchAIModelRequest,
    PatchPromptTemplateRequest,
    PromptTemplateResponse,
)

router = APIRouter(tags=["ai"])


def _ai_admin_service(db: AsyncSession) -> AIAdminService:
    return AIAdminService(SQLAlchemyAIRepository(db))


def _handle_ai_admin_error(exc: Exception) -> None:
    if isinstance(exc, AIModelNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI Model não encontrado")
    if isinstance(exc, PromptTemplateNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prompt template não encontrado")
    if isinstance(exc, AIModelConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="AI Model com este model_id já existe")
    if isinstance(exc, PromptTemplateConflictError):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Template com este nome e versão já existe")
    if isinstance(exc, InvalidAIAdminTextError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Campos obrigatórios não podem estar em branco")
    raise exc


# ── AI Models ─────────────────────────────────────────────────────────────────

@router.post("/ai-models", response_model=AIModelResponse, status_code=status.HTTP_201_CREATED)
async def create_ai_model(
    body: CreateAIModelRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIModelResponse:
    try:
        model = await _ai_admin_service(db).create_model(body)
        await db.commit()
        await db.refresh(model)
        return AIModelResponse.model_validate(model)
    except Exception as exc:
        await db.rollback()
        _handle_ai_admin_error(exc)
        raise


@router.get("/ai-models", response_model=list[AIModelResponse])
async def list_ai_models(
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> list[AIModelResponse]:
    models = await _ai_admin_service(db).list_models()
    return [AIModelResponse.model_validate(model) for model in models]


@router.get("/ai-models/{model_id}", response_model=AIModelResponse)
async def get_ai_model(
    model_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIModelResponse:
    try:
        return AIModelResponse.model_validate(await _ai_admin_service(db).get_model(model_id))
    except Exception as exc:
        _handle_ai_admin_error(exc)
        raise


@router.patch("/ai-models/{model_id}", response_model=AIModelResponse)
async def patch_ai_model(
    model_id: UUID,
    body: PatchAIModelRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> AIModelResponse:
    try:
        model = await _ai_admin_service(db).patch_model(model_id, body)
        await db.commit()
        await db.refresh(model)
        return AIModelResponse.model_validate(model)
    except Exception as exc:
        await db.rollback()
        _handle_ai_admin_error(exc)
        raise


# ── Prompt Templates ─────────────────────────────────────────────────────────

@router.get("/prompt-templates", response_model=list[PromptTemplateResponse])
async def list_prompt_templates(
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> list[PromptTemplateResponse]:
    templates = await _ai_admin_service(db).list_templates()
    return [PromptTemplateResponse.model_validate(template) for template in templates]


@router.get("/prompt-templates/{template_id}", response_model=PromptTemplateResponse)
async def get_prompt_template(
    template_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    try:
        return PromptTemplateResponse.model_validate(await _ai_admin_service(db).get_template(template_id))
    except Exception as exc:
        _handle_ai_admin_error(exc)
        raise


@router.post("/prompt-templates", response_model=PromptTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_prompt_template(
    body: CreatePromptTemplateRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    try:
        template = await _ai_admin_service(db).create_template(body, current_user.id)
        await db.commit()
        await db.refresh(template)
        return PromptTemplateResponse.model_validate(template)
    except Exception as exc:
        await db.rollback()
        _handle_ai_admin_error(exc)
        raise


@router.patch("/prompt-templates/{template_id}", response_model=PromptTemplateResponse)
async def patch_prompt_template(
    template_id: UUID,
    body: PatchPromptTemplateRequest,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    try:
        template = await _ai_admin_service(db).patch_template(template_id, body)
        await db.commit()
        await db.refresh(template)
        return PromptTemplateResponse.model_validate(template)
    except Exception as exc:
        await db.rollback()
        _handle_ai_admin_error(exc)
        raise


@router.patch("/prompt-templates/{template_id}/activate", response_model=PromptTemplateResponse)
async def activate_prompt_template(
    template_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    try:
        template = await _ai_admin_service(db).activate_template(template_id)
        await db.commit()
        await db.refresh(template)
        return PromptTemplateResponse.model_validate(template)
    except Exception as exc:
        await db.rollback()
        _handle_ai_admin_error(exc)
        raise


@router.patch("/prompt-templates/{template_id}/deactivate", response_model=PromptTemplateResponse)
async def deactivate_prompt_template(
    template_id: UUID,
    current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> PromptTemplateResponse:
    try:
        template = await _ai_admin_service(db).deactivate_template(template_id)
        await db.commit()
        await db.refresh(template)
        return PromptTemplateResponse.model_validate(template)
    except Exception as exc:
        await db.rollback()
        _handle_ai_admin_error(exc)
        raise
