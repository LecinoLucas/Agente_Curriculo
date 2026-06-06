"""
Vector Store Contract: Interface para persistência e busca vetorial (pgvector).

Contrato abstrato para a futura implementação PostgresVectorStore (AI-RAG-1b).
Nenhuma implementação real aqui — apenas tipagem e assinatura de métodos.

Responsabilidade desta camada:
    - Armazenar embeddings gerados pelo EmbeddingProviderContract.
    - Executar similarity search (cosine distance) via pgvector.
    - Não gerar embeddings — recebe vetores prontos.
    - Não retornar texto sintetizado — retorna RetrievalResult com chunks originais.

Implementação prevista: PostgresVectorStore (AI-RAG-1b).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.ai_orchestration.rag.schemas import RetrievalQuery, RetrievalResult


@dataclass
class EmbeddingVector:
    """Embedding de um chunk a ser armazenado no vector store.

    Campos:
        chunk_id: ID do KnowledgeChunk ao qual este embedding pertence.
        document_id: ID do KnowledgeDocument de origem (para deleção em lote).
        provider: Nome do provider que gerou o embedding ("openai", "anthropic", ...).
        model: Modelo usado para geração ("text-embedding-3-small", ...).
        dimensions: Número de dimensões do vetor (ex: 1536 para text-embedding-3-small).
        vector: Vetor de floats gerado pelo provider.
        metadata: Metadados adicionais para debug/auditoria.
    """

    chunk_id: str
    document_id: str
    provider: str
    model: str
    dimensions: int
    vector: list[float]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class VectorSearchOptions:
    """Opções adicionais para similarity search.

    Campos:
        index_type: Tipo de índice pgvector a usar — "ivfflat" | "hnsw".
        distance_metric: Métrica de distância — "cosine" | "l2" | "inner_product".
        ef_search: Parâmetro HNSW para busca (maior = mais preciso, mais lento).
        probes: Parâmetro IVFFlat (número de clusters a provar).
    """

    index_type: str = "hnsw"
    distance_metric: str = "cosine"
    ef_search: int = 64
    probes: int = 10


class VectorStoreContract(ABC):
    """Interface para operações de vector store com pgvector.

    Responsabilidades:
        - Persistir embeddings de chunks no banco Postgres.
        - Executar similarity search retornando RetrievalResult.
        - Deletar embeddings ao re-indexar ou arquivar um documento.
        - Verificar disponibilidade da extensão pgvector.

    Separação de responsabilidades:
        - Geração de embeddings: EmbeddingProviderContract.
        - Persistência de chunks (texto): KnowledgeChunkRepositoryContract.
        - Similarity search + lookup de chunks: VectorStoreContract.

    Implementação futura: PostgresVectorStore (AI-RAG-1b).
    """

    @abstractmethod
    async def upsert_embeddings(self, embeddings: list[EmbeddingVector]) -> int:
        """Persiste ou atualiza embeddings em lote.

        Args:
            embeddings: Lista de EmbeddingVector a persistir.

        Returns:
            Quantidade de embeddings inseridos/atualizados.
        """
        ...

    @abstractmethod
    async def similarity_search(
        self,
        query: RetrievalQuery,
        query_vector: list[float],
        options: VectorSearchOptions | None = None,
    ) -> RetrievalResult:
        """Busca chunks semanticamente similares ao query_vector.

        Args:
            query: Contém limit, min_score e filters (source_type, etc.).
            query_vector: Embedding da query gerado pelo EmbeddingProviderContract.
            options: Opções de índice e métrica de distância.

        Returns:
            RetrievalResult com chunks ordenados por similaridade decrescente.
            Chunks com score < query.min_score são excluídos.
        """
        ...

    @abstractmethod
    async def delete_embeddings_by_document(self, document_id: str) -> int:
        """Remove todos os embeddings de um documento.

        Chamado antes de re-indexar um documento ou ao arquivá-lo.

        Returns:
            Quantidade de embeddings removidos.
        """
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Verifica se o vector store está disponível e a extensão pgvector ativa.

        Returns:
            True se pgvector está instalado e a tabela de embeddings acessível.
            False caso contrário (pgvector não instalado, conexão falha, etc.).
        """
        ...

    @abstractmethod
    async def count_embeddings(self, document_id: str | None = None) -> int:
        """Retorna o total de embeddings armazenados.

        Args:
            document_id: Se fornecido, conta apenas embeddings desse documento.

        Returns:
            Contagem total.
        """
        ...
