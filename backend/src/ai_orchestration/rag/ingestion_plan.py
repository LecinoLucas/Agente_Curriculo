"""
Ingestion Pipeline Plan: Contrato para o pipeline completo de ingestão RAG.

Este módulo define o contrato de alto nível para o pipeline que coordena:
    1. Chunking (TextChunker / ChunkingContract)
    2. Geração de embeddings (EmbeddingProviderContract)
    3. Persistência de documentos e chunks (KnowledgeDocumentRepositoryContract)
    4. Persistência de embeddings (VectorStoreContract)
    5. Log de auditoria

Fase de implementação: AI-RAG-2 (futura).

Nenhuma chamada real a banco, LLM ou provider externo neste módulo.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class IngestionPipelineInput:
    """Entrada para o pipeline completo de ingestão RAG.

    Campos:
        title: Título legível do documento (ex: "Política de Férias 2024").
        content: Texto integral do documento a indexar.
        source_type: Categoria da fonte. Exemplos:
            - "rh_policy"        — Políticas de RH (férias, benefícios, conduta)
            - "ats_guide"        — Guias do ATS (criação de vaga, triagem)
            - "hiring_rules"     — Regras de contratação por nível/tipo
            - "pre_admission"    — Fluxo e documentos de pré-admissão
            - "protheus_docs"    — Integração com ERP Protheus
            - "internal_faq"     — FAQs internos de recrutadores
        source_uri: URL ou caminho do documento original (para citação).
        metadata: Campos adicionais — versão, autor, seção, data, etc.
        ingest_by_user_id: ID do usuário que disparou a ingestão (auditoria).
        force_reingest: Se True, re-ingere mesmo que content_hash já exista.
    """

    title: str
    content: str
    source_type: str
    source_uri: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    ingest_by_user_id: str | None = None
    force_reingest: bool = False


@dataclass
class IngestionPipelineResult:
    """Resultado da execução do pipeline de ingestão.

    Campos:
        ok: True se a ingestão completou sem erros críticos.
        document_id: ID do KnowledgeDocument criado ou atualizado.
        chunks_created: Quantidade de chunks persistidos.
        embeddings_created: Quantidade de embeddings gerados e armazenados.
        content_hash: SHA-256 do conteúdo (para detecção de duplicatas).
        was_duplicate: True se o documento já existia (content_hash repetido).
        reingested: True se um documento existente foi re-processado (chunks recriados).
        error: Mensagem de erro se ok=False.
        warnings: Avisos não-fatais (ex: chunk muito curto, token limit atingido).
    """

    ok: bool
    document_id: str | None = None
    chunks_created: int = 0
    embeddings_created: int = 0
    content_hash: str | None = None
    was_duplicate: bool = False
    reingested: bool = False
    error: str | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass
class ReIngestionResult:
    """Resultado de re-ingestão de um documento já indexado.

    Usado quando o provider de embeddings muda ou o modelo é atualizado.

    Campos:
        ok: True se re-ingestão completou.
        document_id: ID do documento re-indexado.
        old_embeddings_deleted: Embeddings removidos antes da re-geração.
        new_embeddings_created: Novos embeddings gerados.
        error: Mensagem de erro se ok=False.
    """

    ok: bool
    document_id: str
    old_embeddings_deleted: int = 0
    new_embeddings_created: int = 0
    error: str | None = None
    warnings: list[str] = field(default_factory=list)


class IngestionPipelineContract(ABC):
    """Contrato para o pipeline de ingestão RAG completo.

    Coordena todas as etapas de indexação de um documento na knowledge base.

    Etapas do pipeline (implementação futura — AI-RAG-2):
        1. Validar input (title, content, source_type obrigatórios).
        2. Calcular content_hash (SHA-256 do content).
        3. Verificar duplicata via KnowledgeDocumentRepositoryContract.find_by_content_hash.
        4. Criar KnowledgeDocument via repositório.
        5. Chunkar via ChunkingContract.chunk().
        6. Persistir chunks via KnowledgeChunkRepositoryContract.save_chunks().
        7. Gerar embeddings via EmbeddingProviderContract.embed_texts().
        8. Persistir embeddings via VectorStoreContract.upsert_embeddings().
        9. Retornar IngestionPipelineResult.

    Implementação prevista: DefaultIngestionPipeline (AI-RAG-2).
    """

    @abstractmethod
    async def run(self, pipeline_input: IngestionPipelineInput) -> IngestionPipelineResult:
        """Executa o pipeline completo para um documento.

        Args:
            pipeline_input: Documento e metadados a indexar.

        Returns:
            IngestionPipelineResult com status e métricas da ingestão.
        """
        ...

    @abstractmethod
    async def re_embed_document(self, document_id: str) -> ReIngestionResult:
        """Re-gera embeddings de um documento sem re-chunkar.

        Usado quando o provider ou modelo de embedding muda.
        Mantém os chunks existentes — apenas recria os vetores.

        Args:
            document_id: ID do KnowledgeDocument a re-indexar.

        Returns:
            ReIngestionResult com contagem de embeddings deletados e criados.
        """
        ...

    @abstractmethod
    async def delete_document(
        self, document_id: str, deleted_by: str | None = None
    ) -> bool:
        """Remove um documento da knowledge base (chunks + embeddings + soft-delete).

        Etapas:
            1. Deletar embeddings via VectorStoreContract.delete_embeddings_by_document.
            2. Deletar chunks via KnowledgeChunkRepositoryContract.delete_chunks_by_document.
            3. Arquivar documento via KnowledgeDocumentRepositoryContract.mark_document_archived.

        Args:
            document_id: ID do documento a remover.
            deleted_by: ID do usuário que solicitou a remoção (auditoria).

        Returns:
            True se o documento foi encontrado e removido.
            False se o documento não existia.
        """
        ...
