"""
AnalysisVersioningService — Serviço de domínio puro.

Gerencia as regras de versionamento de análises:

REGRAS DE VERSIONAMENTO:
────────────────────────────────────────────────────────────────────────────
1. Uma análise é sempre sobre uma ResumeVersion específica (arquivo imutável).
2. Uma análise é sempre vinculada a um PromptTemplate versionado.
3. Uma análise é sempre vinculada a um AIModel específico.
4. AnalysisResult é imutável após criação — jamais atualizado.
5. Para re-analisar: cria nova Analysis (novo ID), não atualiza a existente.
6. Múltiplas análises por resume_version são permitidas e esperadas:
     · Diferentes vagas (contexto de job_id diferente)
     · Diferentes prompts (evolução do produto)
     · Diferentes modelos de IA (A/B testing, upgrade)
7. A análise mais recente (completed_at DESC) é considerada a "corrente".
8. Histórico completo é preservado para auditoria — nunca deletar análises.

REGRAS DE DELTA (mudança de score entre versões):
────────────────────────────────────────────────────────────────────────────
  Δ ≥ 15 pontos  → mudança SIGNIFICATIVA (alerta para revisor)
  5 ≤ Δ < 15     → mudança MODERADA (registrado, não alerta)
  Δ < 5          → mudança MÍNIMA (esperado — variação natural do LLM)
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from uuid import UUID


@dataclass(frozen=True)
class ScoreDelta:
    overall: Decimal
    technical: Decimal
    experience: Decimal
    education: Decimal
    communication: Decimal
    leadership: Decimal

    @property
    def is_significant(self) -> bool:
        return abs(float(self.overall)) >= 15.0

    @property
    def is_moderate(self) -> bool:
        return 5.0 <= abs(float(self.overall)) < 15.0

    @property
    def direction(self) -> str:
        if float(self.overall) > 0:
            return "improvement"
        if float(self.overall) < 0:
            return "regression"
        return "neutral"

    def to_dict(self) -> dict:
        return {
            "overall": float(self.overall),
            "technical": float(self.technical),
            "experience": float(self.experience),
            "education": float(self.education),
            "communication": float(self.communication),
            "leadership": float(self.leadership),
            "is_significant": self.is_significant,
            "direction": self.direction,
        }


@dataclass(frozen=True)
class VersioningContext:
    """
    Contexto de versionamento para uma nova análise.
    Criado antes de publicar a análise na fila.
    """

    resume_version_id: UUID
    prompt_template_id: UUID
    ai_model_id: UUID
    job_id: Optional[UUID]
    previous_analysis_id: Optional[UUID]    # análise anterior do mesmo resume_version (se existir)
    previous_overall_score: Optional[Decimal]


class AnalysisVersioningService:
    """
    Regras de negócio sobre o ciclo de vida e versionamento de análises.
    """

    @staticmethod
    def build_idempotency_key(
        resume_version_id: UUID,
        prompt_template_id: UUID,
        ai_model_id: UUID,
        job_id: Optional[UUID] = None,
    ) -> str:
        """
        Chave de idempotência para evitar análises duplicadas na fila.
        A mesma combinação de (resume_version, prompt, modelo, vaga) não deve
        ser processada duas vezes simultaneamente.

        Nota: não bloqueia re-análises manuais — o use case pode sobrescrever
        a chave adicionando um timestamp ou flag force_reanalyze.
        """
        job_part = str(job_id) if job_id else "generic"
        return (
            f"analysis:{resume_version_id}:{prompt_template_id}:{ai_model_id}:{job_part}"
        )

    @staticmethod
    def calculate_delta(
        previous_scores: dict[str, Decimal],
        new_scores: dict[str, Decimal],
    ) -> ScoreDelta:
        """
        Calcula o delta entre dois resultados de análise.
        Útil para detectar regressões ao trocar versão de prompt ou modelo.
        """

        def diff(key: str) -> Decimal:
            return new_scores.get(key, Decimal("0")) - previous_scores.get(key, Decimal("0"))

        return ScoreDelta(
            overall=diff("overall_score"),
            technical=diff("technical_score"),
            experience=diff("experience_score"),
            education=diff("education_score"),
            communication=diff("communication_score"),
            leadership=diff("leadership_score"),
        )

    @staticmethod
    def should_alert_on_delta(delta: ScoreDelta) -> bool:
        """
        Retorna True se a mudança de score é grande o suficiente para alertar
        o time de produto (possível regressão do prompt ou modelo).
        """
        return delta.is_significant

    @staticmethod
    def validate_reanalysis_allowed(
        existing_status: str,
        force: bool = False,
    ) -> tuple[bool, str]:
        """
        Verifica se é permitido criar uma nova análise dado o estado atual.

        Regras:
        - Se a análise anterior está PENDING ou PROCESSING → não permitido (em andamento)
        - Se COMPLETED → permitido (re-análise manual)
        - Se FAILED ou CANCELLED → permitido (nova tentativa)
        - force=True: bypassa a checagem para análises COMPLETED (admin override)
        """
        if existing_status in ("pending", "processing"):
            return False, "Uma análise já está em andamento para este currículo."

        if existing_status == "completed" and not force:
            return True, "Re-análise permitida. A análise anterior será preservada no histórico."

        return True, "Análise autorizada."
