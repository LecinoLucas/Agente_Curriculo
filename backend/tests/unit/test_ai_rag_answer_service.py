"""
Unit tests — RAG Answer Service (AI-RAG-10).
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from src.ai_orchestration.rag.answer_schemas import RagAnswerRequest, RagSynthesisProviderResult
from src.ai_orchestration.rag.gemini_rag_synthesis_provider import GeminiSynthesisError
from src.ai_orchestration.rag.rag_answer_service import RagAnswerService
from src.ai_orchestration.rag.schemas import KnowledgeChunk


def _make_chunk(content: str, metadata: dict | None = None) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=str(uuid4()),
        document_id=str(uuid4()),
        chunk_index=0,
        content=content,
        metadata=metadata or {},
        source_title="Doc Teste",
    )


class _UsageSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flushed = False

    def add(self, row: object) -> None:
        self.added.append(row)

    async def flush(self) -> None:
        self.flushed = True


@pytest.mark.asyncio
class TestRagAnswerService:
    async def test_synthesis_disabled_by_flag(self) -> None:
        """Test 1: Síntese desabilitada por flag não chama provider."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", False):
            service = RagAnswerService()
            req = RagAnswerRequest(query="X", retrieved_chunks=[_make_chunk("A")])
            
            result = await service.synthesize_answer(req)
            
            assert result.ok is True
            assert "disabled" in result.warnings[0]
            assert "desativada" in result.answer

    async def test_no_chunks_available_returns_evidence_missing(self) -> None:
        """Test 2: Sem chunks recuperados não chama provider."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            service = RagAnswerService()
            req = RagAnswerRequest(query="X", retrieved_chunks=[])
            
            result = await service.synthesize_answer(req)
            
            assert result.ok is True
            assert "Não encontrei evidências" in result.answer
            assert "no_chunks_available" in result.warnings

    async def test_synthesis_success_with_sources(self) -> None:
        """Test 3 & 6: Com chunks válidos chama provider e inclui fontes."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            mock_provider.generate_response.return_value = RagSynthesisProviderResult(
                text="Resposta com base nas fontes.",
                input_tokens=10,
                output_tokens=5,
                total_tokens=15,
                usage_available=True
            )
            mock_provider.provider_name = "mock"
            mock_provider.model_name = "m1"
            
            service = RagAnswerService(synthesis_provider=mock_provider)
            chunks = [_make_chunk("Conteúdo A"), _make_chunk("Conteúdo B")]
            req = RagAnswerRequest(query="Qual o plano?", retrieved_chunks=chunks)
            
            result = await service.synthesize_answer(req)
            
            assert result.ok is True
            assert result.answer == "Resposta com base nas fontes."
            assert len(result.sources) == 2
            assert result.sources[0].source_title == "Doc Teste"
            assert result.provider == "mock"

    async def test_limits_max_chunks_sent_to_provider(self) -> None:
        """Test 4: Limita número de chunks enviados ao provider."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            mock_provider.generate_response.return_value = RagSynthesisProviderResult(text="ok")
            
            service = RagAnswerService(synthesis_provider=mock_provider)
            chunks = [_make_chunk(f"C{i}") for i in range(10)]
            req = RagAnswerRequest(query="Q", retrieved_chunks=chunks, max_chunks=3)
            
            await service.synthesize_answer(req)
            
            # Verifica o prompt gerado (via o argumento da chamada ao provider)
            prompt = mock_provider.generate_response.call_args[0][0]
            assert "FONTE 1" in prompt
            assert "FONTE 3" in prompt
            assert "FONTE 4" not in prompt

    async def test_filters_sensitive_metadata(self) -> None:
        """Test 5 & 7-9: Filtra metadados sensíveis antes do provider."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            mock_provider.generate_response.return_value = RagSynthesisProviderResult(text="ok")
            
            service = RagAnswerService(synthesis_provider=mock_provider)
            chunk = _make_chunk("A", metadata={
                "cpf": "123", 
                "salary": "1000", 
                "vector_json": [0.1], # Internal system metadata
                "public_info": "yes"
            })
            
            req = RagAnswerRequest(query="Q", retrieved_chunks=[chunk])
            result = await service.synthesize_answer(req)
            
            # Verifica fontes no resultado (não deve ter segredos)
            meta = result.sources[0].metadata
            assert "public_info" in meta
            assert "cpf" not in meta
            assert "salary" not in meta
            assert "vector_json" not in meta

    async def test_handles_provider_error(self) -> None:
        """Test 10: Erro do Gemini vira erro controlado."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            mock_provider.generate_response.side_effect = GeminiSynthesisError(
                error_code="PROVIDER_UNAVAILABLE",
                user_message="Não foi possível gerar a resposta agora porque o provedor de IA está temporariamente indisponível. Tente novamente em instantes.",
                retryable=True,
                provider_message="Temporary outage",
                status_code=503,
            )
            mock_provider.provider_name = "gemini"
            mock_provider.model_name = "gemini-2.5-flash"
            
            service = RagAnswerService(synthesis_provider=mock_provider)
            req = RagAnswerRequest(query="Q", retrieved_chunks=[_make_chunk("A")])
            
            result = await service.synthesize_answer(req)
            
            assert result.ok is False
            assert result.error_code == "PROVIDER_UNAVAILABLE"
            assert "temporariamente indisponível" in result.message

    async def test_synthesized_answer_is_redacted(self) -> None:
        """Test H-01: Resposta sintetizada passa por redação de PII."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            # Resposta contendo um CPF fictício
            mock_provider.generate_response.return_value = RagSynthesisProviderResult(
                text="O CPF do candidato é 123.456.789-00."
            )
            mock_provider.provider_name = "mock"
            mock_provider.model_name = "m1"
            
            service = RagAnswerService(synthesis_provider=mock_provider)
            chunks = [_make_chunk("Doc com dados.")]
            req = RagAnswerRequest(query="Qual o CPF?", retrieved_chunks=chunks)
            
            result = await service.synthesize_answer(req)
            
            assert result.ok is True
            assert "123.456.789-00" not in result.answer
            assert "[cpf_removido]" in result.answer

    async def test_records_rag_synthesis_usage_with_real_tokens(self) -> None:
        """AI-USAGE-2: registra usage da síntese com tokens reais capturados."""
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            mock_provider.generate_response.return_value = RagSynthesisProviderResult(
                text="Resposta segura.",
                input_tokens=123,
                output_tokens=45,
                total_tokens=168,
                usage_available=True
            )
            mock_provider.provider_name = "mock"
            mock_provider.model_name = "m1"
            usage_session = _UsageSession()

            service = RagAnswerService(
                synthesis_provider=mock_provider,
                usage_session=usage_session,  # type: ignore[arg-type]
            )
            req = RagAnswerRequest(query="Q", retrieved_chunks=[_make_chunk("A")])

            result = await service.synthesize_answer(req)

            assert result.ok is True
            assert usage_session.flushed is True
            assert len(usage_session.added) == 1
            row = usage_session.added[0]
            assert row.provider == "mock"
            assert row.model == "m1"
            assert row.operation == "rag_synthesis"
            assert row.input_tokens == 123
            assert row.output_tokens == 45
            assert row.status == "success"
            assert not hasattr(row, "prompt")
            assert not hasattr(row, "answer")

    async def test_records_classified_usage_error_without_prompt_or_answer(self) -> None:
        with patch("src.core.settings.settings.RAG_SYNTHESIS_ENABLED", True):
            mock_provider = AsyncMock()
            mock_provider.generate_response.side_effect = GeminiSynthesisError(
                error_code="PROVIDER_RATE_LIMITED",
                user_message="Não foi possível gerar a resposta agora porque o provedor de IA atingiu o limite temporário de uso. Tente novamente em instantes.",
                retryable=True,
                provider_message="Rate limited",
                status_code=429,
            )
            mock_provider.provider_name = "gemini"
            mock_provider.model_name = "gemini-2.5-flash"
            usage_session = _UsageSession()

            service = RagAnswerService(
                synthesis_provider=mock_provider,
                usage_session=usage_session,  # type: ignore[arg-type]
            )

            result = await service.synthesize_answer(
                RagAnswerRequest(query="Q", retrieved_chunks=[_make_chunk("A")])
            )

            assert result.ok is False
            assert result.error_code == "PROVIDER_RATE_LIMITED"
            assert "limite temporário" in result.message
            assert usage_session.flushed is True
            assert len(usage_session.added) == 1
            row = usage_session.added[0]
            assert row.operation == "rag_synthesis"
            assert row.status == "error"
            assert row.input_tokens == 0
            assert row.output_tokens == 0
            assert row.error_message.startswith("PROVIDER_RATE_LIMITED:")
            assert not hasattr(row, "prompt")
            assert not hasattr(row, "answer")
