"""Unit tests — AI RAG Text Ingestion Service (AI-RAG-3).

Cobertura:
 1. Ingestão de documento novo cria KnowledgeDocument.
 2. Ingestão de documento novo cria chunks.
 3. content_hash é calculado de forma determinística.
 4. Documento duplicado por content_hash não cria novo documento.
 5. Documento duplicado retorna was_duplicate=True.
 6. Texto vazio retorna erro controlado.
 7. Texto whitespace retorna erro controlado.
 8. Chunks preservam document_id e chunk_index.
 9. Chunks preservam source_title.
10. Metadata do documento é preservada.
11. Reingestão remove chunks antigos e cria novos.
12. Serviço usa repositories por contrato, não implementação concreta.
13. Nenhum test chama LLM, provider externo, embedding ou endpoint.
14. Erro interno de repository vira resultado controlado.
15. Testes usam conteúdo fake.

Regras:
- Nenhum LLM chamado.
- Nenhum provider externo.
- Nenhum embedding real.
- Nenhum endpoint.
- Conteúdo fictício em todos os testes.
"""
from __future__ import annotations

import inspect

import pytest

from src.ai_orchestration.rag.document_repository_contract import (
    ChunkFilter,
    DocumentFilter,
    KnowledgeChunkRepositoryContract,
    KnowledgeDocumentRepositoryContract,
)
from src.ai_orchestration.rag.hash_utils import compute_content_hash
from src.ai_orchestration.rag.ingestion_plan import IngestionPipelineInput
from src.ai_orchestration.rag.ingestion_service import TextIngestionService
from src.ai_orchestration.rag.schemas import KnowledgeChunk, KnowledgeDocument


# ── Fake content (all fictitious) ─────────────────────────────────────────────

FAKE_CONTENT = (
    "Este é um documento fictício de política de RH para testes unitários. "
    "Nenhuma informação real está presente neste texto de exemplo."
)
FAKE_TITLE = "Guia Fictício de RH"
FAKE_SOURCE_TYPE = "rh_policy"


# ── Fake repositories ─────────────────────────────────────────────────────────


class FakeDocumentRepository(KnowledgeDocumentRepositoryContract):
    """In-memory implementation for unit tests — no DB, no LLM."""

    def __init__(self) -> None:
        self._store: dict[str, KnowledgeDocument] = {}
        self._archived: set[str] = set()
        self._hash_index: dict[str, str] = {}

    async def create_document(self, document: KnowledgeDocument) -> KnowledgeDocument:
        content_hash = compute_content_hash(document.content)
        self._store[document.id] = document
        self._hash_index[content_hash] = document.id
        return document

    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        return self._store.get(document_id)

    async def list_documents(
        self, filters: DocumentFilter | None = None
    ) -> list[KnowledgeDocument]:
        return [d for d in self._store.values() if d.id not in self._archived]

    async def mark_document_archived(self, document_id: str) -> bool:
        if document_id not in self._store:
            return False
        self._archived.add(document_id)
        return True

    async def find_by_content_hash(
        self, content_hash: str
    ) -> KnowledgeDocument | None:
        doc_id = self._hash_index.get(content_hash)
        if doc_id is None or doc_id in self._archived:
            return None
        return self._store.get(doc_id)


class FakeChunkRepository(KnowledgeChunkRepositoryContract):
    """In-memory implementation for unit tests — no DB, no LLM."""

    def __init__(self) -> None:
        self._by_doc: dict[str, list[KnowledgeChunk]] = {}
        self.delete_calls: list[str] = []

    async def save_chunks(
        self, chunks: list[KnowledgeChunk]
    ) -> list[KnowledgeChunk]:
        for c in chunks:
            self._by_doc.setdefault(c.document_id, []).append(c)
        return chunks

    async def get_chunks_by_document(
        self, document_id: str
    ) -> list[KnowledgeChunk]:
        return sorted(
            self._by_doc.get(document_id, []),
            key=lambda c: c.chunk_index,
        )

    async def delete_chunks_by_document(self, document_id: str) -> int:
        self.delete_calls.append(document_id)
        removed = self._by_doc.pop(document_id, [])
        return len(removed)

    async def list_chunks(
        self, filters: ChunkFilter | None = None
    ) -> list[KnowledgeChunk]:
        all_chunks: list[KnowledgeChunk] = []
        for chunks in self._by_doc.values():
            all_chunks.extend(chunks)
        return all_chunks


class ErrorDocumentRepository(FakeDocumentRepository):
    """Raises on find_by_content_hash to simulate repository failure."""

    async def find_by_content_hash(self, content_hash: str) -> KnowledgeDocument | None:
        raise RuntimeError("DB connection failed — simulated error")


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_input(**overrides) -> IngestionPipelineInput:
    defaults: dict = {
        "title": FAKE_TITLE,
        "content": FAKE_CONTENT,
        "source_type": FAKE_SOURCE_TYPE,
    }
    return IngestionPipelineInput(**{**defaults, **overrides})


