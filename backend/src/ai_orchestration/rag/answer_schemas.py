"""
RAG Answer Schemas: Contratos para solicitação e resultado de síntese de conhecimento.

Fase AI-RAG-10 — Síntese baseada em fontes recuperadas.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from src.ai_orchestration.rag.schemas import KnowledgeChunk


@dataclass
class RagAnswerRequest:
    """Solicitação de síntese de conhecimento a partir de trechos recuperados."""
    query: str
    retrieved_chunks: list[KnowledgeChunk]
    max_chunks: int = 5
    require_sources: bool = True
    language: str = "pt-BR"
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RagSource:
    """Referência a uma fonte utilizada na síntese."""
    document_id: str
    chunk_id: str
    source_title: str
    score: float | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RagSynthesisProviderResult:
    """Resultado bruto do provedor de síntese (LLM), incluindo metadados de uso."""
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    usage_available: bool = False


@dataclass
class RagAnswerResult:
    """Resultado da síntese gerada pelo LLM."""
    ok: bool
    answer: str | None = None
    sources: list[RagSource] = field(default_factory=list)
    confidence: float | None = None
    warnings: list[str] = field(default_factory=list)
    error_code: str | None = None
    message: str | None = None
    provider: str | None = None
    model: str | None = None
