"""
Unit tests — pgvector support utilities (AI-RAG-5).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from src.ai_orchestration.rag.pgvector_support import (
    JSON_FALLBACK_CANDIDATE_LIMIT,
    get_vector_extension_status,
    is_pgvector_available,
)


@pytest.mark.asyncio
class TestPgvectorSupport:
    async def test_is_available_returns_true_when_extension_exists(self) -> None:
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        session.execute.return_value = mock_result
        
        available = await is_pgvector_available(session)
        assert available is True
        # Verifica se chamou a query correta
        args, _ = session.execute.call_args
        assert "extname = 'vector'" in str(args[0])

    async def test_is_available_returns_false_when_extension_missing(self) -> None:
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = None
        session.execute.return_value = mock_result
        
        available = await is_pgvector_available(session)
        assert available is False

    async def test_is_available_returns_false_on_exception(self) -> None:
        session = AsyncMock()
        session.execute.side_effect = Exception("Not Postgres")
        
        available = await is_pgvector_available(session)
        assert available is False

    async def test_get_status_reports_json_fallback_when_unavailable(self) -> None:
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = None
        session.execute.return_value = mock_result
        
        status = await get_vector_extension_status(session)
        assert status["pgvector_available"] is False
        assert status["storage_mode"] == "json_fallback"
        assert "pgvector_not_available" in status["warnings"]
        assert "rag_vector_search_json_fallback_limited" in status["warnings"]
        assert status["json_fallback_candidate_limit"] == JSON_FALLBACK_CANDIDATE_LIMIT

    async def test_get_status_reports_pgvector_when_available(self) -> None:
        session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        session.execute.return_value = mock_result
        
        status = await get_vector_extension_status(session)
        assert status["pgvector_available"] is True
        assert status["storage_mode"] == "pgvector"
        assert status["json_fallback_candidate_limit"] == JSON_FALLBACK_CANDIDATE_LIMIT
        assert len(status["warnings"]) == 0