def _make_service(
    doc_repo: KnowledgeDocumentRepositoryContract | None = None,
    chunk_repo: KnowledgeChunkRepositoryContract | None = None,
) -> TextIngestionService:
    return TextIngestionService(
        doc_repo=doc_repo or FakeDocumentRepository(),
        chunk_repo=chunk_repo or FakeChunkRepository(),
    )


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestNewDocumentIngestion:
    """Testes 1–2: criação de documento e chunks na ingestão nova."""

    async def test_new_document_creates_knowledge_document(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        result = await service.ingest(_make_input())

        assert result.ok is True
        assert result.document_id is not None
        assert result.document_id in doc_repo._store

    async def test_new_document_creates_chunks(self) -> None:
        chunk_repo = FakeChunkRepository()
        service = _make_service(chunk_repo=chunk_repo)

        result = await service.ingest(
            _make_input(content="Parágrafo fictício um.\n\nParágrafo fictício dois.")
        )

        assert result.ok is True
        assert result.chunks_created > 0
        all_chunks = list(chunk_repo._by_doc.values())
        assert len(all_chunks) > 0


class TestContentHash:
    """Teste 3: hash determinístico."""

    def test_content_hash_is_deterministic(self) -> None:
        h1 = compute_content_hash(FAKE_CONTENT)
        h2 = compute_content_hash(FAKE_CONTENT)
        assert h1 == h2

    def test_content_hash_is_sha256_length(self) -> None:
        h = compute_content_hash(FAKE_CONTENT)
        assert len(h) == 64

    def test_different_content_produces_different_hash(self) -> None:
        h1 = compute_content_hash("Conteúdo fictício A.")
        h2 = compute_content_hash("Conteúdo fictício B.")
        assert h1 != h2


class TestDuplicateDetection:
    """Testes 4–5: deduplicação por content_hash."""

    async def test_duplicate_does_not_create_new_document(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        await service.ingest(_make_input())
        await service.ingest(_make_input())  # mesmo conteúdo

        assert len(doc_repo._store) == 1

    async def test_duplicate_returns_was_duplicate_true(self) -> None:
        service = _make_service()

        await service.ingest(_make_input())
        result = await service.ingest(_make_input())  # mesmo conteúdo

        assert result.ok is True
        assert result.was_duplicate is True

    async def test_duplicate_result_contains_existing_document_id(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        first = await service.ingest(_make_input())
        second = await service.ingest(_make_input())

        assert second.document_id == first.document_id

    async def test_force_reingest_bypasses_duplicate_check(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        await service.ingest(_make_input())
        result = await service.ingest(_make_input(force_reingest=True))

        assert result.ok is True
        assert result.was_duplicate is False
        assert len(doc_repo._store) == 2


class TestInvalidInput:
    """Testes 6–7: conteúdo inválido retorna erro controlado."""

    async def test_empty_content_returns_error(self) -> None:
        service = _make_service()
        result = await service.ingest(_make_input(content=""))
        assert result.ok is False
        assert result.error is not None

    async def test_whitespace_content_returns_error(self) -> None:
        service = _make_service()
        result = await service.ingest(_make_input(content="   \n\t   "))
        assert result.ok is False
        assert result.error is not None

    async def test_empty_content_does_not_create_document(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)
        await service.ingest(_make_input(content=""))
        assert len(doc_repo._store) == 0


class TestChunkPreservation:
    """Testes 8–9: chunks preservam document_id, chunk_index e source_title."""

    async def test_chunks_preserve_document_id_and_index(self) -> None:
        chunk_repo = FakeChunkRepository()
        service = _make_service(chunk_repo=chunk_repo)

        result = await service.ingest(_make_input())
        doc_id = result.document_id
        chunks = await chunk_repo.get_chunks_by_document(doc_id)

        assert len(chunks) > 0
        for i, c in enumerate(chunks):
            assert c.document_id == doc_id
            assert c.chunk_index == i

    async def test_chunks_preserve_source_title(self) -> None:
        chunk_repo = FakeChunkRepository()
        service = _make_service(chunk_repo=chunk_repo)
        title = "Título Fictício para Teste de Chunks"

        result = await service.ingest(_make_input(title=title))
        chunks = await chunk_repo.get_chunks_by_document(result.document_id)

        assert all(c.source_title == title for c in chunks)


class TestMetadataPreservation:
    """Teste 10: metadata do documento é preservada."""

    async def test_document_metadata_preserved(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)
        meta = {"version": "2024-Q1", "author": "RH Fictício", "tags": ["fake"]}

        result = await service.ingest(_make_input(metadata=meta))
        doc = doc_repo._store[result.document_id]

        assert doc.metadata["version"] == "2024-Q1"
        assert doc.metadata["author"] == "RH Fictício"
        assert doc.metadata["tags"] == ["fake"]

    async def test_source_uri_stored_in_metadata(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        result = await service.ingest(
            _make_input(source_uri="internal://fake/doc/001")
        )
        doc = doc_repo._store[result.document_id]

        assert doc.metadata.get("source_uri") == "internal://fake/doc/001"

    async def test_created_by_stored_in_metadata(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        result = await service.ingest(
            _make_input(ingest_by_user_id="user-fake-001")
        )
        doc = doc_repo._store[result.document_id]

        assert doc.metadata.get("created_by") == "user-fake-001"


class TestReingest:
    """Teste 11: reingestão remove chunks antigos e cria novos."""

    async def test_reingest_removes_old_and_creates_new_chunks(self) -> None:
        doc_repo = FakeDocumentRepository()
        chunk_repo = FakeChunkRepository()
        service = _make_service(doc_repo=doc_repo, chunk_repo=chunk_repo)

        first_result = await service.ingest(_make_input())
        doc_id = first_result.document_id
        chunks_before = await chunk_repo.get_chunks_by_document(doc_id)
        assert len(chunks_before) > 0

        reingest_result = await service.reingest_by_document_id(doc_id)

        assert reingest_result.ok is True
        assert reingest_result.document_id == doc_id
        chunks_after = await chunk_repo.get_chunks_by_document(doc_id)
        assert len(chunks_after) > 0
        assert doc_id in chunk_repo.delete_calls  # delete was called

    async def test_reingest_unknown_document_returns_error(self) -> None:
        service = _make_service()
        result = await service.reingest_by_document_id("non-existent-id")
        assert result.ok is False
        assert result.error == "document_not_found"

    async def test_reingest_preserves_document(self) -> None:
        doc_repo = FakeDocumentRepository()
        service = _make_service(doc_repo=doc_repo)

        first = await service.ingest(_make_input())
        doc_id = first.document_id

        await service.reingest_by_document_id(doc_id)

        assert doc_id in doc_repo._store  # document still exists


class TestContractUsage:
    """Teste 12: serviço usa repositories por contrato."""

    def test_service_doc_repo_is_contract_type(self) -> None:
        doc_repo: KnowledgeDocumentRepositoryContract = FakeDocumentRepository()
        chunk_repo: KnowledgeChunkRepositoryContract = FakeChunkRepository()
        service = TextIngestionService(doc_repo=doc_repo, chunk_repo=chunk_repo)

        assert isinstance(service._doc_repo, KnowledgeDocumentRepositoryContract)
        assert isinstance(service._chunk_repo, KnowledgeChunkRepositoryContract)

    def test_service_accepts_any_contract_implementation(self) -> None:
        """Aceita qualquer implementação do contrato, não classe concreta."""

        class AnotherFakeDocRepo(FakeDocumentRepository):
            pass

        service = TextIngestionService(
            doc_repo=AnotherFakeDocRepo(),
            chunk_repo=FakeChunkRepository(),
        )
        assert isinstance(service._doc_repo, KnowledgeDocumentRepositoryContract)


class TestNoExternalDependencies:
    """Teste 13: serviço não chama LLM, provider externo, embedding ou endpoint."""

    def test_ingestion_service_source_has_no_llm_imports(self) -> None:
        import src.ai_orchestration.rag.ingestion_service as module

        source = inspect.getsource(module)
        assert "anthropic" not in source
        assert "openai" not in source
        # Verifica que não há import de módulos de embedding reais
        import_lines = [
            line for line in source.splitlines()
            if line.strip().startswith(("import ", "from "))
            and "embed" in line.lower()
        ]
        assert len(import_lines) == 0, (
            f"Import de embedding inesperado: {import_lines}"
        )

    def test_ingestion_service_makes_no_http_calls(self) -> None:
        import src.ai_orchestration.rag.ingestion_service as module

        source = inspect.getsource(module)
        assert "httpx" not in source
        assert "requests" not in source
        assert "aiohttp" not in source


class TestRepositoryErrorHandling:
    """Teste 14: erro interno de repository vira resultado controlado."""

    async def test_repository_error_returns_controlled_result(self) -> None:
        service = _make_service(doc_repo=ErrorDocumentRepository())

        result = await service.ingest(_make_input())

        assert result.ok is False
        assert result.error is not None
        assert "repository_error" in result.error

    async def test_result_ok_false_does_not_raise(self) -> None:
        service = _make_service(doc_repo=ErrorDocumentRepository())

        # Should not raise — error is captured in result
        result = await service.ingest(_make_input())
        assert isinstance(result.ok, bool)


class TestFakeContent:
    """Teste 15: todos os testes usam conteúdo fictício."""

    def test_fake_content_is_not_real_personal_data(self) -> None:
        """Verifica que o conteúdo de teste não contém dados sensíveis reais."""
        assert "CPF" not in FAKE_CONTENT
        assert "salário" not in FAKE_CONTENT.lower()
        assert "senha" not in FAKE_CONTENT.lower()
        assert "@" not in FAKE_CONTENT  # nenhum e-mail real

    async def test_ingest_uses_only_fake_content(self) -> None:
        service = _make_service()
        result = await service.ingest(_make_input(content="Texto fictício de teste."))
        assert result.ok is True
        assert result.document_id is not None
