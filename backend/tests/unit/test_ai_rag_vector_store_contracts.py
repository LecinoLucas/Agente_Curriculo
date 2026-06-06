"""Unit tests — AI RAG Vector Store e Embedding Contracts (AI-RAG-1b).

Verifica contratos abstratos de vector store, embedding provider e ingestion pipeline
sem qualquer acesso a banco de dados, LLM, embeddings reais ou provider externo.

Cobertura:
 1. VectorStoreContract pode ser implementado por classe fake.
 2. EmbeddingProviderContract pode ser implementado por classe fake.
 3. IngestionPipelineContract pode ser implementado por classe fake.
 4. EmbeddingVector aceita todos os campos esperados.
 5. VectorSearchOptions usa defaults corretos.
 6. EmbeddingBatch armazena vetores e metadados.
 7. Fake vector store retorna RetrievalResult de similarity_search.
 8. Fake vector store acumula embeddings em upsert_embeddings.
 9. Fake vector store deleta embeddings por document_id.
10. Fake embedding provider retorna batch com dimensões corretas.
11. Fake embedding provider retorna vetor de query com dimensões corretas.
12. Fake ingestion pipeline executa run e retorna IngestionPipelineResult.
13. Contratos não instanciam diretamente (ABC enforcement).
14. Nenhum teste acessa banco, LLM ou provider externo.
"""
from __future__ import annotations

import pytest

from src.ai_orchestration.rag.embedding_contract import (
    EmbeddingBatch,
    EmbeddingProviderContract,
)
from src.ai_orchestration.rag.ingestion_plan import (
    IngestionPipelineContract,
    IngestionPipelineInput,
    IngestionPipelineResult,
    ReIngestionResult,
)
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)
from src.ai_orchestration.rag.vector_store_contract import (
    EmbeddingVector,
    VectorSearchOptions,
    VectorStoreContract,
)


# ── Fake implementations ───────────────────────────────────────────────────────

_FAKE_DIMS = 4


class FakeVectorStore(VectorStoreContract):
    """Vector store em memória para testes de contrato."""

    def __init__(self) -> None:
        self._embeddings: dict[str, EmbeddingVector] = {}

    async def upsert_embeddings(self, embeddings: list[EmbeddingVector]) -> int:
        for emb in embeddings:
            self._embeddings[emb.chunk_id] = emb
        return len(embeddings)

    async def similarity_search(
        self,
        query: RetrievalQuery,
        query_vector: list[float],
        options: VectorSearchOptions | None = None,
    ) -> RetrievalResult:
        if not self._embeddings:
            return RetrievalResult(query=query.query, total=0)
        # dot product simples como proxy de similaridade (sem cosine real)
        def _dot(a: list[float], b: list[float]) -> float:
            return sum(x * y for x, y in zip(a, b))

        scored: list[tuple[float, EmbeddingVector]] = [
            (_dot(query_vector, emb.vector), emb)
            for emb in self._embeddings.values()
        ]
        scored.sort(key=lambda t: -t[0])
        scored = scored[: query.limit]

        chunks: list[RetrievedChunk] = []
        for score, emb in scored:
            if score < query.min_score:
                continue
            fake_chunk = KnowledgeChunk(
                id=emb.chunk_id,
                document_id=emb.document_id,
                chunk_index=0,
                content="[chunk content not stored in vector store]",
                metadata={},
            )
            chunks.append(RetrievedChunk(chunk=fake_chunk, score=score, match_reason="cosine"))

        return RetrievalResult(query=query.query, chunks=chunks, total=len(chunks))

    async def delete_embeddings_by_document(self, document_id: str) -> int:
        to_delete = [k for k, v in self._embeddings.items() if v.document_id == document_id]
        for k in to_delete:
            del self._embeddings[k]
        return len(to_delete)

    async def health_check(self) -> bool:
        return True

    async def count_embeddings(self, document_id: str | None = None) -> int:
        if document_id:
            return sum(1 for v in self._embeddings.values() if v.document_id == document_id)
        return len(self._embeddings)


