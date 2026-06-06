"""Unit/integration tests — AI RAG Postgres Repositories (AI-RAG-2).

Usa SQLite em memória via fixture `db_session` do conftest raiz.
Nenhum LLM chamado, nenhum provider externo, nenhum embedding real.
Conteúdo dos documentos de teste é completamente fictício.

Cobertura:
 1. Tabela de documentos existe (create_all cria ai_knowledge_documents).
 2. Tabela de chunks existe (create_all cria ai_knowledge_chunks).
 3. create_document salva KnowledgeDocument.
 4. get_document retorna KnowledgeDocument pelo ID.
 5. list_documents filtra por status ativo.
 6. list_documents filtra por source_type.
 7. find_by_content_hash encontra documento ativo com hash correspondente.
 8. find_by_content_hash retorna None se não encontrado.
 9. mark_document_archived altera status para archived.
10. mark_document_archived retorna False para document_id inexistente.
11. save_chunks persiste múltiplos chunks.
12. get_chunks_by_document retorna chunks ordenados por chunk_index.
13. delete_chunks_by_document remove chunks e retorna contagem.
14. unique(document_id, chunk_index) evita duplicidade.
15. Repositórios implementam contratos.
16. metadata_json preserva metadados completos.
17. Documento arquivado não aparece em list_documents padrão.
18. get_chunks_by_document retorna lista vazia para documento inexistente.
19. list_chunks com ChunkFilter por document_id.
20. Nenhum teste chama LLM, provider ou embedding.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.document_repository_contract import (
    ChunkFilter,
    DocumentFilter,
    KnowledgeChunkRepositoryContract,
    KnowledgeDocumentRepositoryContract,
)
from src.ai_orchestration.rag.schemas import KnowledgeChunk, KnowledgeDocument
from src.infrastructure.repositories.sqlalchemy_knowledge_chunk_repository import (
    SQLAlchemyKnowledgeChunkRepository,
)
from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import (
    SQLAlchemyKnowledgeDocumentRepository,
)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _doc(
    title: str = "Guia Interno de RH",
    source_type: str = "rh_policy",
    content: str | None = None,
    metadata: dict | None = None,
) -> KnowledgeDocument:
    return KnowledgeDocument(
        id=str(uuid4()),
        title=title,
        source_type=source_type,
        content=content or f"Conteúdo fictício sobre {title}.",
        metadata=metadata or {},
    )


def _chunk(
    document_id: str,
    idx: int = 0,
    content: str | None = None,
    source_title: str = "Guia Interno",
) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=str(uuid4()),
        document_id=document_id,
        chunk_index=idx,
        content=content or f"Trecho fictício número {idx}.",
        metadata={"source_type": "rh_policy"},
        source_title=source_title,
    )


def _sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


# ── Testes de tabelas ──────────────────────────────────────────────────────────


class TestTablesExist:
    async def test_ai_knowledge_documents_table_exists(
        self, db_session: AsyncSession
    ) -> None:
        result = await db_session.execute(
            sa.text("SELECT 1 FROM ai_knowledge_documents LIMIT 1")
        )
        assert result is not None

    async def test_ai_knowledge_chunks_table_exists(
        self, db_session: AsyncSession
    ) -> None:
        result = await db_session.execute(
            sa.text("SELECT 1 FROM ai_knowledge_chunks LIMIT 1")
        )
        assert result is not None


# ── Contratos implementados ────────────────────────────────────────────────────


class TestContractsImplemented:
    def test_document_repo_implements_contract(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        assert isinstance(repo, KnowledgeDocumentRepositoryContract)

    def test_chunk_repo_implements_contract(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        assert isinstance(repo, KnowledgeChunkRepositoryContract)


# ── create_document ────────────────────────────────────────────────────────────


class TestCreateDocument:
    async def test_create_returns_knowledge_document(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        doc = _doc()
        result = await repo.create_document(doc)
        assert isinstance(result, KnowledgeDocument)
        assert result.title == doc.title

    async def test_create_persists_to_db(self, db_session: AsyncSession) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        doc = _doc(title="Política de Benefícios")
        created = await repo.create_document(doc)
        fetched = await repo.get_document(created.id)
        assert fetched is not None
        assert fetched.title == "Política de Benefícios"

    async def test_create_sets_created_at(self, db_session: AsyncSession) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        result = await repo.create_document(_doc())
        assert result.created_at is not None

    async def test_create_preserves_source_type(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        result = await repo.create_document(_doc(source_type="ats_guide"))
        assert result.source_type == "ats_guide"

    async def test_create_preserves_content(self, db_session: AsyncSession) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        doc = _doc(content="Este é o conteúdo fictício do documento.")
        result = await repo.create_document(doc)
        fetched = await repo.get_document(result.id)
        assert fetched is not None
        assert fetched.content == "Este é o conteúdo fictício do documento."


# ── get_document ───────────────────────────────────────────────────────────────


class TestGetDocument:
    async def test_get_returns_none_for_unknown_id(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        result = await repo.get_document(str(uuid4()))
        assert result is None

    async def test_get_returns_none_for_invalid_uuid(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        result = await repo.get_document("nao-e-um-uuid")
        assert result is None

    async def test_get_by_id_returns_correct_document(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        doc = _doc(title="Regras de Contratação")
        created = await repo.create_document(doc)
        fetched = await repo.get_document(created.id)
        assert fetched is not None
        assert fetched.title == "Regras de Contratação"


# ── list_documents ─────────────────────────────────────────────────────────────


class TestListDocuments:
    async def test_list_returns_active_documents(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        await repo.create_document(_doc(title="Doc A"))
        await repo.create_document(_doc(title="Doc B"))
        results = await repo.list_documents()
        assert len(results) >= 2

    async def test_list_excludes_archived_by_default(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        created = await repo.create_document(_doc(title="Doc Arquivar"))
        await repo.mark_document_archived(created.id)
        results = await repo.list_documents()
        ids = [r.id for r in results]
        assert created.id not in ids

    async def test_list_filters_by_source_type(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        await repo.create_document(
            _doc(title="Política RH", source_type="rh_policy", content="Conteúdo RH único abc.")
        )
        await repo.create_document(
            _doc(title="Guia ATS", source_type="ats_guide", content="Conteúdo ATS único xyz.")
        )
        results = await repo.list_documents(DocumentFilter(source_type="rh_policy"))
        assert all(r.source_type == "rh_policy" for r in results)

    async def test_list_respects_limit(self, db_session: AsyncSession) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        for i in range(5):
            await repo.create_document(_doc(title=f"Doc Limite {i}"))
        results = await repo.list_documents(DocumentFilter(limit=2))
        assert len(results) <= 2

    async def test_list_respects_offset(self, db_session: AsyncSession) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        for i in range(4):
            await repo.create_document(_doc(title=f"Doc Offset {i}"))
        all_results = await repo.list_documents(DocumentFilter(limit=10))
        offset_results = await repo.list_documents(DocumentFilter(limit=10, offset=2))
        assert len(offset_results) <= len(all_results)


# ── find_by_content_hash ───────────────────────────────────────────────────────


class TestFindByContentHash:
    async def test_finds_document_by_content_hash(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        content = "Conteúdo único para hash test 123."
        await repo.create_document(_doc(content=content))
        found = await repo.find_by_content_hash(_sha256(content))
        assert found is not None
        assert found.content == content

    async def test_returns_none_for_unknown_hash(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        result = await repo.find_by_content_hash("a" * 64)
        assert result is None

    async def test_archived_document_not_returned_by_hash(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        content = "Conteúdo para arquivar e buscar por hash."
        created = await repo.create_document(_doc(content=content))
        await repo.mark_document_archived(created.id)
        result = await repo.find_by_content_hash(_sha256(content))
        assert result is None


# ── mark_document_archived ─────────────────────────────────────────────────────


class TestMarkDocumentArchived:
    async def test_archiving_changes_status(self, db_session: AsyncSession) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        created = await repo.create_document(_doc())
        ok = await repo.mark_document_archived(created.id)
        assert ok is True
        from src.infrastructure.database.models.ai_knowledge_models import (
            AIKnowledgeDocumentModel,
        )
        from uuid import UUID
        stmt = sa.select(AIKnowledgeDocumentModel).where(
            AIKnowledgeDocumentModel.id == UUID(created.id)
        )
        row = await db_session.scalar(stmt)
        assert row is not None
        assert row.status == "archived"
        assert row.archived_at is not None

    async def test_archiving_unknown_id_returns_false(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        result = await repo.mark_document_archived(str(uuid4()))
        assert result is False


# ── save_chunks ────────────────────────────────────────────────────────────────


class TestSaveChunks:
    async def test_save_chunks_persists_all(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        chunks = [_chunk(created.id, i) for i in range(3)]
        saved = await chunk_repo.save_chunks(chunks)
        assert len(saved) == 3

    async def test_save_chunks_returns_knowledge_chunk_type(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        saved = await chunk_repo.save_chunks([_chunk(created.id)])
        assert all(isinstance(c, KnowledgeChunk) for c in saved)

    async def test_save_chunks_preserves_document_id(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        saved = await chunk_repo.save_chunks([_chunk(created.id)])
        assert saved[0].document_id == created.id

    async def test_save_empty_list_returns_empty(
        self, db_session: AsyncSession
    ) -> None:
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        result = await chunk_repo.save_chunks([])
        assert result == []


# ── get_chunks_by_document ─────────────────────────────────────────────────────


class TestGetChunksByDocument:
    async def test_returns_chunks_ordered_by_index(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        # Insert in reverse order
        await chunk_repo.save_chunks([_chunk(created.id, 2), _chunk(created.id, 0), _chunk(created.id, 1)])
        result = await chunk_repo.get_chunks_by_document(created.id)
        assert [c.chunk_index for c in result] == [0, 1, 2]

    async def test_returns_empty_for_unknown_document(
        self, db_session: AsyncSession
    ) -> None:
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        result = await chunk_repo.get_chunks_by_document(str(uuid4()))
        assert result == []

    async def test_only_returns_chunks_for_target_document(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        doc1 = await doc_repo.create_document(_doc(title="Doc 1"))
        doc2 = await doc_repo.create_document(_doc(title="Doc 2"))
        await chunk_repo.save_chunks([_chunk(doc1.id, 0), _chunk(doc1.id, 1)])
        await chunk_repo.save_chunks([_chunk(doc2.id, 0)])
        result = await chunk_repo.get_chunks_by_document(doc1.id)
        assert len(result) == 2
        assert all(c.document_id == doc1.id for c in result)


# ── delete_chunks_by_document ──────────────────────────────────────────────────


class TestDeleteChunksByDocument:
    async def test_delete_returns_count(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        await chunk_repo.save_chunks([_chunk(created.id, 0), _chunk(created.id, 1)])
        deleted = await chunk_repo.delete_chunks_by_document(created.id)
        assert deleted == 2

    async def test_delete_removes_from_db(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        await chunk_repo.save_chunks([_chunk(created.id)])
        await chunk_repo.delete_chunks_by_document(created.id)
        result = await chunk_repo.get_chunks_by_document(created.id)
        assert result == []

    async def test_delete_unknown_document_returns_zero(
        self, db_session: AsyncSession
    ) -> None:
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        count = await chunk_repo.delete_chunks_by_document(str(uuid4()))
        assert count == 0


# ── unique constraint ─────────────────────────────────────────────────────────


class TestUniqueConstraint:
    async def test_duplicate_doc_chunk_idx_raises(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        await chunk_repo.save_chunks([_chunk(created.id, 0)])

        with pytest.raises((IntegrityError, Exception)):
            await chunk_repo.save_chunks([_chunk(created.id, 0)])
            await db_session.flush()


# ── metadata preservation ──────────────────────────────────────────────────────


class TestMetadataPreservation:
    async def test_document_metadata_preserved(
        self, db_session: AsyncSession
    ) -> None:
        repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        meta = {"author": "RH", "version": "2024-Q1", "tags": ["férias", "CLT"]}
        doc = _doc(metadata=meta)
        created = await repo.create_document(doc)
        fetched = await repo.get_document(created.id)
        assert fetched is not None
        assert fetched.metadata["author"] == "RH"
        assert fetched.metadata["version"] == "2024-Q1"

    async def test_chunk_metadata_preserved(self, db_session: AsyncSession) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        chunk = KnowledgeChunk(
            id=str(uuid4()),
            document_id=created.id,
            chunk_index=0,
            content="Trecho com metadados ricos.",
            metadata={"source_type": "rh_policy", "section": "Benefícios"},
            source_title="Guia de Benefícios",
        )
        saved = await chunk_repo.save_chunks([chunk])
        assert saved[0].metadata["section"] == "Benefícios"
        assert saved[0].source_title == "Guia de Benefícios"

    async def test_chunk_source_title_preserved(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        created = await doc_repo.create_document(_doc())
        await chunk_repo.save_chunks(
            [_chunk(created.id, source_title="Política de Férias")]
        )
        result = await chunk_repo.get_chunks_by_document(created.id)
        assert result[0].source_title == "Política de Férias"


# ── list_chunks ────────────────────────────────────────────────────────────────


class TestListChunks:
    async def test_list_chunks_with_document_filter(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        doc = await doc_repo.create_document(_doc())
        await chunk_repo.save_chunks([_chunk(doc.id, 0), _chunk(doc.id, 1)])
        result = await chunk_repo.list_chunks(ChunkFilter(document_id=doc.id))
        assert all(c.document_id == doc.id for c in result)

    async def test_list_chunks_respects_limit(
        self, db_session: AsyncSession
    ) -> None:
        doc_repo = SQLAlchemyKnowledgeDocumentRepository(db_session)
        chunk_repo = SQLAlchemyKnowledgeChunkRepository(db_session)
        doc = await doc_repo.create_document(_doc())
        await chunk_repo.save_chunks([_chunk(doc.id, i) for i in range(5)])
        result = await chunk_repo.list_chunks(ChunkFilter(limit=2))
        assert len(result) <= 2
