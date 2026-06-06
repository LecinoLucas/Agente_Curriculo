"""
RAG Ingestion Contract: Interface base para ingestão de documentos.

Esta é uma interface abstrata — sem implementação real.
A implementação real será feita em AI-RAG-1.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class IngestionDocument:
    """
    Documento a ser ingerido na base de conhecimento RAG.

    Campos:
        title: Título do documento.
        content: Conteúdo completo em texto plano.
        source_type: Tipo de fonte — deve ser um valor de RagSource.VALID_SOURCE_TYPES.
        metadata: Metadados adicionais (autor, versão, data de vigência, tags, etc.).
    """
    title: str
    content: str
    source_type: str
    metadata: dict[str, Any]


@dataclass
class IngestionResult:
    """
    Resultado da ingestão de um documento.

    Campos:
        document_id: UUID do documento criado ou atualizado.
        chunks_created: Quantidade de chunks gerados.
        ok: True se a ingestão foi bem-sucedida.
        error: Mensagem de erro se ok=False.
    """
    document_id: str | None
    chunks_created: int
    ok: bool
    error: str | None = None


class IngestionContract(ABC):
    """
    Interface base para o pipeline de ingestão de documentos RAG.

    Responsabilidades:
        - Pré-processar e limpar o documento
        - Dividir em chunks com overlap semântico
        - Gerar embeddings por chunk
        - Persistir na base vetorial
        - Retornar IngestionResult com quantidade de chunks criados

    Implementação prevista em AI-RAG-1.
    """

    @abstractmethod
    async def ingest(self, document: IngestionDocument) -> IngestionResult:
        """
        Ingere um documento na base de conhecimento.

        Args:
            document: Documento a ser indexado.

        Returns:
            IngestionResult com status da operação.
        """
        ...

    @abstractmethod
    async def delete_document(self, document_id: str) -> bool:
        """
        Remove um documento e todos os seus chunks da base.

        Returns:
            True se removido com sucesso, False se não encontrado.
        """
        ...
