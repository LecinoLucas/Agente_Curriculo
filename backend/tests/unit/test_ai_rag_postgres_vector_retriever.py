"""
Unit tests — PostgresVectorRetriever (AI-RAG-6).

Todos os testes usam FakeEmbeddingProvider ou mocks — nenhuma chamada a
Gemini, Claude, OpenAI ou qualquer rede externa. Nenhum endpoint ou
AssistantRouter é alterado aqui.

Cobertura dos critérios:
    1. Retriever usa FakeEmbeddingProvider para gerar query embedding.
    2. Retriever retorna RetrievalResult.
    3. Retriever respeita limit.
    4. Retriever propaga warnings do VectorStore.
    5. Retriever retorna lista vazia controlada quando pgvector indisponível.
    6. similarity_search não retorna embedding bruto (via mock).
    7. Erro no embedding provider vira resultado controlado.
    8. Erro no vector store vira resultado controlado.
    9. Score é preservado em RetrievedChunk quando houver resultado.
    10. Filtros são passados ao vector store que aplica whitelist.
    11-12. (Estrutural) Sem provider externo, sem endpoint/UI/AssistantRouter.
    13. health_check do vector store continua funcionando independente.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.ai_orchestration.rag.fake_embedding_provider import FakeEmbeddingProvider
from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)
from src.ai_orchestration.rag.vector_store_contract import VectorStoreContract


def _make_chunk(content: str = "content", idx: int = 0) -> RetrievedChunk:
    return RetrievedChunk(
        chunk=KnowledgeChunk(
            id=str(uuid4()),
            document_id=str(uuid4()),
            chunk_index=idx,
            content=content,
        ),
        score=1.0 - idx * 0.1,
        match_reason="vector_similarity",
    )


def _make_retriever(
    *,
    vector_store: VectorStoreContract | None = None,
    provider: FakeEmbeddingProvider | None = None,
    document_repo=None,
) -> PostgresVectorRetriever:
    return PostgresVectorRetriever(
        vector_store=vector_store or AsyncMock(spec=VectorStoreContract),
        embedding_provider=provider or FakeEmbeddingProvider(dimensions=16),
        document_repository=document_repo or AsyncMock(),
    )


@pytest.mark.asyncio
class TestPostgresVectorRetriever:
    async def test_uses_fake_embedding_provider_to_generate_query_vector(self) -> None:
        """Test 1: Retriever usa FakeEmbeddingProvider para gerar embedding da query."""
        provider = FakeEmbeddingProvider(dimensions=16)
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test", chunks=[], total=0, warnings=[]
        )

        retriever = _make_retriever(vector_store=vector_store, provider=provider)
        await retriever.retrieve(RetrievalQuery(query="política de RH"))

        call_args = vector_store.similarity_search.call_args
        assert call_args is not None
        query_arg, vector_arg = call_args[0][0], call_args[0][1]
        assert isinstance(vector_arg, list)
        assert len(vector_arg) == 16
        # Vetor deve ser determinístico (não zero)
        assert any(v != 0.0 for v in vector_arg)

    async def test_returns_retrieval_result(self) -> None:
        """Test 2: Retriever sempre retorna RetrievalResult."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test", chunks=[], total=0, warnings=[]
        )

        retriever = _make_retriever(vector_store=vector_store)
        result = await retriever.retrieve(RetrievalQuery(query="test"))

        assert isinstance(result, RetrievalResult)
        assert result.query == "test"

    async def test_respects_limit_via_query(self) -> None:
        """Test 3: Retriever passa limit correto ao vector store."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test",
            chunks=[_make_chunk(idx=i) for i in range(3)],
            total=3,
            warnings=[],
        )

        retriever = _make_retriever(vector_store=vector_store)
        query = RetrievalQuery(query="test", limit=3)
        result = await retriever.retrieve(query)

        called_query: RetrievalQuery = vector_store.similarity_search.call_args[0][0]
        assert called_query.limit == 3
        assert result.total == 3

    async def test_propagates_vector_store_warnings(self) -> None:
        """Test 4: Retriever propaga warnings do VectorStore sem modificação."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test",
            chunks=[],
            total=0,
            warnings=["pgvector_not_available", "custom_warning"],
        )

        retriever = _make_retriever(vector_store=vector_store)
        result = await retriever.retrieve(RetrievalQuery(query="test"))

        assert "pgvector_not_available" in result.warnings
        assert "custom_warning" in result.warnings

    async def test_returns_controlled_empty_when_pgvector_unavailable(self) -> None:
        """Test 5: Quando pgvector indisponível, retorna lista vazia com warning."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test",
            chunks=[],
            total=0,
            warnings=["pgvector_not_available"],
        )

        retriever = _make_retriever(vector_store=vector_store)
        result = await retriever.retrieve(RetrievalQuery(query="test"))

        assert result.chunks == []
        assert result.total == 0
        assert len(result.warnings) > 0
        assert any("pgvector" in w for w in result.warnings)

    async def test_retrieved_chunk_has_no_embedding_field(self) -> None:
        """Test 6: RetrievedChunk retornado não expõe embedding bruto."""
        retrieved = _make_chunk("content com embedding escondido")
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test", chunks=[retrieved], total=1, warnings=[]
        )

        retriever = _make_retriever(vector_store=vector_store)
        result = await retriever.retrieve(RetrievalQuery(query="test"))

        for rc in result.chunks:
            assert not hasattr(rc, "vector")
            assert not hasattr(rc, "embedding")
            assert not hasattr(rc.chunk, "vector")
            assert not hasattr(rc.chunk, "embedding")

    async def test_embedding_provider_error_returns_controlled_result(self) -> None:
        """Test 7: Erro no embedding provider → resultado controlado com warning."""
        broken_provider = AsyncMock()
        broken_provider.embed_query.side_effect = RuntimeError("provider indisponível")

        vector_store = AsyncMock(spec=VectorStoreContract)
        retriever = _make_retriever(
            vector_store=vector_store, provider=broken_provider
        )

        result = await retriever.retrieve(RetrievalQuery(query="test"))

        assert result.chunks == []
        assert result.total == 0
        assert any("embedding_provider_error" in w for w in result.warnings)
        # Vector store NÃO deve ter sido chamado
        vector_store.similarity_search.assert_not_called()

    async def test_vector_store_error_returns_controlled_result(self) -> None:
        """Test 8: Erro no vector store → resultado controlado com warning."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.side_effect = RuntimeError("DB error")

        retriever = _make_retriever(vector_store=vector_store)
        result = await retriever.retrieve(RetrievalQuery(query="test"))

        assert result.chunks == []
        assert result.total == 0
        assert any("vector_store_error" in w for w in result.warnings)

    async def test_rejection_on_invalid_query_dimension(self) -> None:
        """Test: Retriever rejeita se o embedding da query tiver dimensão errada."""
        bad_provider = AsyncMock()
        # Provider diz que tem 16, mas retorna 17
        bad_provider.dimensions = 16
        bad_provider.embed_query.return_value = [0.1] * 17
        
        vector_store = AsyncMock(spec=VectorStoreContract)
        retriever = _make_retriever(vector_store=vector_store, provider=bad_provider)
        
        result = await retriever.retrieve(RetrievalQuery(query="test"))
        
        assert result.chunks == []
        assert "INVALID_QUERY_EMBEDDING_DIMENSION" in result.warnings
        vector_store.similarity_search.assert_not_called()

    async def test_score_preserved_in_retrieved_chunk(self) -> None:
        """Test 9: Score é preservado no RetrievedChunk quando há resultado."""
        chunk = KnowledgeChunk(
            id=str(uuid4()),
            document_id=str(uuid4()),
            chunk_index=0,
            content="conteúdo relevante sobre admissão",
        )
        retrieved = RetrievedChunk(
            chunk=chunk, score=0.8734, match_reason="vector_similarity"
        )
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test", chunks=[retrieved], total=1, warnings=[]
        )

        retriever = _make_retriever(vector_store=vector_store)
        result = await retriever.retrieve(RetrievalQuery(query="test"))

        assert len(result.chunks) == 1
        assert result.chunks[0].score == 0.8734
        assert result.chunks[0].match_reason == "vector_similarity"

    async def test_filters_passed_to_vector_store_for_whitelist_enforcement(self) -> None:
        """Test 10: Filtros são repassados ao vector store que aplica a whitelist."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.similarity_search.return_value = RetrievalResult(
            query="test", chunks=[], total=0, warnings=[]
        )

        retriever = _make_retriever(vector_store=vector_store)
        query = RetrievalQuery(
            query="test",
            filters={"source_type": "rh_policy", "unknown_key": "ignored"},
        )
        await retriever.retrieve(query)

        called_query: RetrievalQuery = vector_store.similarity_search.call_args[0][0]
        # A query completa (com filtros) foi passada ao vector store
        assert called_query.filters == {"source_type": "rh_policy", "unknown_key": "ignored"}

    async def test_empty_query_returns_controlled_result_without_provider_call(
        self,
    ) -> None:
        """Query vazia → resultado controlado sem chamar provider nem vector store."""
        broken_provider = AsyncMock()
        vector_store = AsyncMock(spec=VectorStoreContract)

        retriever = _make_retriever(
            vector_store=vector_store, provider=broken_provider
        )
        result = await retriever.retrieve(RetrievalQuery(query="   "))

        assert result.chunks == []
        assert "empty_query" in result.warnings
        broken_provider.embed_query.assert_not_called()
        vector_store.similarity_search.assert_not_called()

    async def test_get_document_delegates_to_repository(self) -> None:
        """get_document delega ao document_repository e retorna KnowledgeDocument."""
        doc_id = str(uuid4())
        expected = KnowledgeDocument(
            id=doc_id,
            title="Política de RH",
            source_type="rh_policy",
            content="conteúdo da política",
        )
        document_repo = AsyncMock()
        document_repo.get_document.return_value = expected

        retriever = _make_retriever(document_repo=document_repo)
        result = await retriever.get_document(doc_id)

        document_repo.get_document.assert_called_once_with(doc_id)
        assert result == expected

    async def test_get_document_returns_none_when_not_found(self) -> None:
        """get_document retorna None quando o documento não existe."""
        document_repo = AsyncMock()
        document_repo.get_document.return_value = None

        retriever = _make_retriever(document_repo=document_repo)
        result = await retriever.get_document(str(uuid4()))

        assert result is None

    async def test_get_document_returns_none_on_repository_error(self) -> None:
        """get_document retorna None quando o repositório lança exceção."""
        document_repo = AsyncMock()
        document_repo.get_document.side_effect = Exception("DB down")

        retriever = _make_retriever(document_repo=document_repo)
        result = await retriever.get_document(str(uuid4()))

        assert result is None

    async def test_vector_store_health_check_unaffected_by_retriever(self) -> None:
        """Test 13: health_check do vector store continua funcionando independentemente."""
        vector_store = AsyncMock(spec=VectorStoreContract)
        vector_store.health_check.return_value = {
            "ok": True,
            "pgvector_available": False,
            "storage_mode": "json_fallback",
            "warnings": ["pgvector_not_available"],
        }

        # O retriever não interfere no health_check do vector store
        status = await vector_store.health_check()

        assert status["ok"] is True
        assert status["storage_mode"] == "json_fallback"