class FakeEmbeddingProvider(EmbeddingProviderContract):
    """Provider de embeddings fake com vetores determinísticos."""

    @property
    def provider_name(self) -> str:
        return "fake"

    @property
    def model_name(self) -> str:
        return "fake-embedding-v1"

    @property
    def dimensions(self) -> int:
        return _FAKE_DIMS

    async def embed_texts(self, texts: list[str]) -> EmbeddingBatch:
        if not texts:
            raise ValueError("texts cannot be empty")
        vectors = [[1.0, 0.0, 0.0, float(i % 4)] for i, _ in enumerate(texts)]
        return EmbeddingBatch(
            texts=texts,
            vectors=vectors,
            model=self.model_name,
            provider=self.provider_name,
            dimensions=self.dimensions,
            total_tokens=sum(len(t.split()) for t in texts),
        )

    async def embed_query(self, text: str) -> list[float]:
        if not text:
            raise ValueError("text cannot be empty")
        return [1.0, 0.0, 0.0, 0.0]

    async def health_check(self) -> bool:
        return True


class FakeIngestionPipeline(IngestionPipelineContract):
    """Pipeline de ingestão fake para testes de contrato."""

    def __init__(self) -> None:
        self._docs: dict[str, IngestionPipelineInput] = {}

    async def run(self, pipeline_input: IngestionPipelineInput) -> IngestionPipelineResult:
        import hashlib
        content_hash = hashlib.sha256(pipeline_input.content.encode()).hexdigest()
        doc_id = f"doc-{content_hash[:8]}"
        self._docs[doc_id] = pipeline_input
        return IngestionPipelineResult(
            ok=True,
            document_id=doc_id,
            chunks_created=3,
            embeddings_created=3,
            content_hash=content_hash,
            was_duplicate=False,
        )

    async def re_embed_document(self, document_id: str) -> ReIngestionResult:
        if document_id not in self._docs:
            return ReIngestionResult(ok=False, document_id=document_id, error="not_found")
        return ReIngestionResult(
            ok=True,
            document_id=document_id,
            old_embeddings_deleted=3,
            new_embeddings_created=3,
        )

    async def delete_document(
        self, document_id: str, deleted_by: str | None = None
    ) -> bool:
        if document_id not in self._docs:
            return False
        del self._docs[document_id]
        return True


# ── EmbeddingVector ────────────────────────────────────────────────────────────


class TestEmbeddingVector:
    def test_creates_with_all_fields(self) -> None:
        emb = EmbeddingVector(
            chunk_id="chunk-1",
            document_id="doc-1",
            provider="openai",
            model="text-embedding-3-small",
            dimensions=1536,
            vector=[0.1] * 1536,
        )
        assert emb.chunk_id == "chunk-1"
        assert emb.provider == "openai"
        assert emb.dimensions == 1536
        assert len(emb.vector) == 1536

    def test_metadata_defaults_to_empty(self) -> None:
        emb = EmbeddingVector(
            chunk_id="c", document_id="d", provider="p", model="m",
            dimensions=4, vector=[0.0, 0.0, 0.0, 0.0],
        )
        assert emb.metadata == {}

    def test_accepts_metadata(self) -> None:
        emb = EmbeddingVector(
            chunk_id="c", document_id="d", provider="p", model="m",
            dimensions=4, vector=[0.0] * 4,
            metadata={"indexed_at": "2026-06-06"},
        )
        assert emb.metadata["indexed_at"] == "2026-06-06"


# ── VectorSearchOptions ────────────────────────────────────────────────────────


class TestVectorSearchOptions:
    def test_default_index_type_is_hnsw(self) -> None:
        opts = VectorSearchOptions()
        assert opts.index_type == "hnsw"

    def test_default_distance_metric_is_cosine(self) -> None:
        opts = VectorSearchOptions()
        assert opts.distance_metric == "cosine"

    def test_custom_options(self) -> None:
        opts = VectorSearchOptions(index_type="ivfflat", distance_metric="l2", probes=20)
        assert opts.index_type == "ivfflat"
        assert opts.distance_metric == "l2"
        assert opts.probes == 20


# ── ABC enforcement ────────────────────────────────────────────────────────────


class TestAbstractEnforcement:
    def test_vector_store_cannot_instantiate_directly(self) -> None:
        with pytest.raises(TypeError):
            VectorStoreContract()  # type: ignore[abstract]

    def test_embedding_provider_cannot_instantiate_directly(self) -> None:
        with pytest.raises(TypeError):
            EmbeddingProviderContract()  # type: ignore[abstract]

    def test_ingestion_pipeline_cannot_instantiate_directly(self) -> None:
        with pytest.raises(TypeError):
            IngestionPipelineContract()  # type: ignore[abstract]


