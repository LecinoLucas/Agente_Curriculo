"""Unit tests — AI RAG Schemas e Contratos (AI-RAG-1).

Verifica:
 1. KnowledgeDocument aceita metadata.
 2. KnowledgeChunk mantém document_id e chunk_index.
 3. RetrievalQuery tem campos query, filters, limit e min_score.
 4. RetrievedChunk encapsula chunk e score.
 5. RetrievalResult inclui query, chunks, total e warnings.
 6. RagSource e RagAnswer (legado) continuam funcionando.
12. Nenhum teste chama LLM, banco ou provider externo.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    KnowledgeDocument,
    RagAnswer,
    RagSource,
    RetrievalQuery,
    RetrievalResult,
    RetrievedChunk,
)


# ── KnowledgeDocument ─────────────────────────────────────────────────────────


class TestKnowledgeDocument:
    def test_creates_with_required_fields(self) -> None:
        doc = KnowledgeDocument(
            id="doc-1",
            title="Política de Férias",
            source_type="rh_policy",
            content="Todo colaborador tem direito a 30 dias de férias.",
        )
        assert doc.id == "doc-1"
        assert doc.title == "Política de Férias"
        assert doc.source_type == "rh_policy"
        assert "colaborador" in doc.content

    def test_accepts_metadata(self) -> None:
        meta = {"author": "RH", "version": "2024-Q1", "tags": ["férias", "CLT"]}
        doc = KnowledgeDocument(
            id="doc-2",
            title="Regras de Contratação",
            source_type="hiring_rules",
            content="Regras aqui.",
            metadata=meta,
        )
        assert doc.metadata["author"] == "RH"
        assert doc.metadata["version"] == "2024-Q1"
        assert "férias" in doc.metadata["tags"]

    def test_metadata_defaults_to_empty_dict(self) -> None:
        doc = KnowledgeDocument(id="d", title="T", source_type="ats_guide", content="C")
        assert doc.metadata == {}

    def test_created_at_is_optional(self) -> None:
        doc = KnowledgeDocument(id="d", title="T", source_type="ats_guide", content="C")
        assert doc.created_at is None

    def test_accepts_created_at(self) -> None:
        now = datetime.now(timezone.utc)
        doc = KnowledgeDocument(
            id="d", title="T", source_type="ats_guide", content="C", created_at=now
        )
        assert doc.created_at == now

    def test_is_frozen(self) -> None:
        doc = KnowledgeDocument(id="d", title="T", source_type="ats_guide", content="C")
        with pytest.raises((AttributeError, TypeError)):
            doc.title = "Altered"  # type: ignore[misc]


# ── KnowledgeChunk ────────────────────────────────────────────────────────────


class TestKnowledgeChunk:
    def test_maintains_document_id(self) -> None:
        chunk = KnowledgeChunk(
            id="chunk-1",
            document_id="doc-1",
            chunk_index=0,
            content="Trecho do documento.",
        )
        assert chunk.document_id == "doc-1"

    def test_maintains_chunk_index(self) -> None:
        chunk = KnowledgeChunk(
            id="chunk-2",
            document_id="doc-1",
            chunk_index=3,
            content="Trecho na posição 3.",
        )
        assert chunk.chunk_index == 3

    def test_accepts_metadata(self) -> None:
        meta = {"source_type": "rh_policy", "section": "Benefícios"}
        chunk = KnowledgeChunk(
            id="c",
            document_id="doc-1",
            chunk_index=0,
            content="Conteúdo.",
            metadata=meta,
        )
        assert chunk.metadata["source_type"] == "rh_policy"
        assert chunk.metadata["section"] == "Benefícios"

    def test_metadata_defaults_to_empty_dict(self) -> None:
        chunk = KnowledgeChunk(id="c", document_id="d", chunk_index=0, content="C")
        assert chunk.metadata == {}

    def test_source_title_is_optional(self) -> None:
        chunk = KnowledgeChunk(id="c", document_id="d", chunk_index=0, content="C")
        assert chunk.source_title is None

    def test_accepts_source_title(self) -> None:
        chunk = KnowledgeChunk(
            id="c", document_id="d", chunk_index=0, content="C",
            source_title="Guia do ATS",
        )
        assert chunk.source_title == "Guia do ATS"

    def test_is_frozen(self) -> None:
        chunk = KnowledgeChunk(id="c", document_id="d", chunk_index=0, content="C")
        with pytest.raises((AttributeError, TypeError)):
            chunk.content = "Modified"  # type: ignore[misc]


# ── RetrievalQuery ────────────────────────────────────────────────────────────


class TestRetrievalQuery:
    def test_has_query_field(self) -> None:
        q = RetrievalQuery(query="política de férias")
        assert q.query == "política de férias"

    def test_filters_default_to_none(self) -> None:
        q = RetrievalQuery(query="férias")
        assert q.filters is None

    def test_accepts_filters(self) -> None:
        q = RetrievalQuery(query="férias", filters={"source_type": "rh_policy"})
        assert q.filters is not None
        assert q.filters["source_type"] == "rh_policy"

    def test_limit_default_is_5(self) -> None:
        q = RetrievalQuery(query="férias")
        assert q.limit == 5

    def test_min_score_default_is_zero(self) -> None:
        q = RetrievalQuery(query="férias")
        assert q.min_score == 0.0

    def test_accepts_custom_limit_and_min_score(self) -> None:
        q = RetrievalQuery(query="vaga", limit=10, min_score=0.5)
        assert q.limit == 10
        assert q.min_score == 0.5

    def test_is_frozen(self) -> None:
        q = RetrievalQuery(query="test")
        with pytest.raises((AttributeError, TypeError)):
            q.query = "changed"  # type: ignore[misc]


# ── RetrievedChunk ────────────────────────────────────────────────────────────


class TestRetrievedChunk:
    def _chunk(self) -> KnowledgeChunk:
        return KnowledgeChunk(id="c", document_id="d", chunk_index=0, content="texto")

    def test_wraps_chunk_and_score(self) -> None:
        rc = RetrievedChunk(chunk=self._chunk(), score=0.85)
        assert rc.chunk.content == "texto"
        assert rc.score == 0.85

    def test_match_reason_is_optional(self) -> None:
        rc = RetrievedChunk(chunk=self._chunk(), score=0.5)
        assert rc.match_reason is None

    def test_accepts_match_reason(self) -> None:
        rc = RetrievedChunk(chunk=self._chunk(), score=0.7, match_reason="keyword_match")
        assert rc.match_reason == "keyword_match"

    def test_is_frozen(self) -> None:
        rc = RetrievedChunk(chunk=self._chunk(), score=0.5)
        with pytest.raises((AttributeError, TypeError)):
            rc.score = 0.9  # type: ignore[misc]


# ── RetrievalResult ───────────────────────────────────────────────────────────


class TestRetrievalResult:
    def test_includes_query(self) -> None:
        result = RetrievalResult(query="política de férias")
        assert result.query == "política de férias"

    def test_chunks_default_to_empty(self) -> None:
        result = RetrievalResult(query="q")
        assert result.chunks == []

    def test_total_defaults_to_zero(self) -> None:
        result = RetrievalResult(query="q")
        assert result.total == 0

    def test_warnings_default_to_empty(self) -> None:
        result = RetrievalResult(query="q")
        assert result.warnings == []

    def test_accepts_chunks_and_total(self) -> None:
        chunk = KnowledgeChunk(id="c", document_id="d", chunk_index=0, content="C")
        rc = RetrievedChunk(chunk=chunk, score=0.9)
        result = RetrievalResult(query="q", chunks=[rc], total=1)
        assert len(result.chunks) == 1
        assert result.total == 1

    def test_accepts_warnings(self) -> None:
        result = RetrievalResult(query="q", warnings=["low_coverage"])
        assert "low_coverage" in result.warnings


# ── RagSource / RagAnswer (legado — backward compat) ──────────────────────────


class TestLegacyRagSchemas:
    def test_rag_source_validates_score_range(self) -> None:
        with pytest.raises(ValueError):
            RagSource(
                document_id="d", title="T", chunk_id="c",
                source_type="rh_policy", score=1.5,
            )

    def test_rag_answer_computes_confidence_from_sources(self) -> None:
        s1 = RagSource(document_id="d1", title="T", chunk_id="c1", source_type="rh_policy", score=0.8)
        s2 = RagSource(document_id="d2", title="T", chunk_id="c2", source_type="rh_policy", score=0.6)
        ans = RagAnswer(answer="Resposta", sources=[s1, s2])
        assert ans.confidence == pytest.approx(0.7, abs=0.001)

    def test_rag_answer_adds_low_confidence_warning(self) -> None:
        s = RagSource(document_id="d", title="T", chunk_id="c", source_type="rh_policy", score=0.4)
        ans = RagAnswer(answer="X", sources=[s])
        assert "low_confidence" in ans.warnings
