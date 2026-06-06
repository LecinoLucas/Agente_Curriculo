"""
Schemas RAG: Contratos de fonte de conhecimento e resposta.

Toda resposta gerada via RAG deve incluir sources verificáveis.
Respostas sem fonte são consideradas inválidas nesta arquitetura.
"""
from dataclasses import dataclass, field
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
