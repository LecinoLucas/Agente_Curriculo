"""
Knowledge Tools: Tools de consulta para a base de conhecimento (RAG).

Fase AI-RAG-8 — implementação real usando PostgresVectorRetriever.

Permissão mínima para todas as tools: can_use_assistant (ou knowledge:read se disponível)
Usamos can_use_assistant por consistência com o stub original, mas preparamos para knowledge:read.
"""
from __future__ import annotations

import logging
from time import perf_counter
from typing import Any

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.ai_orchestration.rag.answer_schemas import RagAnswerRequest
from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
from src.ai_orchestration.rag.rag_answer_service import RagAnswerService
from src.ai_orchestration.rag.schemas import RetrievalQuery

_REQUIRED_PERMISSION = "can_use_assistant"
_LIMIT_MAX = 20
logger = logging.getLogger(__name__)


async def search_knowledge(
    context: AgentContext,
    query: str,
    retriever: PostgresVectorRetriever,
    limit: int = 5,
    filters: dict[str, Any] | None = None,
) -> ToolResult:
    """
    Busca informações na base de conhecimento (RAG) usando busca vetorial.

    Args:
        context: Contexto com permissões do usuário.
        query: Pergunta ou termo de busca.
        retriever: Instância de PostgresVectorRetriever injetada.
        limit: Máximo de trechos a retornar (1-20).
        filters: Filtros opcionais (ex: source_type).

    Returns:
        ToolResult contendo chunks (texto, fonte, score), total e warnings.
    """
    # 1. Permissão
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    # 2. Validação básica
    clean_query = (query or "").strip()
    if not clean_query:
        return ToolResult.error("INVALID_INPUT", "A query de busca não pode estar vazia.")

    # 3. Execução
    capped_limit = max(1, min(limit, _LIMIT_MAX))
    started_at = perf_counter()
    retrieval_total = 0
    retrieval_warnings: list[str] = []
    
    try:
        retrieval_query = RetrievalQuery(
            query=clean_query,
            limit=capped_limit,
            filters=filters or {},
        )
        
        result = await retriever.retrieve(retrieval_query)
        retrieval_total = result.total
        retrieval_warnings = list(result.warnings)
        
        # 4. Formatação da saída segura (ToolResult.data)
        safe_chunks = _format_safe_chunks(result.chunks)
        
        return ToolResult.success(
            data={
                "query": result.query,
                "chunks": safe_chunks,
                "total": result.total,
                "warnings": result.warnings,
            }
        )

    except Exception as exc:  # noqa: BLE001
        return ToolResult.error(
            "INTERNAL_ERROR", 
            f"Erro ao consultar base de conhecimento: {type(exc).__name__}"
        )
    finally:
        logger.info(
            "knowledge.search.timing",
            extra={
                "event": "knowledge.search.timing",
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                "limit": capped_limit,
                "rows": retrieval_total,
                "warning_code": retrieval_warnings,
            },
        )


async def answer_knowledge(
    context: AgentContext,
    query: str,
    retriever: PostgresVectorRetriever,
    answer_service: RagAnswerService,
    limit: int = 5,
    filters: dict[str, Any] | None = None,
) -> ToolResult:
    """
    Responde uma pergunta baseando-se na base de conhecimento (RAG).
    Realiza a busca e depois sintetiza a resposta com fontes.

    Args:
        context: Contexto com permissões do usuário.
        query: Pergunta do usuário.
        retriever: Instância de PostgresVectorRetriever injetada.
        answer_service: Instância de RagAnswerService injetada.
        limit: Máximo de trechos a recuperar para síntese (1-20).
        filters: Filtros opcionais.

    Returns:
        ToolResult contendo a resposta sintetizada, fontes e metadados.
    """
    # 1. Permissão
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    # 2. Validação básica
    clean_query = (query or "").strip()
    if not clean_query:
        return ToolResult.error("INVALID_INPUT", "A pergunta não pode estar vazia.")

    # 3. Recuperação (Search)
    capped_limit = max(1, min(limit, _LIMIT_MAX))
    started_at = perf_counter()
    retrieval_total = 0
    retrieval_warnings: list[str] = []
    source_total = 0
    try:
        retrieval_query = RetrievalQuery(
            query=clean_query,
            limit=capped_limit,
            filters=filters or {},
        )
        retrieval_result = await retriever.retrieve(retrieval_query)
        retrieval_total = retrieval_result.total
        retrieval_warnings = list(retrieval_result.warnings)
        
        # 4. Síntese (Answer)
        answer_request = RagAnswerRequest(
            query=clean_query,
            retrieved_chunks=[c.chunk for c in retrieval_result.chunks],
            max_chunks=capped_limit,
        )
        
        answer_result = await answer_service.synthesize_answer(answer_request)
        
        if not answer_result.ok:
            return ToolResult.error(
                answer_result.error_code or "SYNTHESIS_ERROR",
                answer_result.message or "Falha ao sintetizar resposta."
            )
        source_total = len(answer_result.sources)

        # 5. Saída Segura
        return ToolResult.success(
            data={
                "answer": answer_result.answer,
                "sources": [
                    {
                        "document_id": s.document_id,
                        "chunk_id": s.chunk_id,
                        "source_title": s.source_title,
                        "score": s.score,
                        "metadata": {
                            k: v for k, v in s.metadata.items()
                            if k not in ("embedding", "vector_json", "content_hash")
                        },
                    }
                    for s in answer_result.sources
                ],
                "warnings": list(set(retrieval_result.warnings + answer_result.warnings)),
                "provider": answer_result.provider,
                "model": answer_result.model,
                "retrieval_summary": {
                    "query": retrieval_result.query,
                    "total_found": retrieval_result.total,
                }
            }
        )

    except Exception as exc:  # noqa: BLE001
        return ToolResult.error(
            "INTERNAL_ERROR", 
            f"Erro ao processar resposta de conhecimento: {type(exc).__name__}"
        )
    finally:
        logger.info(
            "knowledge.answer.timing",
            extra={
                "event": "knowledge.answer.timing",
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                "limit": capped_limit,
                "rows": retrieval_total,
                "source_count": source_total,
                "warning_code": retrieval_warnings,
            },
        )


def _format_safe_chunks(retrieved_chunks: list[Any]) -> list[dict[str, Any]]:
    """Formata chunks para saída segura, removendo dados internos sensíveis."""
    return [
        {
            "chunk_id": c.chunk.id,
            "document_id": c.chunk.document_id,
            "source_title": c.chunk.source_title or "Sem título",
            "content": c.chunk.content,
            "score": c.score,
            "metadata": {
                k: v for k, v in c.chunk.metadata.items() 
                if k not in ("embedding", "vector_json", "content_hash")
            }
        }
        for c in retrieved_chunks
    ]
