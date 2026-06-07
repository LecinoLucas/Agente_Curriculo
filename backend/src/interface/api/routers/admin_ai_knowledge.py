from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.embedding_provider_factory import get_embedding_provider
from src.application.services.ai_knowledge_admin_service import (
    AIKnowledgeAdminError,
    AIKnowledgeAdminService,
    AIKnowledgeDocumentNotFoundError,
    AIKnowledgeValidationError,
)
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.ai_knowledge_admin_schemas import (
    AIKnowledgeArchiveResponse,
    AIKnowledgeDocumentCreateRequest,
    AIKnowledgeDocumentListResponse,
    AIKnowledgeDocumentResponse,
    AIKnowledgeDocumentUpdateRequest,
    AIKnowledgeReindexResponse,
)

router = APIRouter(prefix="/ai/knowledge", tags=["ai-knowledge-admin"])


def _service(db: AsyncSession) -> AIKnowledgeAdminService:
    return AIKnowledgeAdminService(db, embedding_provider=get_embedding_provider())


def _handle_admin_error(exc: Exception) -> None:
    if isinstance(exc, AIKnowledgeDocumentNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, AIKnowledgeValidationError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if isinstance(exc, AIKnowledgeAdminError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    raise exc


@router.get("/documents", response_model=AIKnowledgeDocumentListResponse)
async def list_ai_knowledge_documents(
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    include_archived: bool = False,
) -> dict[str, Any]:
    try:
        return await _service(db).list_documents(
            status=status_filter,
            include_archived=include_archived,
        )
    except Exception as exc:  # noqa: BLE001
        _handle_admin_error(exc)
        raise


@router.get("/documents/{document_id}", response_model=AIKnowledgeDocumentResponse)
async def get_ai_knowledge_document(
    document_id: UUID,
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        return await _service(db).get_document(str(document_id))
    except Exception as exc:  # noqa: BLE001
        _handle_admin_error(exc)
        raise


@router.post(
    "/documents",
    response_model=AIKnowledgeDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_ai_knowledge_document(
    payload: AIKnowledgeDocumentCreateRequest,
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        return await _service(db).create_document(payload.model_dump())
    except Exception as exc:  # noqa: BLE001
        _handle_admin_error(exc)
        raise


@router.patch("/documents/{document_id}", response_model=AIKnowledgeDocumentResponse)
async def update_ai_knowledge_document(
    document_id: UUID,
    payload: AIKnowledgeDocumentUpdateRequest,
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        return await _service(db).update_document(
            str(document_id),
            payload.model_dump(exclude_unset=True),
        )
    except Exception as exc:  # noqa: BLE001
        _handle_admin_error(exc)
        raise


@router.post("/documents/{document_id}/reindex", response_model=AIKnowledgeReindexResponse)
async def reindex_ai_knowledge_document(
    document_id: UUID,
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        result = await _service(db).reindex_document(str(document_id))
        return {
            "ok": True,
            "document_id": result.document.id,
            "indexing_status": result.document.indexing_status,
            "chunks_created": result.chunks_created,
            "embeddings_created": result.embeddings_created,
            "warnings": result.warnings,
        }
    except Exception as exc:  # noqa: BLE001
        _handle_admin_error(exc)
        raise


@router.post("/documents/{document_id}/archive", response_model=AIKnowledgeArchiveResponse)
async def archive_ai_knowledge_document(
    document_id: UUID,
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    try:
        return await _service(db).archive_document(str(document_id))
    except Exception as exc:  # noqa: BLE001
        _handle_admin_error(exc)
        raise
