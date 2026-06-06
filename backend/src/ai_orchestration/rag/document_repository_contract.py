"""
Document Repository Contracts: Interfaces para persistência de documentos e chunks RAG.

Contratos abstratos para as futuras implementações Postgres (AI-RAG-1b).
Nenhuma implementação real aqui — apenas tipagem e assinatura de métodos.

Implementações previstas:
    - PostgresKnowledgeDocumentRepository (AI-RAG-1b)
    - PostgresKnowledgeChunkRepository (AI-RAG-1b)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from src.ai_orchestration.rag.schemas import KnowledgeChunk, KnowledgeDocument


@dataclass
class DocumentFilter:
    """Filtros para listagem de documentos na base de conhecimento.

    Campos:
        source_type: Filtrar por tipo de fonte ("rh_policy", "ats_guide", ...).
        status: Filtrar por status — "active" | "archived".
        limit: Máximo de documentos a retornar (padrão: 50).
        offset: Offset para paginação (padrão: 0).
    """

    source_type: str | None = None
    status: str | None = None
    limit: int = 50
    offset: int = 0


@dataclass
class ChunkFilter:
    """Filtros para listagem de chunks na base de conhecimento.

    Campos:
        document_id: Filtrar por documento de origem.
        source_type: Filtrar por tipo de fonte via metadata.
        limit: Máximo de chunks a retornar (padrão: 100).
        offset: Offset para paginação (padrão: 0).
    """

    document_id: str | None = None
    source_type: str | None = None
    limit: int = 100
    offset: int = 0


class KnowledgeDocumentRepositoryContract(ABC):
    """Interface para persistência de KnowledgeDocument.

    Responsabilidades:
        - Criar e atualizar documentos na base de conhecimento.
        - Recuperar documentos por ID ou hash de conteúdo.
        - Listar documentos com filtros.
        - Arquivar documentos (soft-delete).

    Implementação futura: PostgresKnowledgeDocumentRepository (AI-RAG-1b).
    """

    @abstractmethod
    async def create_document(self, document: KnowledgeDocument) -> KnowledgeDocument:
        """Persiste um novo documento.

        Returns:
            KnowledgeDocument com campos resolvidos (created_at, etc.).
        """
        ...

    @abstractmethod
    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        """Recupera documento pelo ID.

        Returns:
            KnowledgeDocument ou None se não encontrado.
        """
        ...

    @abstractmethod
    async def list_documents(
        self, filters: DocumentFilter | None = None
    ) -> list[KnowledgeDocument]:
        """Lista documentos ativos com filtros opcionais.

        Returns:
            Lista de KnowledgeDocument ordenada por created_at DESC.
        """
        ...

    @abstractmethod
    async def mark_document_archived(self, document_id: str) -> bool:
        """Arquiva um documento (soft-delete).

        Returns:
            True se o documento foi encontrado e arquivado.
            False se o documento não foi encontrado.
        """
        ...

    @abstractmethod
    async def find_by_content_hash(self, content_hash: str) -> KnowledgeDocument | None:
        """Busca documento por hash SHA-256 do conteúdo.

        Usado para evitar re-ingestão de documentos idênticos.

        Returns:
            KnowledgeDocument ativo com esse hash, ou None.
        """
        ...


class KnowledgeChunkRepositoryContract(ABC):
    """Interface para persistência de KnowledgeChunk.

    Responsabilidades:
        - Salvar lotes de chunks gerados pelo TextChunker.
        - Recuperar chunks por documento.
        - Deletar chunks ao re-indexar um documento.
        - Listar chunks com filtros para diagnóstico.

    Implementação futura: PostgresKnowledgeChunkRepository (AI-RAG-1b).

    Nota: os chunks não contêm embeddings — a persistência de embeddings
    é responsabilidade do VectorStoreContract.
    """

    @abstractmethod
    async def save_chunks(self, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        """Persiste um lote de chunks de um documento.

        Args:
            chunks: Lista de KnowledgeChunk a persistir.

        Returns:
            Lista dos chunks persistidos (pode incluir campos resolvidos como created_at).
        """
        ...

    @abstractmethod
    async def get_chunks_by_document(self, document_id: str) -> list[KnowledgeChunk]:
        """Retorna todos os chunks de um documento, ordenados por chunk_index.

        Returns:
            Lista de KnowledgeChunk em ordem de chunk_index.
        """
        ...

    @abstractmethod
    async def delete_chunks_by_document(self, document_id: str) -> int:
        """Remove todos os chunks de um documento.

        Usado antes de re-indexar um documento atualizado.

        Returns:
            Quantidade de chunks removidos.
        """
        ...

    @abstractmethod
    async def list_chunks(
        self, filters: ChunkFilter | None = None
    ) -> list[KnowledgeChunk]:
        """Lista chunks com filtros opcionais para diagnóstico e auditoria.

        Returns:
            Lista de KnowledgeChunk.
        """
        ...
