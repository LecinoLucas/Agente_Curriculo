"""
Default Tool Registry: Registro pré-populado com todas as tools read-only.

Tools registradas (17 total, todas read_only=True, requires_approval=False):

  Jobs (4):
    get_job_summary, search_jobs, get_job_requirements, get_job_ai_draft_context

  Candidates (4):
    get_candidate_summary, search_candidates, get_candidate_profile_context,
    get_candidate_resume_analysis_summary

  Pipeline (4):
    get_job_pipeline_overview, get_candidate_pipeline_position,
    get_candidate_pipeline_history, search_pipeline_candidates

  Admission (4):
    get_admission_case_summary, get_admission_checklist_status,
    get_admission_documents_status, get_admission_events_summary

  Protheus (1):
    get_protheus_export_status
"""
from src.ai_orchestration.core.tool_registry import ToolDefinition, ToolRegistry
from src.ai_orchestration.tools import (
    admission_tools,
    candidate_tools,
    job_tools,
    knowledge_tools,
    pipeline_tools,
    protheus_tools,
)

_JOB_PERMS = ["can_view_jobs"]
_CANDIDATE_PERMS = ["can_view_candidates"]
_PIPELINE_PERMS = ["can_view_pipeline"]
_ADMISSION_PERMS = ["can_view_admissions"]
_PROTHEUS_PERMS = ["can_view_protheus_status"]
_KNOWLEDGE_PERMS = ["can_use_assistant"]

