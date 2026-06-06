"""
RAG Retriever Contract: Interface para recuperação de conhecimento.

Contrato base para qualquer implementação de retriever — in-memory para testes,
pgvector para produção (AI-RAG-1), hybrid search (AI-RAG-3).

Nunca retorna resposta gerada. Apenas chunks com fontes verificáveis.
"""
from abc import ABC, abstractmethod

from src.ai_orchestration.rag.schemas import (
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
)


class RetrieverContract(ABC):
    """Interface base para qualquer implementação de retriever RAG.

    Implementações previstas:
        - InMemoryRetriever (AI-RAG-1): keyword match, sem embeddings, para testes
        - PostgresVectorRetriever (AI-RAG-1): busca vetorial com pgvector
        - HybridRetriever (AI-RAG-3): vetorial + BM25 com re-ranking
    """

    @abstractmethod
    async def retrieve(self, query: RetrievalQuery) -> RetrievalResult:
        """Recupera chunks relevantes para a query.

        Args:
            query: RetrievalQuery com texto, filtros, limit e min_score.

        Returns:
            RetrievalResult com chunks ordenados por score decrescente.
            Nunca propaga exceção — retorna warnings em caso de degradação.
        """
        ...

    @abstractmethod
    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Recupera um documento da base de conhecimento pelo ID.

        Returns:
            KnowledgeDocument ou None se não encontrado.
        """
        ...
