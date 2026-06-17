"""
CandidateSafeRetriever: Wrapper que restringe o RAG a documentos públicos para candidatos.

Garante que um bot público nunca recupere documentos internos de RH/admin.
Injeta obrigatoriamente visibility='public' em toda query antes de delegar ao retriever interno.

Uso:
    # Em vez de usar PostgresVectorRetriever diretamente no bot candidato:
    retriever = CandidateSafeRetriever(postgres_retriever)
    result = await retriever.retrieve(RetrievalQuery(query="benefícios da empresa"))
    # Apenas documentos com metadata["visibility"] == "public" são retornados.
"""
from __future__ import annotations

from src.ai_orchestration.rag.retriever_contract import RetrieverContract
from src.ai_orchestration.rag.schemas import (
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
)

_CANDIDATE_VISIBILITY = "public"
_CANDIDATE_AUDIENCE = "candidate"


def _is_candidate_safe_document(document: KnowledgeDocument | None) -> bool:
    if document is None:
        return False
    metadata = document.metadata or {}
    return (
        metadata.get("visibility") == _CANDIDATE_VISIBILITY
        and metadata.get("audience") == _CANDIDATE_AUDIENCE
    )


class CandidateSafeRetriever(RetrieverContract):
    """Wrapper de segurança que restringe retrieval a documentos públicos para candidatos.

    Injeta automaticamente visibility='public' e audience='candidate' em todos os filtros
    antes de delegar ao retriever interno. Documentos internos (RH, admin, política
    salarial, critérios de descarte) nunca são retornados por este wrapper.

    Compatível com qualquer implementação de RetrieverContract:
    InMemoryRetriever (testes), PostgresVectorRetriever (produção).
    """

    def __init__(self, inner: RetrieverContract) -> None:
        self._inner = inner

    async def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Executa retrieval restrito a documentos públicos para candidatos."""
        safe_filters = {
            **(query.filters or {}),
            "visibility": _CANDIDATE_VISIBILITY,
            "audience": _CANDIDATE_AUDIENCE,
        }
        safe_query = RetrievalQuery(
            query=query.query,
            filters=safe_filters,
            limit=query.limit,
            min_score=query.min_score,
        )
        result = await self._inner.retrieve(safe_query)
        # Append audience marker to warnings for observability
        warnings = list(result.warnings)
        if "candidate_safe_filter_applied" not in warnings:
            warnings.append("candidate_safe_filter_applied")
        return RetrievalResult(
            query=result.query,
            chunks=result.chunks,
            total=result.total,
            warnings=warnings,
        )

    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Retorna o documento apenas se ele também for público e voltado ao candidato."""
        document = await self._inner.get_document(document_id)
        if not _is_candidate_safe_document(document):
            return None
        return document