# ── FakeVectorStore ────────────────────────────────────────────────────────────


class TestFakeVectorStore:
    def _emb(self, chunk_id: str, doc_id: str, v: list[float]) -> EmbeddingVector:
        return EmbeddingVector(
            chunk_id=chunk_id, document_id=doc_id,
            provider="fake", model="fake-v1", dimensions=_FAKE_DIMS, vector=v,
        )

    async def test_upsert_returns_count(self) -> None:
        store = FakeVectorStore()
        embs = [self._emb("c1", "d1", [1.0, 0.0, 0.0, 0.0])]
        count = await store.upsert_embeddings(embs)
        assert count == 1

    async def test_upsert_accumulates_embeddings(self) -> None:
        store = FakeVectorStore()
        await store.upsert_embeddings([self._emb("c1", "d1", [1.0, 0.0, 0.0, 0.0])])
        await store.upsert_embeddings([self._emb("c2", "d1", [0.0, 1.0, 0.0, 0.0])])
        count = await store.count_embeddings()
        assert count == 2

    async def test_similarity_search_returns_retrieval_result(self) -> None:
        store = FakeVectorStore()
        await store.upsert_embeddings([self._emb("c1", "d1", [1.0, 0.0, 0.0, 0.0])])
        result = await store.similarity_search(
            RetrievalQuery(query="test", limit=5),
            query_vector=[1.0, 0.0, 0.0, 0.0],
        )
        assert isinstance(result, RetrievalResult)
        assert result.total >= 0

    async def test_similarity_search_returns_empty_when_no_embeddings(self) -> None:
        store = FakeVectorStore()
        result = await store.similarity_search(
            RetrievalQuery(query="test"), query_vector=[1.0, 0.0, 0.0, 0.0]
        )
        assert result.total == 0
        assert result.chunks == []

    async def test_similarity_search_respects_limit(self) -> None:
        store = FakeVectorStore()
        for i in range(5):
            await store.upsert_embeddings([
                self._emb(f"c{i}", "d1", [1.0, 0.0, float(i), 0.0])
            ])
        result = await store.similarity_search(
            RetrievalQuery(query="test", limit=2),
            query_vector=[1.0, 0.0, 0.0, 0.0],
        )
        assert len(result.chunks) <= 2

    async def test_delete_embeddings_by_document_returns_count(self) -> None:
        store = FakeVectorStore()
        await store.upsert_embeddings([
            self._emb("c1", "d1", [1.0, 0.0, 0.0, 0.0]),
            self._emb("c2", "d1", [0.0, 1.0, 0.0, 0.0]),
        ])
        deleted = await store.delete_embeddings_by_document("d1")
        assert deleted == 2

    async def test_delete_embeddings_removes_from_store(self) -> None:
        store = FakeVectorStore()
        await store.upsert_embeddings([self._emb("c1", "d1", [1.0, 0.0, 0.0, 0.0])])
        await store.delete_embeddings_by_document("d1")
        count = await store.count_embeddings("d1")
        assert count == 0

    async def test_health_check_returns_true(self) -> None:
        store = FakeVectorStore()
        ok = await store.health_check()
        assert ok is True

    async def test_count_embeddings_by_document(self) -> None:
        store = FakeVectorStore()
        await store.upsert_embeddings([
            self._emb("c1", "d1", [1.0, 0.0, 0.0, 0.0]),
            self._emb("c2", "d2", [0.0, 1.0, 0.0, 0.0]),
        ])
        assert await store.count_embeddings("d1") == 1
        assert await store.count_embeddings("d2") == 1
        assert await store.count_embeddings() == 2


# ── FakeEmbeddingProvider ──────────────────────────────────────────────────────


