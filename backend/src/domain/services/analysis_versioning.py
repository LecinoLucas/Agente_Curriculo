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

"""

from typing import Optional
from uuid import UUID


# R07 — Idempotency key namespace.
#
# The old format (kept for back-compat reads):
#     "analysis:{resume_version}:{prompt}:{model}:{job_or_generic}"
# has no version prefix and no requester component, so callers across different
# requesters could theoretically collide on the same string. New writes use v1.
#
# v1 format:
#     "analysis:v1:{resume_version}:{job_or_null}:{ai_model}:{prompt_template}:{requested_by_or_system}"
#
# Properties:
# - Same inputs → same string (idempotent across retries).
# - Different inputs (any component) → different string.
# - Stays under VARCHAR(255).
# - Existing rows keep working (the column is `unique` on the string value;
#   the new format simply doesn't overlap with the legacy format because of
#   the `:v1:` token).
_IDEMPOTENCY_KEY_VERSION = "v1"
_SYSTEM_REQUESTER_TOKEN = "system"


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
        requested_by: Optional[UUID] = None,
    ) -> str:
        """
        Chave de idempotência v1 (namespaced, com requester).

        Nota: não bloqueia re-análises manuais — o use case pode sobrescrever
        a chave adicionando um timestamp ou flag force_reanalyze.

        Re-chamadas com os mesmos inputs retornam a mesma string. Mudar qualquer
        componente (resume_version, prompt, modelo, vaga, requester) gera string
        diferente. Convive com chaves do formato legado: o prefixo `:v1:` evita
        colisão com strings antigas.
        """
        job_part = str(job_id) if job_id else "null"
        requester_part = str(requested_by) if requested_by else _SYSTEM_REQUESTER_TOKEN
        return (
            f"analysis:{_IDEMPOTENCY_KEY_VERSION}:"
            f"{resume_version_id}:{job_part}:"
            f"{ai_model_id}:{prompt_template_id}:"
            f"{requester_part}"
        )

    # Legacy builder kept exposed in case any old call path still imports it.
    # Returns the pre-v1 string format. New code MUST call build_idempotency_key.
    @staticmethod
    def build_idempotency_key_legacy(
        resume_version_id: UUID,
        prompt_template_id: UUID,
        ai_model_id: UUID,
        job_id: Optional[UUID] = None,
    ) -> str:
        job_part = str(job_id) if job_id else "generic"
        return (
            f"analysis:{resume_version_id}:{prompt_template_id}:{ai_model_id}:{job_part}"
        )

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
        if existing_status in ("pending", "processing", "retry_scheduled"):
            return False, "Uma análise já está em andamento para este currículo."

        if existing_status == "completed" and not force:
            return True, "Re-análise permitida. A análise anterior será preservada no histórico."

        return True, "Análise autorizada."
