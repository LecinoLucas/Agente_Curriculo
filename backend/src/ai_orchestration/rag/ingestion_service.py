"""
Text Ingestion Service — pipeline RAG sem embeddings (AI-RAG-3).

Coordena as etapas 1–6 do pipeline de ingestão:
  1. Validação de conteúdo (não vazio)
  2. Cálculo de content_hash (SHA-256)
  3. Deduplicação por content_hash
  4. Persistência de KnowledgeDocument
  5. Chunking com TextChunker (ou qualquer ChunkingContract)
  6. Persistência de KnowledgeChunk

Embeddings (etapas 7+) serão implementados em AI-RAG-4.
Recebe repositórios por contrato — nunca por classe concreta.
Nenhum LLM, nenhum provider externo, nenhum endpoint.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from src.ai_orchestration.rag.chunking import TextChunker
from src.ai_orchestration.rag.chunking_contract import ChunkingContract
from src.ai_orchestration.rag.document_repository_contract import (
    KnowledgeChunkRepositoryContract,
    KnowledgeDocumentRepositoryContract,
)
from src.ai_orchestration.rag.hash_utils import compute_content_hash
from src.ai_orchestration.rag.ingestion_plan import (
    IngestionPipelineInput,
    IngestionPipelineResult,
)
from src.ai_orchestration.rag.schemas import KnowledgeChunk, KnowledgeDocument


class TextIngestionService:
    """Pipeline de ingestão textual RAG — fase AI-RAG-3 (sem embeddings).

    Implementa as etapas de validação, hash, deduplicação, criação de documento,
    chunking e persistência de chunks. Não chama LLM nem provider externo.
    """

    def __init__(
        self,
        doc_repo: KnowledgeDocumentRepositoryContract,
        chunk_repo: KnowledgeChunkRepositoryContract,
        chunker: ChunkingContract | None = None,
    ) -> None:
        self._doc_repo = doc_repo
        self._chunk_repo = chunk_repo
        self._chunker = chunker or TextChunker()

    async def ingest(
        self, pipeline_input: IngestionPipelineInput
    ) -> IngestionPipelineResult:
        """Ingere documento na knowledge base.

        Retorna was_duplicate=True se content_hash já existir.
        Se force_reingest=True e for duplicado, recria os chunks do documento existente
        sem criar um novo registro em KnowledgeDocument (evita violação de UniqueConstraint).
        """
        content = (pipeline_input.content or "").strip()
        if not content:
            return IngestionPipelineResult(ok=False, error="empty_content")

        content_hash = compute_content_hash(content)

        # 1. Verificar deduplicação
        existing = None
        try:
            existing = await self._doc_repo.find_by_content_hash(content_hash)
        except Exception as exc:
            return IngestionPipelineResult(
                ok=False,
                content_hash=content_hash,
                error=f"repository_error: {exc}",
            )

        # 2. Caso de duplicata encontrada
        if existing is not None:
            if not pipeline_input.force_reingest:
                return IngestionPipelineResult(
                    ok=True,
                    document_id=existing.id,
                    content_hash=content_hash,
                    was_duplicate=True,
                    reingested=False,
                )
            
            # force_reingest=True -> Reutilizar documento existente e recriar chunks
            re_result = await self.reingest_by_document_id(existing.id)
            if not re_result.ok:
                return re_result
            
            return IngestionPipelineResult(
                ok=True,
                document_id=existing.id,
                content_hash=content_hash,
                was_duplicate=True,
                reingested=True,
                chunks_created=re_result.chunks_created,
            )

        # 3. Caso de documento novo
        meta: dict[str, Any] = dict(pipeline_input.metadata or {})
        if pipeline_input.source_uri:
            meta["source_uri"] = pipeline_input.source_uri
        if pipeline_input.ingest_by_user_id:
            meta["created_by"] = pipeline_input.ingest_by_user_id

        doc = KnowledgeDocument(
            id=str(uuid4()),
            title=pipeline_input.title,
            source_type=pipeline_input.source_type,
            content=content,
            metadata=meta,
        )

        try:
            saved_doc = await self._doc_repo.create_document(doc)
            chunks = await self._chunk_and_save(saved_doc)
        except Exception as exc:
            # Captura erro de integridade (ex: corrida onde documento foi criado entre find e create)
            return IngestionPipelineResult(
                ok=False,
                content_hash=content_hash,
                error=f"repository_error: {exc}",
            )

        return IngestionPipelineResult(
            ok=True,
            document_id=saved_doc.id,
            content_hash=content_hash,
            was_duplicate=False,
            reingested=False,
            chunks_created=len(chunks),
        )

    async def reingest_by_document_id(
        self, document_id: str
    ) -> IngestionPipelineResult:
        """Re-chunkeia documento existente, substituindo chunks antigos.

        Preserva o KnowledgeDocument. Não re-gera embeddings (AI-RAG-4).
        Retorna ok=False se document_id não encontrado ou erro de repositório.
        """
        try:
            doc = await self._doc_repo.get_document(document_id)
        except Exception as exc:
            return IngestionPipelineResult(
                ok=False,
                document_id=document_id,
                error=f"repository_error: {exc}",
            )

        if doc is None:
            return IngestionPipelineResult(
                ok=False,
                document_id=document_id,
                error="document_not_found",
            )

        try:
            # Deletar chunks antigos (limpeza garantida)
            await self._chunk_repo.delete_chunks_by_document(document_id)
            
            # Gerar e salvar novos chunks
            chunks = await self._chunk_and_save(doc)
        except Exception as exc:
            return IngestionPipelineResult(
                ok=False,
                document_id=document_id,
                error=f"repository_error: {exc}",
            )

        return IngestionPipelineResult(
            ok=True,
            document_id=doc.id,
            content_hash=compute_content_hash(doc.content),
            was_duplicate=True, # Já existia se estamos em reingest_by_id
            reingested=True,
            chunks_created=len(chunks),
        )

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _chunk_and_save(
        self, doc: KnowledgeDocument
    ) -> list[KnowledgeChunk]:
        raw_chunks = self._chunker.chunk(doc.content, metadata=dict(doc.metadata))
        if not raw_chunks:
            return []
        knowledge_chunks = [
            KnowledgeChunk(
                id=str(uuid4()),
                document_id=doc.id,
                chunk_index=c.chunk_index,
                content=c.content,
                metadata={**c.metadata, "token_count": c.token_count},
                source_title=doc.title,
            )
            for c in raw_chunks
        ]
        return await self._chunk_repo.save_chunks(knowledge_chunks)
