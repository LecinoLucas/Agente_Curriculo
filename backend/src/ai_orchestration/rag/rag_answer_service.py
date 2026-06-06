"""
RAG Answer Service: Coordena a síntese de respostas a partir de evidências (AI-RAG-10).

Valida flags, filtra fontes, constrói prompts e invoca o provedor de síntese.
"""
from __future__ import annotations

import logging
from typing import Any

from src.ai_orchestration.rag.answer_schemas import (
    RagAnswerRequest,
    RagAnswerResult,
    RagSource,
)
from src.ai_orchestration.rag.gemini_rag_synthesis_provider import GeminiRagSynthesisProvider
from src.ai_orchestration.rag.rag_prompting import RagPrompting
from src.ai_orchestration.rag.schemas import KnowledgeChunk
from src.core.ai_response_redactor import redact_ai_response_text
from src.core.settings import settings

logger = logging.getLogger(__name__)


class RagAnswerService:
    """Serviço que orquestra a geração de respostas com fontes (AI-RAG-10)."""

    def __init__(
        self,
        synthesis_provider: GeminiRagSynthesisProvider | None = None,
    ):
        self._provider = synthesis_provider or GeminiRagSynthesisProvider()

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
            answer_text = await self._provider.generate_response(prompt)

            # 5.1 Redação de PII (H-01)
            safe_answer = redact_ai_response_text(answer_text)

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

        except Exception as exc:
            logger.error(f"Erro no RagAnswerService: {exc}", exc_info=True)
            return RagAnswerResult(
                ok=False,
                error_code="SYNTHESIS_ERROR",
                message=f"Falha ao sintetizar resposta: {type(exc).__name__}",
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
