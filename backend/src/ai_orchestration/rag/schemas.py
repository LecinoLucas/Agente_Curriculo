"""
Schemas RAG: Contratos de fonte de conhecimento e resposta.

Hierarquia:
  KnowledgeDocument → KnowledgeChunk (unidade de indexação e retrieval)
  RetrievalQuery → RetrievalResult → RetrievedChunk (contratos de busca)
  RagSource / RagAnswer (contratos LLM — fase futura)

Toda resposta gerada via RAG deve incluir sources verificáveis.
Respostas sem fonte são consideradas inválidas nesta arquitetura.
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class RagSource:
    """
    Fonte de conhecimento utilizada em uma resposta RAG.

    Campos:
        document_id: UUID do documento na base de conhecimento.
        title: Título do documento.
        chunk_id: UUID do chunk específico utilizado.
        source_type: Tipo da fonte — "rh_policy" | "ats_guide" | "pre_admission" | etc.
        score: Score de similaridade do chunk (0.0 a 1.0).
        metadata: Metadados do chunk (seção, autor, data de vigência, etc.).
    """
    document_id: str
    title: str
    chunk_id: str
    source_type: str
    score: float
    metadata: dict[str, Any] = field(default_factory=dict)

    # Tipos de fonte permitidos
    VALID_SOURCE_TYPES = frozenset({
        "rh_policy",
        "hiring_rules",
        "ats_guide",
        "pre_admission_docs",
        "protheus_docs",
        "internal_guide",
        "ranking_criteria",
        "admission_checklist",
    })

    def __post_init__(self) -> None:
        if not (0.0 <= self.score <= 1.0):
            raise ValueError(f"RagSource.score deve estar entre 0.0 e 1.0, recebido: {self.score}")


@dataclass
class RagAnswer:
    """
    Resposta gerada pelo sistema RAG.

    Regras obrigatórias:
        - sources NUNCA deve ser vazio quando answer foi gerada via RAG.
        - confidence reflete o score médio dos chunks utilizados.
        - Se confidence < 0.6, deve haver um warning informando baixa confiança.

    Campos:
        answer: Texto da resposta gerada.
        sources: Lista de fontes utilizadas para gerar a resposta.
        confidence: Confiança média (0.0 a 1.0).
        warnings: Avisos sobre a qualidade ou completude da resposta.
    """
    answer: str
    sources: list[RagSource] = field(default_factory=list)
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)

    LOW_CONFIDENCE_THRESHOLD = 0.6

    def __post_init__(self) -> None:
        # Calcular confiança automaticamente se não fornecida e há fontes
        if self.sources and self.confidence == 0.0:
            self.confidence = round(
                sum(s.score for s in self.sources) / len(self.sources), 4
            )
        # Adicionar warning automático de baixa confiança
        if self.confidence < self.LOW_CONFIDENCE_THRESHOLD and "low_confidence" not in self.warnings:
            self.warnings.append("low_confidence")

    @property
    def has_sources(self) -> bool:
        """Verifica se a resposta tem fontes citadas."""
        return len(self.sources) > 0

    @property
    def top_source(self) -> RagSource | None:
        """Retorna a fonte com maior score."""
        if not self.sources:
            return None
        return max(self.sources, key=lambda s: s.score)


# ── Fundação RAG (AI-RAG-1) ───────────────────────────────────────────────────


@dataclass(frozen=True)
class KnowledgeDocument:
    """Documento da base de conhecimento interno.

    Campos:
        id: UUID do documento.
        title: Título descritivo.
        source_type: Categoria — "rh_policy" | "ats_guide" | "pre_admission_docs" | etc.
        content: Conteúdo completo em texto plano.
        metadata: Metadados livres (autor, versão, data de vigência, tags...).
        created_at: Data de criação (opcional).
    """

    id: str
    title: str
    source_type: str
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None


@dataclass(frozen=True)
class KnowledgeChunk:
    """Chunk indexável de um KnowledgeDocument.

    Unidade mínima de retrieval — nunca retorna o documento completo.

    Campos:
        id: UUID do chunk.
        document_id: UUID do documento de origem.
        chunk_index: Posição ordinal no documento (0-based).
        content: Texto do chunk.
        metadata: Metadados herdados + posicionais (char_count, section_heading...).
        source_title: Título do documento de origem (desnormalizado para exibição).
    """

    id: str
    document_id: str
    chunk_index: int
    content: str
    metadata: dict[str, Any] = field(default_factory=dict)
    source_title: str | None = None


@dataclass(frozen=True)
class RetrievalQuery:
    """Query de busca na base de conhecimento RAG.

    Campos:
        query: Texto da pergunta ou termo de busca.
        filters: Filtros opcionais, ex: {"source_type": "rh_policy"}.
        limit: Número máximo de chunks a retornar (padrão: 5).
        min_score: Score mínimo de relevância para incluir um chunk (padrão: 0.0).
    """

    query: str
    filters: dict[str, Any] | None = None
    limit: int = 5
    min_score: float = 0.0


@dataclass(frozen=True)
class RetrievedChunk:
    """Chunk recuperado por um retriever com score e razão do match.

    Campos:
        chunk: KnowledgeChunk recuperado.
        score: Score de relevância (0.0–1.0).
        match_reason: Explicação do match para observabilidade (ex: "keyword_match").
    """

    chunk: KnowledgeChunk
    score: float
    match_reason: str | None = None


@dataclass
class RetrievalResult:
    """Resultado de uma query de retrieval.

    Nunca contém resposta gerada — apenas chunks recuperados com fontes.
    Geração de resposta é responsabilidade da camada LLM (fase futura).

    Campos:
        query: Query original que gerou este resultado.
        chunks: Lista de RetrievedChunk ordenada por score decrescente.
        total: Quantidade de chunks retornados.
        warnings: Avisos operacionais (ex: "empty_query", "low_coverage").
    """

    query: str
    chunks: list[RetrievedChunk] = field(default_factory=list)
    total: int = 0
    warnings: list[str] = field(default_factory=list)
