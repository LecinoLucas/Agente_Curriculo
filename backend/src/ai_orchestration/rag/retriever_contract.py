"""
RAG Retriever Contract: Interface base para recuperação de documentos.

Esta é uma interface abstrata — sem implementação real.
A implementação real será feita em AI-RAG-1 com pgvector.
"""
from abc import ABC, abstractmethod

from src.ai_orchestration.rag.schemas import RagSource


class RetrieverContract(ABC):
    """
    Interface base para qualquer implementação de retriever RAG.

    Implementações previstas:
        - PostgresVectorRetriever (AI-RAG-1): busca vetorial com pgvector
        - HybridRetriever (AI-RAG-3): busca vetorial + BM25 com re-ranking
        - MockRetriever (testes): retorna dados fixos para testes unitários
    """

    @abstractmethod
    async def retrieve(
        self,
        query: str,
        source_types: list[str] | None = None,
        limit: int = 5,
        min_score: float = 0.75,
    ) -> list[RagSource]:
        """
        Recupera chunks relevantes para a query.

        Args:
            query: Texto da pergunta do usuário.
            source_types: Filtro opcional por tipo de fonte.
            limit: Número máximo de chunks a retornar.
            min_score: Score mínimo de similaridade para incluir um chunk.

        Returns:
            Lista de RagSource ordenada por score decrescente.
            Retorna lista vazia se nenhum chunk atinge o score mínimo.
        """
        ...

    @abstractmethod
    async def get_document(self, document_id: str) -> dict | None:
        """
        Recupera os metadados completos de um documento pelo ID.

        Returns:
            Dict com dados do documento ou None se não encontrado.
        """
        ...
