"""
IntentCatalog: Mapeamento determinístico de intents para tool names.

Nenhum NLP, LLM ou parsing semântico aqui.
Cada intent mapeia 1:1 para um tool name do DEFAULT_REGISTRY.

Domínios cobertos: jobs, candidates, pipeline, admission, protheus.
"""
from __future__ import annotations

# Mapeamento canônico: intent → tool name do DEFAULT_REGISTRY
INTENT_TO_TOOL: dict[str, str] = {
    # Jobs ──────────────────────────────────────────────────────────────
    "job.summary": "get_job_summary",
    "job.search": "search_jobs",
    "job.requirements": "get_job_requirements",
    "job.ai_draft_context": "get_job_ai_draft_context",
    # Candidates ────────────────────────────────────────────────────────
    "candidate.summary": "get_candidate_summary",
    "candidate.search": "search_candidates",
    "candidate.profile_context": "get_candidate_profile_context",
    "candidate.resume_analysis": "get_candidate_resume_analysis_summary",
    # Pipeline ──────────────────────────────────────────────────────────
    "pipeline.overview": "get_job_pipeline_overview",
    "pipeline.candidate_position": "get_candidate_pipeline_position",
    "pipeline.history": "get_candidate_pipeline_history",
    "pipeline.search_candidates": "search_pipeline_candidates",
    # Admission ─────────────────────────────────────────────────────────
    "admission.case_summary": "get_admission_case_summary",
    "admission.checklist_status": "get_admission_checklist_status",
    "admission.documents_status": "get_admission_documents_status",
    "admission.events_summary": "get_admission_events_summary",
    # Protheus ──────────────────────────────────────────────────────────
    "protheus.export_status": "get_protheus_export_status",
}


class IntentCatalog:
    """Catalogo de intents com mapeamento para tool names.

    Determinístico: sem NLP, sem LLM, sem parsing semântico.
    """

    def __init__(self, mapping: dict[str, str]) -> None:
        self._mapping: dict[str, str] = dict(mapping)

    def resolve(self, intent: str) -> str | None:
        """Retorna o tool name para a intent, ou None se não existir."""
        return self._mapping.get(intent)

    def list_intents(self) -> list[str]:
        """Retorna cópia da lista de intents registradas."""
        return list(self._mapping.keys())

    def list_domains(self) -> list[str]:
        """Retorna lista de domínios únicos presentes no catálogo."""
        return list({i.split(".")[0] for i in self._mapping.keys()})

    def __contains__(self, intent: str) -> bool:
        return intent in self._mapping

    def __len__(self) -> int:
        return len(self._mapping)


DEFAULT_CATALOG = IntentCatalog(INTENT_TO_TOOL)