class TestFakeEmbeddingProvider:
    async def test_embed_texts_returns_batch(self) -> None:
        provider = FakeEmbeddingProvider()
        batch = await provider.embed_texts(["texto um", "texto dois"])
        assert isinstance(batch, EmbeddingBatch)
        assert len(batch.vectors) == 2

    async def test_embed_texts_dimensions_match_provider(self) -> None:
        provider = FakeEmbeddingProvider()
        batch = await provider.embed_texts(["texto"])
        assert batch.dimensions == provider.dimensions
        assert all(len(v) == provider.dimensions for v in batch.vectors)

    async def test_embed_texts_preserves_order(self) -> None:
        provider = FakeEmbeddingProvider()
        texts = ["primeiro", "segundo", "terceiro"]
        batch = await provider.embed_texts(texts)
        assert batch.texts == texts
        assert len(batch.vectors) == len(texts)

    async def test_embed_texts_raises_on_empty_list(self) -> None:
        provider = FakeEmbeddingProvider()
        with pytest.raises(ValueError):
            await provider.embed_texts([])

    async def test_embed_query_returns_vector_with_correct_dims(self) -> None:
        provider = FakeEmbeddingProvider()
        vector = await provider.embed_query("query de teste")
        assert len(vector) == provider.dimensions

    async def test_embed_query_raises_on_empty_string(self) -> None:
        provider = FakeEmbeddingProvider()
        with pytest.raises(ValueError):
            await provider.embed_query("")

    async def test_health_check_returns_true(self) -> None:
        provider = FakeEmbeddingProvider()
        assert await provider.health_check() is True

    def test_provider_name_is_string(self) -> None:
        provider = FakeEmbeddingProvider()
        assert isinstance(provider.provider_name, str)
        assert provider.provider_name != ""

    def test_model_name_is_string(self) -> None:
        provider = FakeEmbeddingProvider()
        assert isinstance(provider.model_name, str)
        assert provider.model_name != ""

    def test_dimensions_is_positive_int(self) -> None:
        provider = FakeEmbeddingProvider()
        assert isinstance(provider.dimensions, int)
        assert provider.dimensions > 0


# ── FakeIngestionPipeline ──────────────────────────────────────────────────────


class TestFakeIngestionPipeline:
    def _input(self, content: str = "Conteúdo de teste.") -> IngestionPipelineInput:
        return IngestionPipelineInput(
            title="Política de Férias",
            content=content,
            source_type="rh_policy",
        )

    async def test_run_returns_ok(self) -> None:
        pipeline = FakeIngestionPipeline()
        result = await pipeline.run(self._input())
        assert result.ok is True

    async def test_run_returns_document_id(self) -> None:
        pipeline = FakeIngestionPipeline()
        result = await pipeline.run(self._input())
        assert result.document_id is not None
        assert result.document_id.startswith("doc-")

    async def test_run_returns_chunks_created(self) -> None:
        pipeline = FakeIngestionPipeline()
        result = await pipeline.run(self._input())
        assert result.chunks_created > 0

    async def test_run_returns_embeddings_created(self) -> None:
        pipeline = FakeIngestionPipeline()
        result = await pipeline.run(self._input())
        assert result.embeddings_created > 0

    async def test_run_returns_content_hash(self) -> None:
        pipeline = FakeIngestionPipeline()
        result = await pipeline.run(self._input("mesmo conteúdo"))
        result2 = await pipeline.run(self._input("mesmo conteúdo"))
        assert result.content_hash == result2.content_hash

    async def test_re_embed_document_returns_ok(self) -> None:
        pipeline = FakeIngestionPipeline()
        run_result = await pipeline.run(self._input())
        doc_id = run_result.document_id
        re_result = await pipeline.re_embed_document(doc_id)
        assert re_result.ok is True
        assert re_result.old_embeddings_deleted > 0
        assert re_result.new_embeddings_created > 0

    async def test_re_embed_nonexistent_returns_error(self) -> None:
        pipeline = FakeIngestionPipeline()
        result = await pipeline.re_embed_document("nao-existe")
        assert result.ok is False
        assert result.error == "not_found"

    async def test_delete_document_returns_true(self) -> None:
        pipeline = FakeIngestionPipeline()
        run_result = await pipeline.run(self._input())
        deleted = await pipeline.delete_document(run_result.document_id)
        assert deleted is True

    async def test_delete_nonexistent_returns_false(self) -> None:
        pipeline = FakeIngestionPipeline()
        deleted = await pipeline.delete_document("nao-existe")
        assert deleted is False
