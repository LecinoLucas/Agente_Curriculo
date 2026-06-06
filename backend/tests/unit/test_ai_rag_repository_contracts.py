"""Unit tests — AI RAG Repository Contracts (AI-RAG-1b).

Verifica os contratos abstratos de repositório sem qualquer acesso a banco de dados,
LLM, embeddings ou provider externo.

Cobertura:
 1. KnowledgeDocumentRepositoryContract pode ser implementado por classe fake.
 2. KnowledgeChunkRepositoryContract pode ser implementado por classe fake.
 3. DocumentFilter aceita todos os campos esperados.
 4. ChunkFilter aceita todos os campos esperados.
 5. Fake document repo retorna KnowledgeDocument de create_document.
 6. Fake document repo retorna None de get_document quando não encontrado.
 7. Fake document repo retorna lista vazia de list_documents.
 8. Fake document repo retorna True de mark_document_archived.
 9. Fake document repo retorna None de find_by_content_hash.
10. Fake chunk repo persiste e retorna lista de save_chunks.
11. Fake chunk repo retorna lista vazia de get_chunks_by_document.
12. Fake chunk repo retorna 0 de delete_chunks_by_document.
13. Fake chunk repo retorna lista vazia de list_chunks.
14. Contratos não instanciam diretamente (ABC enforcement).
15. Nenhum teste acessa banco, LLM ou provider externo.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.ai_orchestration.rag.document_repository_contract import (
    ChunkFilter,
    DocumentFilter,
    KnowledgeChunkRepositoryContract,
    KnowledgeDocumentRepositoryContract,
)
from src.ai_orchestration.rag.schemas import KnowledgeChunk, KnowledgeDocument


# ── Fake implementations ───────────────────────────────────────────────────────


class FakeDocumentRepository(KnowledgeDocumentRepositoryContract):
    """Implementação fake para testes de contrato."""

    def __init__(self) -> None:
        self._store: dict[str, KnowledgeDocument] = {}
        self._archived: set[str] = set()

    async def create_document(self, document: KnowledgeDocument) -> KnowledgeDocument:
        self._store[document.id] = document
        return document

    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        return self._store.get(document_id)

    async def list_documents(
        self, filters: DocumentFilter | None = None
    ) -> list[KnowledgeDocument]:
        docs = [d for d in self._store.values() if d.id not in self._archived]
        if filters and filters.source_type:
            docs = [d for d in docs if d.source_type == filters.source_type]
        limit = filters.limit if filters else 50
        offset = filters.offset if filters else 0
        return docs[offset : offset + limit]

    async def mark_document_archived(self, document_id: str) -> bool:
        if document_id not in self._store:
            return False
        self._archived.add(document_id)
        return True

    async def find_by_content_hash(self, content_hash: str) -> KnowledgeDocument | None:
        return None


class FakeChunkRepository(KnowledgeChunkRepositoryContract):
    """Implementação fake para testes de contrato."""

    def __init__(self) -> None:
        self._store: dict[str, list[KnowledgeChunk]] = {}

    async def save_chunks(self, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        for chunk in chunks:
            self._store.setdefault(chunk.document_id, []).append(chunk)
        return chunks

    async def get_chunks_by_document(self, document_id: str) -> list[KnowledgeChunk]:
        return sorted(
            self._store.get(document_id, []), key=lambda c: c.chunk_index
        )

    async def delete_chunks_by_document(self, document_id: str) -> int:
        existing = self._store.pop(document_id, [])
        return len(existing)

    async def list_chunks(
        self, filters: ChunkFilter | None = None
    ) -> list[KnowledgeChunk]:
        all_chunks: list[KnowledgeChunk] = []
        for chunks in self._store.values():
            all_chunks.extend(chunks)
        if filters and filters.document_id:
            all_chunks = [c for c in all_chunks if c.document_id == filters.document_id]
        limit = filters.limit if filters else 100
        offset = filters.offset if filters else 0
        return all_chunks[offset : offset + limit]


# ── Helpers ────────────────────────────────────────────────────────────────────


def _doc(doc_id: str = "doc-1", source_type: str = "rh_policy") -> KnowledgeDocument:
    return KnowledgeDocument(
        id=doc_id,
        title="Política de Férias",
        source_type=source_type,
        content="Todo colaborador tem direito a 30 dias de férias.",
        created_at=datetime.now(timezone.utc),
    )


def _chunk(doc_id: str = "doc-1", idx: int = 0) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=f"chunk-{doc_id}-{idx}",
        document_id=doc_id,
        chunk_index=idx,
        content=f"Trecho {idx} do documento {doc_id}.",
        metadata={"source_type": "rh_policy"},
    )


# ── DocumentFilter ─────────────────────────────────────────────────────────────


class TestDocumentFilter:
    def test_defaults(self) -> None:
        f = DocumentFilter()
        assert f.source_type is None
        assert f.status is None
        assert f.limit == 50
        assert f.offset == 0

    def test_accepts_all_fields(self) -> None:
        f = DocumentFilter(source_type="rh_policy", status="active", limit=10, offset=5)
        assert f.source_type == "rh_policy"
        assert f.status == "active"
        assert f.limit == 10
        assert f.offset == 5


# ── ChunkFilter ────────────────────────────────────────────────────────────────


class TestChunkFilter:
    def test_defaults(self) -> None:
        f = ChunkFilter()
        assert f.document_id is None
        assert f.source_type is None
        assert f.limit == 100
        assert f.offset == 0

    def test_accepts_all_fields(self) -> None:
        f = ChunkFilter(document_id="doc-1", source_type="ats_guide", limit=20, offset=2)
        assert f.document_id == "doc-1"
        assert f.source_type == "ats_guide"
        assert f.limit == 20
        assert f.offset == 2


# ── ABC enforcement ────────────────────────────────────────────────────────────


class TestAbstractEnforcement:
    def test_document_repo_cannot_instantiate_directly(self) -> None:
        with pytest.raises(TypeError):
            KnowledgeDocumentRepositoryContract()  # type: ignore[abstract]

    def test_chunk_repo_cannot_instantiate_directly(self) -> None:
        with pytest.raises(TypeError):
            KnowledgeChunkRepositoryContract()  # type: ignore[abstract]


# ── FakeDocumentRepository ─────────────────────────────────────────────────────


class TestFakeDocumentRepository:
    async def test_create_document_returns_document(self) -> None:
        repo = FakeDocumentRepository()
        doc = _doc()
        result = await repo.create_document(doc)
        assert result.id == "doc-1"
        assert result.source_type == "rh_policy"

    async def test_get_document_returns_created(self) -> None:
        repo = FakeDocumentRepository()
        doc = _doc()
        await repo.create_document(doc)
        found = await repo.get_document("doc-1")
        assert found is not None
        assert found.title == "Política de Férias"

    async def test_get_document_returns_none_when_not_found(self) -> None:
        repo = FakeDocumentRepository()
        result = await repo.get_document("nao-existe")
        assert result is None

    async def test_list_documents_returns_empty_initially(self) -> None:
        repo = FakeDocumentRepository()
        result = await repo.list_documents()
        assert result == []

    async def test_list_documents_returns_created(self) -> None:
        repo = FakeDocumentRepository()
        await repo.create_document(_doc("d1"))
        await repo.create_document(_doc("d2"))
        result = await repo.list_documents()
        assert len(result) == 2

    async def test_list_documents_filter_by_source_type(self) -> None:
        repo = FakeDocumentRepository()
        await repo.create_document(_doc("d1", "rh_policy"))
        await repo.create_document(_doc("d2", "ats_guide"))
        result = await repo.list_documents(DocumentFilter(source_type="rh_policy"))
        assert len(result) == 1
        assert result[0].source_type == "rh_policy"

    async def test_mark_document_archived_returns_true(self) -> None:
        repo = FakeDocumentRepository()
        await repo.create_document(_doc())
        archived = await repo.mark_document_archived("doc-1")
        assert archived is True

    async def test_archived_document_excluded_from_list(self) -> None:
        repo = FakeDocumentRepository()
        await repo.create_document(_doc())
        await repo.mark_document_archived("doc-1")
        result = await repo.list_documents()
        assert result == []

    async def test_mark_document_archived_returns_false_if_not_found(self) -> None:
        repo = FakeDocumentRepository()
        result = await repo.mark_document_archived("nao-existe")
        assert result is False

    async def test_find_by_content_hash_returns_none(self) -> None:
        repo = FakeDocumentRepository()
        result = await repo.find_by_content_hash("sha256abc")
        assert result is None


# ── FakeChunkRepository ────────────────────────────────────────────────────────


class TestFakeChunkRepository:
    async def test_save_chunks_returns_saved_chunks(self) -> None:
        repo = FakeChunkRepository()
        chunks = [_chunk("doc-1", 0), _chunk("doc-1", 1)]
        result = await repo.save_chunks(chunks)
        assert len(result) == 2
        assert result[0].document_id == "doc-1"

    async def test_get_chunks_by_document_returns_in_order(self) -> None:
        repo = FakeChunkRepository()
        await repo.save_chunks([_chunk("doc-1", 2), _chunk("doc-1", 0), _chunk("doc-1", 1)])
        result = await repo.get_chunks_by_document("doc-1")
        assert [c.chunk_index for c in result] == [0, 1, 2]

    async def test_get_chunks_returns_empty_when_not_found(self) -> None:
        repo = FakeChunkRepository()
        result = await repo.get_chunks_by_document("nao-existe")
        assert result == []

    async def test_delete_chunks_returns_count(self) -> None:
        repo = FakeChunkRepository()
        await repo.save_chunks([_chunk("doc-1", 0), _chunk("doc-1", 1)])
        deleted = await repo.delete_chunks_by_document("doc-1")
        assert deleted == 2

    async def test_delete_chunks_removes_from_store(self) -> None:
        repo = FakeChunkRepository()
        await repo.save_chunks([_chunk("doc-1", 0)])
        await repo.delete_chunks_by_document("doc-1")
        result = await repo.get_chunks_by_document("doc-1")
        assert result == []

    async def test_delete_chunks_returns_zero_if_not_found(self) -> None:
        repo = FakeChunkRepository()
        deleted = await repo.delete_chunks_by_document("nao-existe")
        assert deleted == 0

    async def test_list_chunks_returns_empty_initially(self) -> None:
        repo = FakeChunkRepository()
        result = await repo.list_chunks()
        assert result == []

    async def test_list_chunks_returns_all_saved(self) -> None:
        repo = FakeChunkRepository()
        await repo.save_chunks([_chunk("doc-1", 0), _chunk("doc-2", 0)])
        result = await repo.list_chunks()
        assert len(result) == 2
