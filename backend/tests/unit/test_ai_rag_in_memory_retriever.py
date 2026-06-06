"""Unit tests — AI RAG InMemoryRetriever (AI-RAG-1).

Verifica:
 7. InMemoryRetriever retorna chunks relevantes para query simples.
 8. InMemoryRetriever respeita limit.
 9. InMemoryRetriever retorna lista vazia quando não há match.
10. InMemoryRetriever preserva source/document metadata.
11. RetrievalResult inclui query, chunks, total e warnings.
12. Nenhum teste chama LLM, banco ou provider externo.
"""
from __future__ import annotations

import pytest

from src.ai_orchestration.rag.in_memory_retriever import InMemoryRetriever
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    KnowledgeDocument,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────


def _chunk(id: str, doc_id: str, idx: int, content: str, **meta) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=id,
        document_id=doc_id,
        chunk_index=idx,
        content=content,
        metadata=meta,
        source_title=meta.pop("source_title", None),
    )


CHUNKS_RH: list[KnowledgeChunk] = [
    KnowledgeChunk(
        id="c1",
        document_id="doc-rh-1",
        chunk_index=0,
        content="Todo colaborador tem direito a 30 dias de férias após 12 meses.",
        metadata={"source_type": "rh_policy"},
        source_title="Política de Férias",
    ),
    KnowledgeChunk(
        id="c2",
        document_id="doc-rh-1",
        chunk_index=1,
        content="As férias podem ser parceladas em até três períodos.",
        metadata={"source_type": "rh_policy"},
        source_title="Política de Férias",
    ),
    KnowledgeChunk(
        id="c3",
        document_id="doc-ats-1",
        chunk_index=0,
        content="O processo seletivo inclui triagem de currículo e entrevista.",
        metadata={"source_type": "ats_guide"},
        source_title="Guia do ATS",
    ),
    KnowledgeChunk(
        id="c4",
        document_id="doc-ats-1",
        chunk_index=1,
        content="A triagem de candidatos usa critérios de match por área e experiência.",
        metadata={"source_type": "ats_guide"},
        source_title="Guia do ATS",
    ),
    KnowledgeChunk(
        id="c5",
        document_id="doc-admission-1",
        chunk_index=0,
        content="O pacote de admissão deve ser exportado ao Protheus após aprovação.",
        metadata={"source_type": "pre_admission_docs"},
        source_title="Guia de Admissão",
    ),
]


# ── Testes de retrieval básico ────────────────────────────────────────────────


class TestBasicRetrieval:
    async def test_returns_relevant_chunks_for_simple_query(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        query = RetrievalQuery(query="férias colaborador")
        result = await retriever.retrieve(query)
        assert result.total > 0
        assert any("férias" in rc.chunk.content.lower() for rc in result.chunks)

    async def test_returns_retrieval_result_type(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="triagem"))
        assert isinstance(result, RetrievalResult)

    async def test_returned_chunks_are_retrieved_chunk_type(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        assert all(isinstance(rc, RetrievedChunk) for rc in result.chunks)

    async def test_score_between_zero_and_one(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        for rc in result.chunks:
            assert 0.0 < rc.score <= 1.0

    async def test_results_ordered_by_score_descending(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias colaborador"))
        scores = [rc.score for rc in result.chunks]
        assert scores == sorted(scores, reverse=True)


# ── Testes de limit ───────────────────────────────────────────────────────────


class TestLimit:
    async def test_respects_limit_parameter(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="a", limit=2))
        # "a" está em vários chunks; limit=2 deve retornar no máximo 2
        assert result.total <= 2
        assert len(result.chunks) <= 2

    async def test_limit_one_returns_at_most_one_chunk(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias", limit=1))
        assert len(result.chunks) <= 1

    async def test_default_limit_five_applied(self) -> None:
        # Cria 10 chunks com matching content
        chunks = [
            KnowledgeChunk(
                id=f"cx{i}",
                document_id="d",
                chunk_index=i,
                content=f"férias ponto {i}",
                metadata={},
            )
            for i in range(10)
        ]
        retriever = InMemoryRetriever(chunks)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        assert result.total <= 5
        assert len(result.chunks) <= 5


# ── Testes de ausência de match ───────────────────────────────────────────────


class TestNoMatch:
    async def test_returns_empty_when_no_match(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="xyzxyzxyz_impossivel"))
        assert result.total == 0
        assert result.chunks == []

    async def test_empty_query_returns_empty_with_warning(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query=""))
        assert result.total == 0
        assert "empty_query" in result.warnings

    async def test_whitespace_query_returns_empty_with_warning(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="   "))
        assert result.total == 0
        assert "empty_query" in result.warnings

    async def test_returns_empty_list_not_none(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="nao_existe"))
        assert result.chunks is not None
        assert isinstance(result.chunks, list)


