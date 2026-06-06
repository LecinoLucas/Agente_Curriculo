"""
Job Tools: Tools read-only de consulta para o Job Agent.

Fase AI-TOOLS-1 — implementação real usando JobService.

Permissão mínima para todas as tools: can_view_jobs
"""
from uuid import UUID

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.application.services.job_service import JobNotFoundError, JobService

_REQUIRED_PERMISSION = "can_view_jobs"
_LIMIT_MAX = 50


async def get_job_summary(
    context: AgentContext,
    job_id: str,
    job_service: JobService,
) -> ToolResult:
    """
    Retorna resumo estruturado de uma vaga.

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        job_service: JobService injetado pelo caller.

    Returns:
        ToolResult com id, title, status, area, seniority, location,
        work_model, mandatory_skills, nice_to_have_skills, created_at, updated_at.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        uuid = UUID(job_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"job_id inválido: {job_id!r}")

    try:
        job = await job_service.get(uuid)
        return ToolResult.success(
            data={
                "id": str(job.id),
                "title": job.title,
                "status": job.status,
                "area": job.job_area,
                "seniority": job.seniority_level,
                "location": job.location,
                "work_model": job.work_model,
                "mandatory_skills": list(job.mandatory_skills or []),
                "nice_to_have_skills": list(job.nice_to_have_skills or []),
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "updated_at": job.updated_at.isoformat() if job.updated_at else None,
            }
        )
    except JobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar vaga: {type(exc).__name__}")


async def search_jobs(
    context: AgentContext,
    job_service: JobService,
    query: str | None = None,
    status: str | None = None,
    area: str | None = None,
    limit: int = 10,
) -> ToolResult:
    """
    Busca vagas por critérios.

    Args:
        context: Contexto com permissões do usuário.
        job_service: JobService injetado pelo caller.
        query: Texto livre para busca (title/description).
        status: Filtro de status (draft, published, paused, closed...).
        area: Filtro de área da vaga.
        limit: Máximo de resultados (1–50).

    Returns:
        ToolResult com lista de vagas resumidas, total e quantidade retornada.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    capped_limit = max(1, min(limit, _LIMIT_MAX))

    try:
        jobs, total, _ = await job_service.list(
            page=1,
            page_size=capped_limit,
            search=query,
            status=status,
            job_area=area,
        )
        return ToolResult.success(
            data={
                "jobs": [
                    {
                        "id": str(j.id),
                        "title": j.title,
                        "status": j.status,
                        "area": j.job_area,
                        "seniority": j.seniority_level,
                        "location": j.location,
                    }
                    for j in jobs
                ],
                "total": total,
                "returned": len(jobs),
            }
        )
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao listar vagas: {type(exc).__name__}")


async def get_job_requirements(
    context: AgentContext,
    job_id: str,
    job_service: JobService,
) -> ToolResult:
    """
    Retorna os requisitos detalhados de uma vaga.

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        job_service: JobService injetado pelo caller.

    Returns:
        ToolResult com mandatory_skills, nice_to_have_skills, behavioral_requirements,
        screening_questions, deal_breakers, requirements, minimum_education_level,
        minimum_years_experience.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        uuid = UUID(job_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"job_id inválido: {job_id!r}")

    try:
        job = await job_service.get(uuid)
        min_exp = job.minimum_years_experience
        return ToolResult.success(
            data={
                "job_id": str(job.id),
                "title": job.title,
                "mandatory_skills": list(job.mandatory_skills or []),
                "nice_to_have_skills": list(job.nice_to_have_skills or []),
                "behavioral_requirements": list(job.behavioral_requirements or []),
                "screening_questions": list(job.screening_questions or []),
                "deal_breakers": list(job.deal_breakers or []),
                "requirements": job.requirements,
                "minimum_education_level": job.minimum_education_level,
                "minimum_years_experience": str(min_exp) if min_exp is not None else None,
            }
        )
    except JobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar requisitos da vaga: {type(exc).__name__}")


async def get_job_ai_draft_context(
    context: AgentContext,
    job_id: str,
    job_service: JobService,
) -> ToolResult:
    """
    Retorna contexto mínimo e seguro para análise ou melhoria de rascunho por IA.

    Exclui dados sensíveis (salário, responsável, datas internas).

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        job_service: JobService injetado pelo caller.

    Returns:
        ToolResult com título, descrição, requisitos, responsabilidades,
        contexto de experiência, skills, nível, modelo de trabalho, área,
        status, quality_score e quality_status.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        uuid = UUID(job_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"job_id inválido: {job_id!r}")

    try:
        job = await job_service.get(uuid)
        return ToolResult.success(
            data={
                "job_id": str(job.id),
                "title": job.title,
                "description": job.description,
                "requirements": job.requirements,
                "responsibilities": job.responsibilities,
                "experience_context": job.experience_context,
                "mandatory_skills": list(job.mandatory_skills or []),
                "nice_to_have_skills": list(job.nice_to_have_skills or []),
                "behavioral_requirements": list(job.behavioral_requirements or []),
                "seniority_level": job.seniority_level,
                "work_model": job.work_model,
                "job_area": job.job_area,
                "status": job.status,
                "quality_score": job.quality_score,
                "quality_status": job.quality_status,
            }
        )
    except JobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar contexto de draft da vaga: {type(exc).__name__}")
