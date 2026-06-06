"""
Knowledge Tools: Tools de consulta para a base de conhecimento (RAG).

Fase AI-RAG-8 — implementação real usando PostgresVectorRetriever.

Permissão mínima para todas as tools: can_use_assistant (ou knowledge:read se disponível)
Usamos can_use_assistant por consistência com o stub original, mas preparamos para knowledge:read.
"""
from __future__ import annotations

from typing import Any

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
from src.ai_orchestration.rag.schemas import RetrievalQuery

_REQUIRED_PERMISSION = "can_use_assistant"
_LIMIT_MAX = 20


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
    
    try:
        retrieval_query = RetrievalQuery(
            query=clean_query,
            limit=capped_limit,
            filters=filters or {},
        )
        
        result = await retriever.retrieve(retrieval_query)
        
        # 4. Formatação da saída segura (ToolResult.data)
        # Importante: não expor embeddings brutos nem metadados sensíveis internos
        safe_chunks = [
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
            for c in result.chunks
        ]
        
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
