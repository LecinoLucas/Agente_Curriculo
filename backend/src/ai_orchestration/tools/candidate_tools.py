"""
Candidate Tools: Tools read-only de consulta para o Candidate Agent.

Fase AI-TOOLS-2 — implementação real usando CandidateService.

Permissão mínima para todas as tools: can_view_candidates

Campos NUNCA retornados (LGPD / sensíveis):
- cpf, cpf_hash, cpf_last4
- salary_expectation
- password_hash, password_created_at
- google_sub, google_picture_url
- internal_notes
- lgpd_consent_at, lgpd_consent_version
- works_at_marajo_group
"""
from uuid import UUID

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.application.services.candidate_service import CandidateNotFoundError, CandidateService

_REQUIRED_PERMISSION = "can_view_candidates"
_LIMIT_MAX = 50


def _location_string(city: str | None, state: str | None, country: str | None) -> str | None:
    parts = [p for p in [city, state] if p]
    if country and country not in ("BR", "BRA"):
        parts.append(country)
    return ", ".join(parts) if parts else None


async def get_candidate_summary(
    context: AgentContext,
    candidate_id: str,
    candidate_service: CandidateService,
) -> ToolResult:
    """
    Retorna resumo estruturado de um candidato.

    Dados omitidos: CPF, salary_expectation, password, google_sub,
    internal_notes, lgpd_consent e demais campos sensíveis.

    Args:
        context: Contexto com permissões do usuário.
        candidate_id: UUID do candidato como string.
        candidate_service: CandidateService injetado pelo caller.

    Returns:
        ToolResult com id, full_name, email, phone, location, tags,
        application_source, data_quality_status, created_at, updated_at.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        uuid = UUID(candidate_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"candidate_id inválido: {candidate_id!r}")

    try:
        candidate = await candidate_service.get(uuid)
        return ToolResult.success(
            data={
                "id": str(candidate.id),
                "full_name": candidate.full_name,
                "email": candidate.email,
                "phone": candidate.phone,
                "location": _location_string(
                    candidate.location_city,
                    candidate.location_state,
                    candidate.location_country,
                ),
                "location_city": candidate.location_city,
                "location_state": candidate.location_state,
                "location_country": candidate.location_country,
                "tags": list(candidate.tags or []),
                "application_source": candidate.application_source,
                "data_quality_status": candidate.data_quality_status,
                "created_at": candidate.created_at.isoformat() if candidate.created_at else None,
                "updated_at": candidate.updated_at.isoformat() if candidate.updated_at else None,
            }
        )
    except CandidateNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Candidato '{candidate_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar candidato: {type(exc).__name__}")


async def search_candidates(
    context: AgentContext,
    candidate_service: CandidateService,
    query: str | None = None,
    seniority: str | None = None,
    has_resume: bool | None = None,
    limit: int = 10,
) -> ToolResult:
    """
    Busca candidatos por critérios.

    Campos omitidos no resultado: CPF, salary_expectation, phone, password.

    Args:
        context: Contexto com permissões do usuário.
        candidate_service: CandidateService injetado pelo caller.
        query: Texto livre para busca por nome ou email.
        seniority: Filtro de senioridade.
        has_resume: True para candidatos com currículo, False para sem, None para todos.
        limit: Máximo de resultados (1–50).

    Returns:
        ToolResult com lista de candidatos resumidos, total e quantidade retornada.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    capped_limit = max(1, min(limit, _LIMIT_MAX))

    try:
        items, total = await candidate_service.list_summaries(
            page=1,
            page_size=capped_limit,
            search=query,
            has_resume=has_resume,
            seniority=seniority,
        )
        return ToolResult.success(
            data={
                "candidates": [
                    {
                        "id": str(c.id),
                        "full_name": c.full_name,
                        "email": c.email,
                        "resume_count": c.resume_count,
                        "ai_status": c.ai_status,
                        "active_job_title": c.active_job_title,
                        "active_job_stage": c.active_job_stage,
                        "active_job_fit_score": c.active_job_job_fit_score,
                        "tags": list(c.tags or []),
                    }
                    for c in items
                ],
                "total": total,
                "returned": len(items),
            }
        )
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao listar candidatos: {type(exc).__name__}")


async def get_candidate_profile_context(
    context: AgentContext,
    candidate_id: str,
    candidate_service: CandidateService,
) -> ToolResult:
    """
    Retorna contexto de perfil profissional seguro para uso por IA.

    Inclui links públicos (LinkedIn, GitHub, portfólio), tags capturadas
    e preferências profissionais. Não inclui currículo bruto nem dados
    sensíveis (CPF, salário, senha, dados Google, notes internas).

    Args:
        context: Contexto com permissões do usuário.
        candidate_id: UUID do candidato como string.
        candidate_service: CandidateService injetado pelo caller.

    Returns:
        ToolResult com perfil profissional seguro para análise por IA.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        uuid = UUID(candidate_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"candidate_id inválido: {candidate_id!r}")

    try:
        candidate = await candidate_service.get(uuid)
        return ToolResult.success(
            data={
                "candidate_id": str(candidate.id),
                "full_name": candidate.full_name,
                "location_city": candidate.location_city,
                "location_state": candidate.location_state,
                "location_country": candidate.location_country,
                "linkedin_url": candidate.linkedin_url,
                "github_url": candidate.github_url,
                "portfolio_url": candidate.portfolio_url,
                "tags": list(candidate.tags or []),
                "desired_contract_type": candidate.desired_contract_type,
                "application_source": candidate.application_source,
                "data_quality_status": candidate.data_quality_status,
                "has_resume": candidate.data_quality_status not in ("no_resume", "unknown"),
                "resume_parseable": candidate.data_quality_status in ("valid",),
            }
        )
    except CandidateNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Candidato '{candidate_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar perfil do candidato: {type(exc).__name__}")


async def get_candidate_resume_analysis_summary(
    context: AgentContext,
    candidate_id: str,
    candidate_service: CandidateService,
) -> ToolResult:
    """
    Retorna resumo seguro do status de análise IA do currículo do candidato.

    Não retorna o texto bruto do currículo. Retorna apenas status, qualidade
    de dados e diagnóstico de parseabilidade — suficiente para que um agente
    decida se pode prosseguir com análise de matching ou triagem.

    Args:
        context: Contexto com permissões do usuário.
        candidate_id: UUID do candidato como string.
        candidate_service: CandidateService injetado pelo caller.

    Returns:
        ToolResult com data_quality_status, data_quality_reason,
        has_resume, resume_parseable, analysis_checked_at.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        uuid = UUID(candidate_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"candidate_id inválido: {candidate_id!r}")

    try:
        candidate = await candidate_service.get(uuid)
        status = candidate.data_quality_status
        return ToolResult.success(
            data={
                "candidate_id": str(candidate.id),
                "full_name": candidate.full_name,
                "analysis_status": status,
                "analysis_reason": candidate.data_quality_reason,
                "analysis_checked_at": (
                    candidate.data_quality_marked_at.isoformat()
                    if candidate.data_quality_marked_at
                    else None
                ),
                "has_resume": status not in ("no_resume",),
                "resume_parseable": status == "valid",
                "resume_raw_text_available": False,
            }
        )
    except CandidateNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Candidato '{candidate_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar resumo de análise: {type(exc).__name__}")
