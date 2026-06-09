"""
RAG Answer Service: Coordena a síntese de respostas a partir de evidências (AI-RAG-10).

Valida flags, filtra fontes, constrói prompts e invoca o provedor de síntese.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.answer_schemas import (
    RagAnswerRequest,
    RagAnswerResult,
    RagSource,
)
from src.ai_orchestration.rag.gemini_rag_synthesis_provider import (
    GeminiRagSynthesisProvider,
    GeminiSynthesisError,
)
from src.ai_orchestration.rag.rag_prompting import RagPrompting
from src.ai_orchestration.rag.schemas import KnowledgeChunk
from src.application.services.ai_usage_log_service import AIUsageLogPayload, persist_ai_usage_log
from src.core.ai_response_redactor import redact_ai_response_text
from src.core.settings import settings

logger = logging.getLogger(__name__)


class RagAnswerService:
    """Serviço que orquestra a geração de respostas com fontes (AI-RAG-10)."""

    def __init__(
        self,
        synthesis_provider: GeminiRagSynthesisProvider | None = None,
        usage_session: AsyncSession | None = None,
    ):
        self._provider = synthesis_provider or GeminiRagSynthesisProvider()
        self._usage_session = usage_session

    async def synthesize_answer(self, request: RagAnswerRequest) -> RagAnswerResult:
        """Gera uma resposta baseada estritamente nos chunks fornecidos."""
        
        # 1. Validação de Feature Flag
        if not settings.RAG_SYNTHESIS_ENABLED:
            return RagAnswerResult(
                ok=True,
                warnings=["rag_synthesis_disabled_by_flag"],
                answer="Síntese de conhecimento desativada globalmente.",
            )

        # 2. Validação de Evidências (Chunks)
        if not request.retrieved_chunks:
            return RagAnswerResult(
                ok=True,
                answer="Não encontrei evidências suficientes na base de conhecimento para responder a essa pergunta.",
                warnings=["no_chunks_available"],
            )

        try:
            # 3. Filtragem e Limitação de Chunks
            # Filtra metadados sensíveis antes de enviar ao prompt (Hardening)
            safe_chunks = self._filter_sensitive_data(request.retrieved_chunks)
            limited_chunks = safe_chunks[:request.max_chunks]

            # 4. Construção do Prompt
            prompt = RagPrompting.build_synthesis_prompt(request.query, limited_chunks)

            # 5. Chamada ao Provider
            _t0 = int(time.monotonic() * 1000)
            result = await self._provider.generate_response(prompt)
            _latency_ms = int(time.monotonic() * 1000) - _t0

            await self._record_usage(
                status="success",
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                latency_ms=_latency_ms,
                usage_available=result.usage_available
            )

            # 5.1 Redação de PII (H-01)
            safe_answer = redact_ai_response_text(result.text)

            # 6. Montagem das Fontes Estruturadas
            sources = [
                RagSource(
                    document_id=c.document_id,
                    chunk_id=c.id,
                    source_title=c.source_title or "Sem título",
                    metadata={
                        k: v for k, v in c.metadata.items()
                        if k not in ("vector_json", "content_hash", "embedding")
                    }
                )
                for c in limited_chunks
            ]

            return RagAnswerResult(
                ok=True,
                answer=safe_answer,
                sources=sources,
                provider=self._provider.provider_name,
                model=self._provider.model_name,
            )

        except GeminiSynthesisError as exc:
            await self._record_usage(
                status="error",
                error_message=self._build_usage_error_message(exc.error_code, exc.provider_message),
            )
            logger.warning(
                "rag_answer.synthesis_provider_error",
                extra={
                    "error_code": exc.error_code,
                    "provider": self._provider.provider_name,
                    "model": self._provider.model_name,
                    "status_code": exc.status_code,
                },
            )
            return RagAnswerResult(
                ok=False,
                error_code=exc.error_code,
                message=exc.user_message,
            )

        except Exception as exc:
            await self._record_usage(
                status="error",
                error_message=self._build_usage_error_message("SYNTHESIS_ERROR", type(exc).__name__),
            )
            logger.error("Erro no RagAnswerService: %s", type(exc).__name__, exc_info=True)
            return RagAnswerResult(
                ok=False,
                error_code="SYNTHESIS_ERROR",
                message="Não foi possível gerar a resposta agora. Tente novamente em instantes.",
            )

    def _filter_sensitive_data(self, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        """Garante que dados sensíveis não vazem para o prompt do LLM."""
        # Nesta fase, apenas filtramos os metadados. O conteúdo textual (content)
        # já deve ter sido tratado na ingestão se necessário.
        cleaned = []
        for c in chunks:
            # Shallow copy to modify metadata only
            new_chunk = KnowledgeChunk(
                id=c.id,
                document_id=c.document_id,
                chunk_index=c.chunk_index,
                content=c.content,
                source_title=c.source_title,
                metadata={
                    k: v for k, v in c.metadata.items()
                    if k not in ("cpf", "salary", "internal_notes", "ocr_raw")
                }
            )
            cleaned.append(new_chunk)
        return cleaned

    async def _record_usage(
        self,
        *,
        status: str,
        error_message: str | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        latency_ms: int | None = None,
        usage_available: bool = False,
    ) -> None:
        """Registra a chamada RAG sem armazenar prompt, resposta ou chunks."""
        if self._usage_session is None:
            return

        try:
            await persist_ai_usage_log(
                self._usage_session,
                AIUsageLogPayload(
                    provider=self._provider.provider_name,
                    model=self._provider.model_name,
                    operation="rag_synthesis",
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                    status=status,
                    error_message=error_message,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Falha ao registrar uso de RAG synthesis: %s", type(exc).__name__)

    @staticmethod
    def _build_usage_error_message(error_code: str, provider_message: str | None = None) -> str:
        if provider_message:
            return f"{error_code}: {provider_message}"
        return error_code