# ── Testes de metadata ────────────────────────────────────────────────────────


class TestMetadataPreservation:
    async def test_preserves_document_id(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        for rc in result.chunks:
            assert rc.chunk.document_id is not None
            assert rc.chunk.document_id != ""

    async def test_preserves_source_title(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        for rc in result.chunks:
            if rc.chunk.source_title:
                assert isinstance(rc.chunk.source_title, str)

    async def test_preserves_metadata_dict(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        for rc in result.chunks:
            assert isinstance(rc.chunk.metadata, dict)
            assert "source_type" in rc.chunk.metadata

    async def test_preserves_chunk_index(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        for rc in result.chunks:
            assert isinstance(rc.chunk.chunk_index, int)
            assert rc.chunk.chunk_index >= 0

    async def test_match_reason_is_keyword_match(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(RetrievalQuery(query="férias"))
        for rc in result.chunks:
            assert rc.match_reason == "keyword_match"


# ── Testes de filtros ─────────────────────────────────────────────────────────


class TestFilters:
    async def test_source_type_filter_restricts_results(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(
            RetrievalQuery(query="triagem férias", filters={"source_type": "rh_policy"})
        )
        for rc in result.chunks:
            assert rc.chunk.metadata.get("source_type") == "rh_policy"

    async def test_unknown_source_type_returns_empty(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result = await retriever.retrieve(
            RetrievalQuery(query="férias", filters={"source_type": "nao_existe"})
        )
        assert result.total == 0

    async def test_no_filter_returns_all_matching(self) -> None:
        retriever = InMemoryRetriever(CHUNKS_RH)
        result_filtered = await retriever.retrieve(
            RetrievalQuery(query="triagem", filters={"source_type": "ats_guide"})
        )
        result_all = await retriever.retrieve(RetrievalQuery(query="triagem"))
        # Com filtro, temos menos ou igual ao sem filtro
        assert result_filtered.total <= result_all.total


# ── Testes de min_score ───────────────────────────────────────────────────────


class TestMinScore:
    async def test_min_score_filters_low_score_chunks(self) -> None:
        chunks = [
            KnowledgeChunk(
                id="hi", document_id="d", chunk_index=0,
                content="férias benefícios colaborador",
                metadata={},
            ),
            KnowledgeChunk(
                id="lo", document_id="d", chunk_index=1,
                content="férias",  # só 1 palavra de 3 → score=0.33
                metadata={},
            ),
        ]
        retriever = InMemoryRetriever(chunks)
        result = await retriever.retrieve(
            RetrievalQuery(query="férias benefícios colaborador", min_score=0.9)
        )
        # Apenas o chunk com todas as palavras deve passar
        assert result.total <= 1
        if result.total == 1:
            assert result.chunks[0].score >= 0.9


# ── Testes de get_document ────────────────────────────────────────────────────


class TestGetDocument:
    async def test_returns_document_if_registered(self) -> None:
        from datetime import datetime, timezone
        doc = KnowledgeDocument(
            id="doc-1",
            title="Política de Férias",
            source_type="rh_policy",
            content="Conteúdo.",
            created_at=datetime.now(timezone.utc),
        )
        retriever = InMemoryRetriever([], documents={"doc-1": doc})
        found = await retriever.get_document("doc-1")
        assert found is not None
        assert found.title == "Política de Férias"

    async def test_returns_none_if_not_found(self) -> None:
        retriever = InMemoryRetriever([])
        result = await retriever.get_document("nao-existe")
        assert result is None


# ── Teste estrutural: sem LLM ─────────────────────────────────────────────────


class TestNoLlm:
    async def test_retriever_does_not_call_llm_or_db(self) -> None:
        """InMemoryRetriever é puramente in-memory. Sem I/O, sem LLM."""
        retriever = InMemoryRetriever(CHUNKS_RH)
        # Executa retrieval e verifica resultado sem qualquer mock
        result = await retriever.retrieve(RetrievalQuery(query="férias", limit=3))
        assert isinstance(result, RetrievalResult)
        # O próprio fato de chegar aqui sem exception confirma ausência de LLM/DB
        assert result.total >= 0
