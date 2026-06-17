"""
Candidate Bot Registry: allowlist explícita de tools seguras do portal.

Não herda o catálogo interno ATS/RH. Qualquer tool fora da allowlist falha
fechado e gera log de tentativa bloqueada.
"""
from __future__ import annotations

import logging

from src.ai_orchestration.core.tool_registry import ToolDefinition, ToolRegistry
from src.ai_orchestration.tools.candidate_bot_tools import (
    APPLICATION_STATUS_PERMISSION,
    PUBLIC_JOBS_PERMISSION,
    PUBLIC_KNOWLEDGE_PERMISSION,
    answer_candidate_knowledge,
    get_my_application_status,
    get_public_job_detail,
    get_public_job_units,
    search_candidate_knowledge,
    search_public_jobs,
)

logger = logging.getLogger(__name__)

_ALLOWED_TOOL_DEFINITIONS: list[ToolDefinition] = [
    ToolDefinition(
        name="search_public_jobs",
        domain="candidate_jobs",
        description="Lista vagas publicadas e seguras para o candidato.",
        required_permissions=[PUBLIC_JOBS_PERMISSION],
        read_only=True,
        requires_approval=False,
        fn=search_public_jobs,
    ),
    ToolDefinition(
        name="get_public_job_detail",
        domain="candidate_jobs",
        description="Retorna detalhes públicos de uma vaga publicada.",
        required_permissions=[PUBLIC_JOBS_PERMISSION],
        read_only=True,
        requires_approval=False,
        fn=get_public_job_detail,
    ),
    ToolDefinition(
        name="get_public_job_units",
        domain="candidate_jobs",
        description="Retorna postos/unidades públicos de uma vaga publicada.",
        required_permissions=[PUBLIC_JOBS_PERMISSION],
        read_only=True,
        requires_approval=False,
        fn=get_public_job_units,
    ),
    ToolDefinition(
        name="search_candidate_knowledge",
        domain="candidate_knowledge",
        description="Busca FAQ/base pública filtrada para audiência candidata.",
        required_permissions=[PUBLIC_KNOWLEDGE_PERMISSION],
        read_only=True,
        requires_approval=False,
        fn=search_candidate_knowledge,
    ),
    ToolDefinition(
        name="answer_candidate_knowledge",
        domain="candidate_knowledge",
        description="Responde com base no RAG público/candidato.",
        required_permissions=[PUBLIC_KNOWLEDGE_PERMISSION],
        read_only=True,
        requires_approval=False,
        fn=answer_candidate_knowledge,
    ),
    ToolDefinition(
        name="get_my_application_status",
        domain="candidate_portal",
        description="Retorna status público da candidatura do próprio candidato.",
        required_permissions=[APPLICATION_STATUS_PERMISSION],
        read_only=True,
        requires_approval=False,
        fn=get_my_application_status,
    ),
]

_ALLOWED_TOOL_NAMES = frozenset(tool.name for tool in _ALLOWED_TOOL_DEFINITIONS)

FORBIDDEN_FOR_CANDIDATE_MVP = frozenset(
    {
        "get_candidate_summary",
        "search_candidates",
        "get_candidate_profile_context",
        "get_candidate_resume_analysis_summary",
        "get_job_pipeline_overview",
        "get_candidate_pipeline_position",
        "get_candidate_pipeline_history",
        "search_pipeline_candidates",
        "get_admission_case_summary",
        "get_admission_checklist_status",
        "get_admission_documents_status",
        "get_admission_events_summary",
        "get_protheus_export_status",
        "move_pipeline_stage",
        "reject_candidate",
        "approve_candidate",
        "create_pre_admission",
        "export_to_protheus",
        "delete_candidate",
        "update_internal_notes",
        "search_knowledge",
        "answer_knowledge",
    }
)

_EXPECTED_CANDIDATE_TOOL_COUNT = len(_ALLOWED_TOOL_DEFINITIONS)


class CandidateBotRegistry(ToolRegistry):
    def get(self, name: str):  # type: ignore[override]
        tool = super().get(name)
        if tool is None:
            logger.warning(
                "candidate_bot_registry.tool_blocked",
                extra={
                    "tool_name": name,
                    "is_known_forbidden": name in FORBIDDEN_FOR_CANDIDATE_MVP,
                },
            )
        return tool


def build_candidate_bot_registry() -> CandidateBotRegistry:
    registry = CandidateBotRegistry()
    for tool_def in _ALLOWED_TOOL_DEFINITIONS:
        registry.register(tool_def)
    return registry


CANDIDATE_BOT_REGISTRY: CandidateBotRegistry = build_candidate_bot_registry()
