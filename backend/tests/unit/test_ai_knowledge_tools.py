"""
Unit tests — Knowledge Tools (AI-RAG-8).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.rag.postgres_vector_retriever import PostgresVectorRetriever
from src.ai_orchestration.rag.schemas import (
    KnowledgeChunk,
    RetrievalResult,
    RetrievedChunk,
)
from src.ai_orchestration.tools.knowledge_tools import search_knowledge


def _make_context(permissions: list[str] | None = None) -> AgentContext:
    return AgentContext(
        user_id=str(uuid4()),
        role="recruiter",
        permissions=permissions if permissions is not None else ["can_use_assistant"],
        request_id=str(uuid4()),
        session_id=str(uuid4()),
    )


@pytest.mark.asyncio
class TestSearchKnowledgeTool:
    async def test_search_knowledge_success(self) -> None:
        """Test 1: search_knowledge com permissão válida retorna ok=True."""
        context = _make_context()
        retriever = AsyncMock(spec=PostgresVectorRetriever)
        
        # Mock de resultado do RAG
        chunk = KnowledgeChunk(
            id=str(uuid4()),
            document_id=str(uuid4()),
            chunk_index=0,
            content="Informação recuperada",
            metadata={"secret": "hidden", "public": "visible"},
            source_title="Manual RH",
        )
        retriever.retrieve.return_value = RetrievalResult(
            query="como contratar?",
            chunks=[RetrievedChunk(chunk=chunk, score=0.95)],
            total=1,
            warnings=["test_warning"],
        )

        result = await search_knowledge(
            context=context,
            query="como contratar?",
            retriever=retriever,
            limit=5
        )

        assert result.ok is True
        assert result.data["query"] == "como contratar?"
        assert len(result.data["chunks"]) == 1
        assert result.data["chunks"][0]["content"] == "Informação recuperada"
        assert result.data["chunks"][0]["source_title"] == "Manual RH"
        assert result.data["chunks"][0]["score"] == 0.95
        assert "test_warning" in result.data["warnings"]
        
        # Test 7: Metadados filtrados
        assert "public" in result.data["chunks"][0]["metadata"]
        assert "secret" in result.data["chunks"][0]["metadata"] # secret is not in excluded list
        
        # Verificando exclusão de campos sensíveis de sistema
        chunk_with_vector = KnowledgeChunk(
            id=str(uuid4()),
            document_id=str(uuid4()),
            chunk_index=1,
            content="X",
            metadata={"vector_json": [1,2], "content_hash": "abc"},
        )
        retriever.retrieve.return_value.chunks = [RetrievedChunk(chunk=chunk_with_vector, score=0.5)]
        
        result_v = await search_knowledge(context=context, query="X", retriever=retriever)
        meta = result_v.data["chunks"][0]["metadata"]
        assert "vector_json" not in meta
        assert "content_hash" not in meta

    async def test_search_knowledge_permission_denied(self) -> None:
        """Test 2: search_knowledge sem permissão retorna PERMISSION_DENIED."""
        context = _make_context(permissions=[]) # Sem permissões
        retriever = AsyncMock()
        
        result = await search_knowledge(
            context=context,
            query="X",
            retriever=retriever
        )
        
        assert result.ok is False
        assert result.error_code == "PERMISSION_DENIED"
        retriever.retrieve.assert_not_called()

    async def test_search_knowledge_empty_query(self) -> None:
        """Test 3: Query vazia retorna erro controlado."""
        context = _make_context()
        retriever = AsyncMock()
        
        result = await search_knowledge(context=context, query="   ", retriever=retriever)
        
        assert result.ok is False
        assert result.error_code == "INVALID_INPUT"

    async def test_search_knowledge_respects_limit_cap(self) -> None:
        """Test 4: Limit respeita cap máximo (20)."""
        context = _make_context()
        retriever = AsyncMock()
        retriever.retrieve.return_value = RetrievalResult(query="Q", chunks=[], total=0)
        
        await search_knowledge(context=context, query="Q", retriever=retriever, limit=100)
        
        # Verifica se chamou retrieve com limit=20
        args, _ = retriever.retrieve.call_args
        assert args[0].limit == 20

    async def test_search_knowledge_preserves_warnings(self) -> None:
        """Test 8: Warnings do retriever são preservados."""
        context = _make_context()
        retriever = AsyncMock()
        retriever.retrieve.return_value = RetrievalResult(
            query="Q", chunks=[], warnings=["low_score"]
        )
        
        result = await search_knowledge(context=context, query="Q", retriever=retriever)
        assert "low_score" in result.data["warnings"]

    async def test_search_knowledge_handles_retriever_error(self) -> None:
        """Test 9: Erro do retriever vira INTERNAL_ERROR."""
        context = _make_context()
        retriever = AsyncMock()
        retriever.retrieve.side_effect = RuntimeError("DB Down")
        
        result = await search_knowledge(context=context, query="Q", retriever=retriever)
        
        assert result.ok is False
        assert result.error_code == "INTERNAL_ERROR"
        assert "RuntimeError" in result.message