_TOOL_DEFINITIONS: list[ToolDefinition] = [
    # ── Knowledge ───────────────────────────────────────────────────────
    ToolDefinition(
        name="search_knowledge",
        domain="knowledge",
        description="Busca informações na base de conhecimento (RAG) usando busca vetorial.",
        required_permissions=_KNOWLEDGE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=knowledge_tools.search_knowledge,
    ),
    ToolDefinition(
        name="answer_knowledge",
        domain="knowledge",
        description="Responde uma pergunta baseando-se na base de conhecimento (RAG) com síntese de IA.",
        required_permissions=_KNOWLEDGE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=knowledge_tools.answer_knowledge,
    ),
    # ── Jobs ────────────────────────────────────────────────────────────
    ToolDefinition(
        name="get_job_summary",
        domain="jobs",
        description="Retorna resumo estruturado de uma vaga.",
        required_permissions=_JOB_PERMS,
        read_only=True,
        requires_approval=False,
        fn=job_tools.get_job_summary,
    ),
    ToolDefinition(
        name="search_jobs",
        domain="jobs",
        description="Busca vagas por critérios (título, status, área).",
        required_permissions=_JOB_PERMS,
        read_only=True,
        requires_approval=False,
        fn=job_tools.search_jobs,
    ),
    ToolDefinition(
        name="get_job_requirements",
        domain="jobs",
        description="Retorna requisitos detalhados de uma vaga.",
        required_permissions=_JOB_PERMS,
        read_only=True,
        requires_approval=False,
        fn=job_tools.get_job_requirements,
    ),
    ToolDefinition(
        name="get_job_ai_draft_context",
        domain="jobs",
        description="Retorna contexto seguro de vaga para análise ou melhoria de rascunho por IA.",
        required_permissions=_JOB_PERMS,
        read_only=True,
        requires_approval=False,
        fn=job_tools.get_job_ai_draft_context,
    ),
    # ── Candidates ──────────────────────────────────────────────────────
    ToolDefinition(
        name="get_candidate_summary",
        domain="candidates",
        description="Retorna resumo estruturado de um candidato (sem dados LGPD sensíveis).",
        required_permissions=_CANDIDATE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=candidate_tools.get_candidate_summary,
    ),
    ToolDefinition(
        name="search_candidates",
        domain="candidates",
        description="Busca candidatos por critérios.",
        required_permissions=_CANDIDATE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=candidate_tools.search_candidates,
    ),
    ToolDefinition(
        name="get_candidate_profile_context",
        domain="candidates",
        description="Retorna contexto de perfil profissional seguro para uso por IA.",
        required_permissions=_CANDIDATE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=candidate_tools.get_candidate_profile_context,
    ),
    ToolDefinition(
        name="get_candidate_resume_analysis_summary",
        domain="candidates",
        description="Retorna resumo seguro do status de análise do currículo.",
        required_permissions=_CANDIDATE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=candidate_tools.get_candidate_resume_analysis_summary,
    ),
    # ── Pipeline ────────────────────────────────────────────────────────
    ToolDefinition(
        name="get_job_pipeline_overview",
        domain="pipeline",
        description="Retorna visão geral do pipeline de uma vaga: etapas, contagens e gargalos.",
        required_permissions=_PIPELINE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=pipeline_tools.get_job_pipeline_overview,
    ),
    ToolDefinition(
        name="get_candidate_pipeline_position",
        domain="pipeline",
        description="Retorna a posição atual de um candidato no pipeline de uma vaga.",
        required_permissions=_PIPELINE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=pipeline_tools.get_candidate_pipeline_position,
    ),
    ToolDefinition(
        name="get_candidate_pipeline_history",
        domain="pipeline",
        description="Retorna o histórico de movimentações de um candidato no pipeline.",
        required_permissions=_PIPELINE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=pipeline_tools.get_candidate_pipeline_history,
    ),
    ToolDefinition(
        name="search_pipeline_candidates",
        domain="pipeline",
        description="Busca candidatos no pipeline de uma vaga com filtragem por etapa e nome.",
        required_permissions=_PIPELINE_PERMS,
        read_only=True,
        requires_approval=False,
        fn=pipeline_tools.search_pipeline_candidates,
    ),
    # ── Admission ───────────────────────────────────────────────────────
    ToolDefinition(
        name="get_admission_case_summary",
        domain="admission",
        description="Retorna resumo operacional de um caso de admissão.",
        required_permissions=_ADMISSION_PERMS,
        read_only=True,
        requires_approval=False,
        fn=admission_tools.get_admission_case_summary,
    ),
    ToolDefinition(
        name="get_admission_checklist_status",
        domain="admission",
        description="Retorna status do checklist de pré-admissão com contagens e itens.",
        required_permissions=_ADMISSION_PERMS,
        read_only=True,
        requires_approval=False,
        fn=admission_tools.get_admission_checklist_status,
    ),
    ToolDefinition(
        name="get_admission_documents_status",
        domain="admission",
        description="Retorna status dos documentos de pré-admissão sem conteúdo bruto.",
        required_permissions=_ADMISSION_PERMS,
        read_only=True,
        requires_approval=False,
        fn=admission_tools.get_admission_documents_status,
    ),
    ToolDefinition(
        name="get_admission_events_summary",
        domain="admission",
        description="Retorna histórico de eventos do caso de admissão.",
        required_permissions=_ADMISSION_PERMS,
        read_only=True,
        requires_approval=False,
        fn=admission_tools.get_admission_events_summary,
    ),
    # ── Protheus ────────────────────────────────────────────────────────
    ToolDefinition(
        name="get_protheus_export_status",
        domain="protheus",
        description="Retorna status do pacote de exportação Protheus/ERP sem payload completo.",
        required_permissions=_PROTHEUS_PERMS,
        read_only=True,
        requires_approval=False,
        fn=protheus_tools.get_protheus_export_status,
    ),
]

_EXPECTED_TOOL_COUNT = 19


def build_default_registry() -> ToolRegistry:
    """Constrói e retorna um ToolRegistry pré-populado com todas as tools read-only."""
    registry = ToolRegistry()
    for tool_def in _TOOL_DEFINITIONS:
        registry.register(tool_def)
    return registry


DEFAULT_REGISTRY: ToolRegistry = build_default_registry()
