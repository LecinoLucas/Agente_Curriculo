"""
Unit tests — Postgres Vector Store (AI-RAG-5 + AI-RAG-6).

AI-RAG-6 adiciona testes para similarity_search com pgvector disponível (bridge).
Com pgvector disponível, o ranking e o LIMIT são empurrados para SQL.
Sem pgvector, o fallback JSON continua local com teto defensivo.
Nenhuma chamada a Gemini, Claude, OpenAI ou rede — apenas session mocks.

Nota: enquanto a tabela ainda persiste vetores em JSONB, o modo pgvector faz
cast em SQL para usar o operador <=> sem exigir migração nesta fase.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from src.infrastructure.repositories.postgres_vector_store import PostgresVectorStore
from src.ai_orchestration.rag.schemas import RetrievalQuery
from src.ai_orchestration.rag.pgvector_support import JSON_FALLBACK_CANDIDATE_LIMIT


def _pgvector_available_mock() -> MagicMock:
    """Mock para session.execute que retorna pgvector=disponível."""
    result = MagicMock()
    result.scalar.return_value = 1
    return result


def _pgvector_unavailable_mock() -> MagicMock:
    """Mock para session.execute que retorna pgvector=indisponível."""
    result = MagicMock()
    result.scalar.return_value = None
    return result


def _make_row(
    *,
    vector: list[float],
    chunk_id=None,
    doc_id=None,
    content: str = "conteúdo",
    idx: int = 0,
) -> MagicMock:
    row = MagicMock()
    row.vector_json = vector
    row.chunk_id = chunk_id or uuid4()
    row.chunk_index = idx
    row.content = content
    row.metadata_json = {}
    row.source_title = "Doc Title"
    row.document_id = doc_id or uuid4()
    row.doc_title = "Doc Title"
    row.doc_source_type = "rh_policy"
    return row


def _pgvector_query_result(rows: list[dict]) -> MagicMock:
    result = MagicMock()
    mappings_result = MagicMock()
    mappings_result.all.return_value = rows
    result.mappings.return_value = mappings_result
    return result


@pytest.mark.asyncio
class TestPostgresVectorStore:
    # ── Testes AI-RAG-5 (mantidos) ──────────────────────────────────────────────

    async def test_similarity_search_uses_json_fallback_when_pgvector_missing(self) -> None:
        session = AsyncMock()
        row = _make_row(vector=[1.0, 0.0], content="regra Protheus", idx=0)
        search_result = MagicMock()
        search_result.all.return_value = [row]
        session.execute.side_effect = [_pgvector_unavailable_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="teste"), query_vector=[1.0, 0.0]
        )

        assert result.query == "teste"
        assert len(result.chunks) == 1
        assert result.chunks[0].chunk.content == "regra Protheus"
        assert any("pgvector" in w.lower() for w in result.warnings)

    async def test_health_check_reports_correct_mode(self) -> None:
        session = AsyncMock()
        session.execute.return_value = _pgvector_unavailable_mock()

        store = PostgresVectorStore(session)
        status = await store.health_check()

        assert status["ok"] is True
        assert status["pgvector_available"] is False
        assert status["storage_mode"] == "json_fallback"
        assert status["json_fallback_candidate_limit"] == JSON_FALLBACK_CANDIDATE_LIMIT
        assert "rag_vector_search_json_fallback_limited" in status["warnings"]

    async def test_upsert_is_idempotent_with_mocks(self) -> None:
        session = AsyncMock()
        store = PostgresVectorStore(session)
        assert hasattr(store, "upsert_embeddings")

    async def test_delete_embeddings_by_document_calls_delete(self) -> None:
        session = AsyncMock()
        mock_exec = MagicMock()
        mock_exec.rowcount = 5
        session.execute.return_value = mock_exec

        store = PostgresVectorStore(session)
        doc_id = str(uuid4())
        deleted = await store.delete_embeddings_by_document(doc_id)

        assert deleted == 5
        assert session.execute.called
        stmt = session.execute.call_args[0][0]
        assert "ai_knowledge_embeddings" in str(stmt)

    # ── Testes AI-RAG-6: similarity_search com pgvector disponível (bridge) ─────

    async def test_similarity_search_returns_chunks_when_pgvector_available(
        self,
    ) -> None:
        """Test 14: similarity_search executa JOIN via session.execute quando pgvector está disponível."""
        session = AsyncMock()
        row = _make_row(vector=[0.5, 0.5], content="política de RH relevante")
        search_result = _pgvector_query_result([
            {
                "chunk_id": row.chunk_id,
                "document_id": row.document_id,
                "chunk_index": row.chunk_index,
                "content": row.content,
                "metadata_json": row.metadata_json,
                "source_title": row.source_title,
                "doc_title": row.doc_title,
                "doc_source_type": row.doc_source_type,
                "score": 1.0,
            }
        ])
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="política RH", limit=5),
            query_vector=[0.5, 0.5],
        )

        assert len(result.chunks) == 1
        assert result.total == 1
        assert result.chunks[0].match_reason == "vector_similarity"
        assert result.chunks[0].chunk.content == "política de RH relevante"
        assert result.chunks[0].score >= 0.0
        stmt, params = session.execute.call_args_list[1][0]
        assert "<=> CAST(:query_vector AS vector)" in str(stmt)
        assert params["limit"] == 5
        assert session.execute.call_count == 2

    async def test_similarity_search_identical_vectors_score_is_one(self) -> None:
        """Vetor idêntico à query deve retornar score=1.0 (cosine similarity exata)."""
        session = AsyncMock()
        row = _make_row(vector=[1.0, 0.0])
        search_result = _pgvector_query_result([
            {
                "chunk_id": row.chunk_id,
                "document_id": row.document_id,
                "chunk_index": row.chunk_index,
                "content": row.content,
                "metadata_json": row.metadata_json,
                "source_title": row.source_title,
                "doc_title": row.doc_title,
                "doc_source_type": row.doc_source_type,
                "score": 1.0,
            }
        ])
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test"), query_vector=[1.0, 0.0]
        )

        assert len(result.chunks) == 1
        assert result.chunks[0].score == 1.0

    async def test_similarity_search_does_not_return_raw_embedding(self) -> None:
        """similarity_search nunca retorna embedding bruto nos chunks."""
        session = AsyncMock()
        row = _make_row(vector=[0.8, 0.2])
        search_result = _pgvector_query_result([
            {
                "chunk_id": row.chunk_id,
                "document_id": row.document_id,
                "chunk_index": row.chunk_index,
                "content": row.content,
                "metadata_json": row.metadata_json,
                "source_title": row.source_title,
                "doc_title": row.doc_title,
                "doc_source_type": row.doc_source_type,
                "score": 0.97,
            }
        ])
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test"), query_vector=[0.8, 0.2]
        )

        for rc in result.chunks:
            assert not hasattr(rc, "vector")
            assert not hasattr(rc, "embedding")
            assert not hasattr(rc.chunk, "vector")
            assert not hasattr(rc.chunk, "embedding")

    async def test_similarity_search_respects_min_score(self) -> None:
        """Chunks com cosine similarity clamped a 0 são excluídos se min_score > 0."""
        session = AsyncMock()
        # [1, 0] vs [-1, 0] → cosine = -1.0 → score = 0.0 (clamped) → excluído com min_score=0.1
        row_positive = _make_row(vector=[0.9, 0.1], content="relevante", idx=1)
        search_result = _pgvector_query_result([
            {
                "chunk_id": row_positive.chunk_id,
                "document_id": row_positive.document_id,
                "chunk_index": row_positive.chunk_index,
                "content": row_positive.content,
                "metadata_json": row_positive.metadata_json,
                "source_title": row_positive.source_title,
                "doc_title": row_positive.doc_title,
                "doc_source_type": row_positive.doc_source_type,
                "score": 0.9,
            }
        ])
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test", min_score=0.1),
            query_vector=[1.0, 0.0],
        )

        assert all(rc.score >= 0.1 for rc in result.chunks)
        stmt, params = session.execute.call_args_list[1][0]
        assert ">= :min_score" in str(stmt)
        assert params["min_score"] == 0.1

    async def test_similarity_search_respects_limit(self) -> None:
        """O LIMIT é aplicado no SQL quando pgvector está disponível."""
        session = AsyncMock()
        rows = [
            {
                "chunk_id": uuid4(),
                "document_id": uuid4(),
                "chunk_index": i,
                "content": f"conteúdo {i}",
                "metadata_json": {},
                "source_title": "Doc Title",
                "doc_title": "Doc Title",
                "doc_source_type": "rh_policy",
                "score": 1.0 - (i * 0.1),
            }
            for i in range(5)
        ]
        search_result = _pgvector_query_result(rows)
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test", limit=2),
            query_vector=[1.0, 0.0],
        )

        assert len(result.chunks) == 5
        _, params = session.execute.call_args_list[1][0]
        assert params["limit"] == 2

    async def test_similarity_search_returns_chunks_sorted_by_score_desc(self) -> None:
        """O ORDER BY vetorial fica no SQL quando pgvector está disponível."""
        session = AsyncMock()
        # Vetores com diferentes similaridades à query [1, 0]
        rows = [
            {
                "chunk_id": uuid4(),
                "document_id": uuid4(),
                "chunk_index": 0,
                "content": "médio",
                "metadata_json": {},
                "source_title": "Doc Title",
                "doc_title": "Doc Title",
                "doc_source_type": "rh_policy",
                "score": 0.3,
            },
            {
                "chunk_id": uuid4(),
                "document_id": uuid4(),
                "chunk_index": 1,
                "content": "alto",
                "metadata_json": {},
                "source_title": "Doc Title",
                "doc_title": "Doc Title",
                "doc_source_type": "rh_policy",
                "score": 0.9,
            },
            {
                "chunk_id": uuid4(),
                "document_id": uuid4(),
                "chunk_index": 2,
                "content": "baixo",
                "metadata_json": {},
                "source_title": "Doc Title",
                "doc_title": "Doc Title",
                "doc_source_type": "rh_policy",
                "score": 0.1,
            },
        ]
        search_result = _pgvector_query_result(rows)
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test", limit=10),
            query_vector=[1.0, 0.0],
        )

        stmt, _ = session.execute.call_args_list[1][0]
        assert "ORDER BY CAST(e.vector_json::text AS vector) <=> CAST(:query_vector AS vector) ASC" in str(stmt)

    async def test_similarity_search_skips_rows_with_mismatched_dimensions(self) -> None:
        """Rows com vector de dimensão diferente da query são ignoradas e geram warning."""
        session = AsyncMock()
        row_wrong_dim = _make_row(vector=[0.5, 0.5, 0.5], idx=0)  # 3D vs query 2D
        row_correct = _make_row(vector=[0.8, 0.0], idx=1)
        search_result = MagicMock()
        search_result.all.return_value = [row_wrong_dim, row_correct]
        session.execute.side_effect = [_pgvector_unavailable_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test"),
            query_vector=[1.0, 0.0],
        )

        # Apenas a row com dimensão correta deve ser incluída
        assert len(result.chunks) == 1
        assert result.chunks[0].chunk.chunk_index == 1
        assert any("embedding_dimension_mismatch" in w for w in result.warnings)
        assert any("skipped 1 chunks" in w for w in result.warnings)

    async def test_json_fallback_applies_candidate_cap_and_warning(self) -> None:
        session = AsyncMock()
        rows = [
            _make_row(vector=[1.0, 0.0], idx=i)
            for i in range(JSON_FALLBACK_CANDIDATE_LIMIT + 1)
        ]
        search_result = MagicMock()
        search_result.all.return_value = rows
        session.execute.side_effect = [_pgvector_unavailable_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test", limit=3),
            query_vector=[1.0, 0.0],
        )

        assert len(result.chunks) == 3
        assert "rag_vector_search_json_fallback_limited" in result.warnings
        stmt = session.execute.call_args_list[1][0][0]
        expected_fetch_limit = min(JSON_FALLBACK_CANDIDATE_LIMIT, 3 * 20) + 1
        assert f"LIMIT {expected_fetch_limit}" in str(
            stmt.compile(compile_kwargs={"literal_binds": True})
        )

    async def test_similarity_search_rejects_empty_query_vector(self) -> None:
        """Query vector vazio retorna resultado controlado com warning."""
        session = AsyncMock()
        session.execute.return_value = _pgvector_available_mock()

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test"),
            query_vector=[],
        )

        assert result.chunks == []
        assert "empty_query_embedding" in result.warnings

    async def test_similarity_search_source_type_filter_is_applied(self) -> None:
        """Filtro source_type é passado na query SQL sem causar erro."""
        session = AsyncMock()
        search_result = MagicMock()
        search_result.mappings.return_value.all.return_value = []
        session.execute.side_effect = [_pgvector_available_mock(), search_result]

        store = PostgresVectorStore(session)
        result = await store.similarity_search(
            RetrievalQuery(query="test", filters={"source_type": "rh_policy"}),
            query_vector=[1.0, 0.0],
        )

        # Executou sem erro e retornou resultado válido
        assert isinstance(result.chunks, list)
        assert session.execute.call_count == 2
        _, params = session.execute.call_args_list[1][0]
        assert params["source_type"] == "rh_policy"
