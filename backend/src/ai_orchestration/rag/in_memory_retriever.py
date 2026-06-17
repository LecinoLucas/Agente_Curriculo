"""
InMemoryRetriever: Retriever in-memory para testes e fundação RAG.

Implementação determinística sem embeddings, banco ou LLM.
Busca por correspondência de palavras-chave com score proporcional ao número
de palavras da query encontradas no conteúdo do chunk.

Uso previsto: testes unitários e prototipação. Não usar em produção.
"""
from __future__ import annotations

from src.ai_orchestration.rag.retriever_contract import RetrieverContract
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)


class InMemoryRetriever(RetrieverContract):
    """Retriever in-memory baseado em correspondência textual de palavras-chave.

    Args:
        chunks: Lista de KnowledgeChunk a ser indexada em memória.
        documents: Mapa opcional de document_id → KnowledgeDocument para get_document().
    """

    def __init__(
        self,
        chunks: list[KnowledgeChunk],
        documents: dict[str, KnowledgeDocument] | None = None,
    ) -> None:
        self._chunks = list(chunks)
        self._documents: dict[str, KnowledgeDocument] = documents or {}

    async def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Busca chunks por correspondência de palavras-chave.

        Score = palavras_da_query_encontradas / total_palavras_da_query.
        Chunks com score=0 (nenhuma palavra encontrada) são sempre excluídos.

        Args:
            query: RetrievalQuery com texto, filtros opcionais, limit e min_score.

        Returns:
            RetrievalResult com chunks ordenados por score decrescente.
        """
        query_text = query.query.strip()
        if not query_text:
            return RetrievalResult(
                query=query.query,
                chunks=[],
                total=0,
                warnings=["empty_query"],
            )

        words = query_text.lower().split()
        scored: list[tuple[float, KnowledgeChunk]] = []

        for chunk in self._chunks:
            if not self._passes_filters(chunk, query.filters):
                continue

            score = self._score(chunk.content, words)

            if score <= 0.0:
                continue
            if query.min_score > 0.0 and score < query.min_score:
                continue

            scored.append((score, chunk))

        # Ordenar: maior score primeiro; empate → menor chunk_index (determinístico)
        scored.sort(key=lambda x: (-x[0], x[1].chunk_index))
        scored = scored[: query.limit]

        retrieved = [
            RetrievedChunk(
                chunk=chunk,
                score=round(score, 4),
                match_reason="keyword_match",
            )
            for score, chunk in scored
        ]

        return RetrievalResult(
            query=query.query,
            chunks=retrieved,
            total=len(retrieved),
            warnings=[],
        )

    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Retorna documento pelo ID se disponível no mapa em memória."""
        return self._documents.get(document_id)

    # ── Internals ──────────────────────────────────────────────────────────────

    @staticmethod
    def _score(content: str, query_words: list[str]) -> float:
        """Calcula score como razão de palavras da query encontradas no conteúdo."""
        content_lower = content.lower()
        matched = sum(1 for w in query_words if w in content_lower)
        return matched / len(query_words) if query_words else 0.0

    @staticmethod
    def _passes_filters(chunk: KnowledgeChunk, filters: dict | None) -> bool:
        """Verifica se o chunk passa os filtros da query."""
        if not filters:
            return True
        source_type = filters.get("source_type")
        if source_type and chunk.metadata.get("source_type") != source_type:
            return False
        visibility = filters.get("visibility")
        if visibility and chunk.metadata.get("visibility") != visibility:
            return False
        audience = filters.get("audience")
        if audience and chunk.metadata.get("audience") != audience:
            return False
        return True
