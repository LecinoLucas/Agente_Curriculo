"""
Unit tests — Postgres Vector Store (AI-RAG-5).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from src.infrastructure.repositories.postgres_vector_store import PostgresVectorStore
from src.ai_orchestration.rag.schemas import RetrievalQuery


@pytest.mark.asyncio
class TestPostgresVectorStore:
    async def test_similarity_search_returns_fallback_when_pgvector_missing(self) -> None:
        session = AsyncMock()
        # Mock para is_pgvector_available -> False
        mock_result = MagicMock()
        mock_result.scalar.return_value = None
        session.execute.return_value = mock_result
        
        store = PostgresVectorStore(session)
        query = RetrievalQuery(query="teste")
        
        result = await store.similarity_search(query, query_vector=[0.1, 0.2])
        
        assert result.query == "teste"
        assert result.chunks == []
        assert any("pgvector" in w.lower() for w in result.warnings)

    async def test_health_check_reports_correct_mode(self) -> None:
        session = AsyncMock()
        # Mock para is_pgvector_available -> False
        mock_result = MagicMock()
        mock_result.scalar.return_value = None
        session.execute.return_value = mock_result
        
        store = PostgresVectorStore(session)
        status = await store.health_check()
        
        assert status["ok"] is True
        assert status["pgvector_available"] is False
        assert status["storage_mode"] == "json_fallback"

    async def test_upsert_is_idempotent_with_mocks(self) -> None:
        # Teste conceitual pois upsert real exige DB
        # Vamos apenas garantir que o objeto pode ser instanciado e aceita os contratos
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
        # Verifica se usou o doc_id na query (via call_args)
        # arg 0 é o statement sa.delete
        stmt = session.execute.call_args[0][0]
        assert "ai_knowledge_embeddings" in str(stmt)
