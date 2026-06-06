"""
RAG Chunking Contract: Interface base para estratégia de chunking.

Esta é uma interface abstrata — sem implementação real.
A implementação real será feita em AI-RAG-1/2.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class Chunk:
    """
    Chunk de texto para indexação.

    Campos:
        content: Texto do chunk.
        chunk_index: Posição do chunk no documento original.
        token_count: Quantidade estimada de tokens.
        metadata: Metadados do chunk (seção, heading, etc.).
    """
    content: str
    chunk_index: int
    token_count: int
    metadata: dict


class ChunkingContract(ABC):
    """
    Interface base para estratégias de chunking de documentos.

    Parâmetros de chunking (configuráveis):
        - target_chunk_tokens: 400–600 tokens (alvo)
        - max_chunk_tokens: 800 tokens (máximo sem corte de frase)
        - overlap_tokens: 50–100 tokens (overlap entre chunks consecutivos)
        - split_on: Parágrafos e headings H2/H3 preferencialmente

    Implementações previstas:
        - SemanticChunker (AI-RAG-1): Split por parágrafo + overlap
        - RecursiveChunker (AI-RAG-2): Split recursivo por heading > parágrafo > frase
    """

    @abstractmethod
    def chunk(self, text: str, metadata: dict | None = None) -> list[Chunk]:
        """
        Divide um texto em chunks para indexação.

        Args:
            text: Texto completo do documento.
            metadata: Metadados base do documento para herdar nos chunks.

        Returns:
            Lista ordenada de Chunks prontos para embedding.
        """
        ...
