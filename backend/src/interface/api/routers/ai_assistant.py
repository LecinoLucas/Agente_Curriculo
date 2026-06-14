"""
AI Assistant endpoint — read-only, determinístico, sem LLM.

POST /ai/assistant/read-only — executa intent estruturada via AssistantRouter.

Nunca chama LLM. Nunca acessa repository. Nunca executa ação de escrita.
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.assistant.assistant_request import AssistantRequest
from src.ai_orchestration.assistant.assistant_router import AssistantRouter
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.tool_execution_context import ToolExecutionContext
from src.ai_orchestration.core.tool_runtime import ToolRuntime
from src.ai_orchestration.rag.pgvector_support import is_pgvector_available
from src.core.settings import settings
from src.ai_orchestration.tools.registry import DEFAULT_REGISTRY
from src.domain.entities.user import User, UserRole
from src.interface.api.dependencies import AdminOnly, InternalUser, get_db
from src.interface.api.schemas.ai_assistant_schemas import (
    AiAssistantReadOnlyRequest,
    AiAssistantReadOnlyResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/assistant", tags=["ai-assistant"])
status_router = APIRouter(prefix="/ai", tags=["ai-status"])

# Mapa de role → permissões granulares reconhecidas pelas AI tools.
# Segue a semântica do sistema: RECRUITER opera vagas/candidatos/pipeline;
# HR opera admissões e exportação ERP; ADMIN tem acesso completo.
_ROLE_PERMISSIONS: dict[str, list[str]] = {
    UserRole.ADMIN.value: [
        "can_view_jobs",
        "can_view_candidates",
        "can_view_pipeline",
        "can_view_admissions",
        "can_view_protheus_status",
        "can_use_assistant",
    ],
    UserRole.RECRUITER.value: [
        "can_view_jobs",
        "can_view_candidates",
        "can_view_pipeline",
        "can_use_assistant",
    ],
    UserRole.HR.value: [
        "can_view_admissions",
        "can_view_protheus_status",
        "can_use_assistant",
    ],
    UserRole.MANAGER.value: [
        "can_view_jobs",
        "can_view_candidates",
        "can_view_pipeline",
        "can_use_assistant",
    ],
    UserRole.VIEWER.value: [
        "can_view_jobs",
    ],
    UserRole.CANDIDATE.value: [],
}


def _build_agent_context(user: User, request: Request, session_id: str | None) -> AgentContext:
    return AgentContext(
        user_id=str(user.id),
        role=user.role.value,
        permissions=_ROLE_PERMISSIONS.get(user.role.value, []),
        request_id=str(getattr(request.state, "request_id", uuid4())),
        session_id=session_id or str(uuid4()),
        source="api",
    )


def _build_services(db: AsyncSession) -> dict[str, Any]:
    from src.ai_orchestration.rag.embedding_provider_factory import get_embedding_provider
    from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
    from src.ai_orchestration.rag.rag_answer_service import RagAnswerService
    from src.application.services.admission_case_workspace_service import AdmissionCaseWorkspaceService
    from src.application.services.admission_package_service import AdmissionPackageService
    from src.application.services.candidate_service import CandidateService
    from src.application.services.job_service import JobService
    from src.application.services.pipeline_service import PipelineService
    from src.infrastructure.repositories.postgres_vector_store import PostgresVectorStore
    from src.infrastructure.repositories.sqlalchemy_candidate_repository import SQLAlchemyCandidateRepository
    from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
    from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import SQLAlchemyKnowledgeDocumentRepository
    from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository
    from src.infrastructure.repositories.sqlalchemy_pre_admission_repository import SQLAlchemyPreAdmissionRepository

    embedding_provider = get_embedding_provider()
    
    return {
        "job_service": JobService(SQLAlchemyJobRepository(db)),
        "candidate_service": CandidateService(SQLAlchemyCandidateRepository(db)),
        "pipeline_service": PipelineService(SQLAlchemyPipelineRepository(db), session=db),
        "admission_service": AdmissionCaseWorkspaceService(SQLAlchemyPreAdmissionRepository(db)),
        "admission_package_service": AdmissionPackageService(db),
        "retriever": PostgresVectorRetriever(
            vector_store=PostgresVectorStore(db),
            embedding_provider=embedding_provider,
            document_repository=SQLAlchemyKnowledgeDocumentRepository(db),
        ),
        "answer_service": RagAnswerService(usage_session=db),
    }


def _gemini_api_key_configured() -> bool:
    return any(
        key.strip()
        for key in (
            settings.GOOGLE_API_KEY_1,
            settings.GOOGLE_API_KEY_2,
            settings.GOOGLE_API_KEY_3,
            settings.GOOGLE_API_KEY_4,
            settings.GOOGLE_API_KEY_5,
        )
    )


@status_router.get("/status")
async def ai_status(
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Retorna status read-only das features IA sem expor secrets."""
    pgvector_available = await is_pgvector_available(db)
    vector_storage_mode = "pgvector" if pgvector_available else "json_fallback"
    warnings: list[str] = []

    if not pgvector_available:
        warnings.append("pgvector_not_available")
    if settings.RAG_SYNTHESIS_ENABLED and not _gemini_api_key_configured():
        warnings.append("gemini_api_key_not_configured")

    return {
        "ok": True,
        "environment": settings.APP_ENV,
        "assistant": {
            "enabled": True,
            "read_only": True,
            "free_text_enabled": False,
        },
        "rag": {
            "embedding_provider": settings.RAG_EMBEDDING_PROVIDER,
            "gemini_embedding_enabled": settings.RAG_GEMINI_EMBEDDING_ENABLED,
            "embedding_model": settings.RAG_GEMINI_EMBEDDING_MODEL,
            "synthesis_enabled": settings.RAG_SYNTHESIS_ENABLED,
            "synthesis_provider": settings.RAG_SYNTHESIS_PROVIDER,
            "synthesis_model": settings.RAG_GEMINI_SYNTHESIS_MODEL,
            "vector_storage_mode": vector_storage_mode,
            "pgvector_available": pgvector_available,
        },
        "providers": {
            "provider": settings.AI_PROVIDER,
            "model": settings.AI_MODEL_ID,
            "gemini_api_key_configured": _gemini_api_key_configured(),
        },
        "protheus": {
            "real_send_enabled": settings.PROTHEUS_REAL_SEND_ENABLED,
            "erp_allow_real_send": settings.ERP_ALLOW_REAL_SEND,
        },
        "warnings": warnings,
    }



@router.post("/read-only", response_model=AiAssistantReadOnlyResponse)
async def read_only_assistant(
    body: AiAssistantReadOnlyRequest,
    current_user: InternalUser,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AiAssistantReadOnlyResponse:
    """Executa intent read-only via AssistantRouter determinístico.

    Monta AgentContext a partir do usuário autenticado e executa via ToolRuntime.
    Nunca chama LLM. Nunca executa ação de escrita.
    """
    agent_ctx = _build_agent_context(current_user, request, body.session_id)
    execution_ctx = ToolExecutionContext(
        agent_context=agent_ctx,
        services=_build_services(db),
        read_only=True,
    )
    ai_request = AssistantRequest(
        intent=body.intent,
        arguments=body.arguments,
        message=body.message,
        session_id=body.session_id,
    )
    runtime = ToolRuntime(DEFAULT_REGISTRY, read_only=True)
    ai_router = AssistantRouter(runtime)
    response = await ai_router.handle(ai_request, execution_ctx)

    return AiAssistantReadOnlyResponse(
        ok=response.ok,
        intent=response.intent,
        tool_name=response.tool_name,
        data=response.data,
        error_code=response.error_code,
        message=response.message,
        requires_approval=response.requires_approval,
        warnings=response.warnings,
    )
