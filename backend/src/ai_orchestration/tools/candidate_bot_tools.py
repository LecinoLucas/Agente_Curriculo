"""
Candidate Bot Tools: allowlist segura para o portal do candidato.

Estas tools NÃO reutilizam o registry interno ATS/RH. Elas expõem apenas
consultas públicas/candidato e operam com permissões ``candidate_*``.
"""
from __future__ import annotations

from time import perf_counter
from uuid import UUID

import sqlalchemy as sa

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.ai_orchestration.rag.answer_schemas import RagAnswerRequest
from src.ai_orchestration.rag.rag_answer_service import RagAnswerService
from src.ai_orchestration.rag.retriever_contract import RetrieverContract
from src.ai_orchestration.rag.schemas import RetrievalQuery
from src.application.services.candidate_portal_service import (
    CandidatePortalIncompleteProfileError,
    CandidatePortalProfileConflictError,
    CandidatePortalService,
)
from src.infrastructure.database.models.job_model import JobModel, JobUnitModel
from src.infrastructure.database.models.operational_master_model import OperationalUnitModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository

PUBLIC_JOBS_PERMISSION = "candidate_read_public_jobs"
PUBLIC_KNOWLEDGE_PERMISSION = "candidate_read_public_knowledge"
APPLICATION_STATUS_PERMISSION = "candidate_read_application_status"

_LIMIT_MAX = 20


async def search_public_jobs(
    context: AgentContext,
    job_repository: SQLAlchemyJobRepository,
    query: str | None = None,
    limit: int = 10,
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, PUBLIC_JOBS_PERMISSION):
        return denied

    capped_limit = max(1, min(limit, _LIMIT_MAX))
    jobs, total, _summary = await job_repository.list_active(
        page=1,
        page_size=capped_limit,
        search=(query or "").strip() or None,
        status="published",
    )
    return ToolResult.success(
        data={
            "jobs": [
                {
                    "id": str(job.id),
                    "title": job.title,
                    "location": job.location,
                    "job_area": job.job_area,
                    "work_model": job.work_model,
                    "seniority_level": job.seniority_level,
                }
                for job in jobs
            ],
            "total": total,
            "returned": len(jobs),
        }
    )


async def get_public_job_detail(
    context: AgentContext,
    job_id: str,
    db_session,
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, PUBLIC_JOBS_PERMISSION):
        return denied

    try:
        job_uuid = UUID(job_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"job_id inválido: {job_id!r}")

    result = await db_session.execute(
        sa.select(JobModel).where(
            JobModel.id == job_uuid,
            JobModel.status == "published",
            JobModel.deleted_at.is_(None),
        )
    )
    job = result.scalar_one_or_none()
    if job is None:
        return ToolResult.error("NOT_FOUND", f"Vaga publicada '{job_id}' não encontrada.")

    units_result = await db_session.execute(
        sa.select(
            OperationalUnitModel.id,
            sa.func.coalesce(
                OperationalUnitModel.public_name,
                OperationalUnitModel.name,
            ).label("public_name"),
            OperationalUnitModel.city,
            OperationalUnitModel.state,
            OperationalUnitModel.address,
            OperationalUnitModel.reference_point,
        )
        .select_from(JobUnitModel)
        .join(OperationalUnitModel, OperationalUnitModel.id == JobUnitModel.operational_unit_id)
        .where(
            JobUnitModel.job_id == job_uuid,
            JobUnitModel.is_active.is_(True),
            OperationalUnitModel.is_active.is_(True),
        )
        .order_by(JobUnitModel.priority.asc().nullslast(), JobUnitModel.created_at.asc())
    )
    units = [
        {
            "id": str(row.id),
            "public_name": row.public_name,
            "city": row.city,
            "state": row.state,
            "address": row.address,
            "reference_point": row.reference_point,
        }
        for row in units_result.mappings().all()
    ]

    return ToolResult.success(
        data={
            "id": str(job.id),
            "title": job.title,
            "description": job.description,
            "requirements": job.requirements,
            "responsibilities": job.responsibilities,
            "location": job.location,
            "job_area": job.job_area,
            "work_model": job.work_model,
            "seniority_level": job.seniority_level,
            "benefits": list(job.benefits or []),
            "working_hours": job.working_hours,
            "published_at": job.published_at.isoformat() if job.published_at else None,
            "job_units": units,
        }
    )


async def get_public_job_units(
    context: AgentContext,
    job_id: str,
    db_session,
) -> ToolResult:
    detail = await get_public_job_detail(context, job_id, db_session)
    if not detail.ok:
        return detail
    assert isinstance(detail.data, dict)
    return ToolResult.success(
        data={
            "job_id": detail.data["id"],
            "job_units": detail.data["job_units"],
        }
    )


async def search_candidate_knowledge(
    context: AgentContext,
    query: str,
    candidate_retriever: RetrieverContract,
    limit: int = 5,
    filters: dict | None = None,
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, PUBLIC_KNOWLEDGE_PERMISSION):
        return denied

    clean_query = (query or "").strip()
    if not clean_query:
        return ToolResult.error("INVALID_INPUT", "A query de busca não pode estar vazia.")

    capped_limit = max(1, min(limit, _LIMIT_MAX))
    started_at = perf_counter()
    try:
        result = await candidate_retriever.retrieve(
            RetrievalQuery(
                query=clean_query,
                limit=capped_limit,
                filters=filters or {},
            )
        )
        return ToolResult.success(
            data={
                "query": result.query,
                "chunks": [
                    {
                        "chunk_id": chunk.chunk.id,
                        "document_id": chunk.chunk.document_id,
                        "source_title": chunk.chunk.source_title or "Sem título",
                        "content": chunk.chunk.content,
                        "score": chunk.score,
                        "metadata": dict(chunk.chunk.metadata),
                    }
                    for chunk in result.chunks
                ],
                "total": result.total,
                "warnings": list(result.warnings),
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
            }
        )
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error(
            "INTERNAL_ERROR",
            f"Erro ao consultar conhecimento público: {type(exc).__name__}",
        )


async def answer_candidate_knowledge(
    context: AgentContext,
    query: str,
    candidate_retriever: RetrieverContract,
    answer_service: RagAnswerService,
    limit: int = 5,
    filters: dict | None = None,
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, PUBLIC_KNOWLEDGE_PERMISSION):
        return denied

    clean_query = (query or "").strip()
    if not clean_query:
        return ToolResult.error("INVALID_INPUT", "A pergunta não pode estar vazia.")

    capped_limit = max(1, min(limit, _LIMIT_MAX))
    try:
        retrieval = await candidate_retriever.retrieve(
            RetrievalQuery(
                query=clean_query,
                limit=capped_limit,
                filters=filters or {},
            )
        )
        answer = await answer_service.synthesize_answer(
            RagAnswerRequest(
                query=clean_query,
                retrieved_chunks=[chunk.chunk for chunk in retrieval.chunks],
                max_chunks=capped_limit,
            )
        )
        if not answer.ok:
            return ToolResult.error(
                answer.error_code or "SYNTHESIS_ERROR",
                answer.message or "Falha ao sintetizar resposta.",
            )
        return ToolResult.success(
            data={
                "answer": answer.answer,
                "sources": [
                    {
                        "document_id": source.document_id,
                        "chunk_id": source.chunk_id,
                        "source_title": source.source_title,
                        "score": source.score,
                        "metadata": dict(source.metadata),
                    }
                    for source in answer.sources
                ],
                "warnings": list(set(list(retrieval.warnings) + list(answer.warnings))),
                "provider": answer.provider,
                "model": answer.model,
            }
        )
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error(
            "INTERNAL_ERROR",
            f"Erro ao responder conhecimento público: {type(exc).__name__}",
        )


async def get_my_application_status(
    context: AgentContext,
    candidate_portal_service: CandidatePortalService,
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, APPLICATION_STATUS_PERMISSION):
        return denied

    try:
        candidate_id = UUID(context.user_id)
    except ValueError:
        return ToolResult.error(
            "INVALID_CONTEXT",
            f"user_id do contexto candidato não é UUID válido: {context.user_id!r}",
        )

    try:
        overview = await candidate_portal_service.get_overview(candidate_id)
    except CandidatePortalIncompleteProfileError as exc:
        return ToolResult.error(
            "PROFILE_INCOMPLETE",
            f"Perfil do candidato incompleto: {', '.join(exc.missing_fields)}",
        )
    except CandidatePortalProfileConflictError:
        return ToolResult.error(
            "NOT_FOUND",
            "Não foi possível localizar o perfil do candidato.",
        )
    active_application = overview.active_application
    return ToolResult.success(
        data={
            "candidate_id": str(candidate_id),
            "application_status": overview.application_status,
            "status_public": overview.status_public,
            "current_process_status_label": overview.current_process_status_label,
            "can_request_contact": overview.can_request_contact,
            "requires_behavioral_assessment": overview.requires_behavioral_assessment,
            "active_application": (
                {
                    "pipeline_id": str(active_application.pipeline_id),
                    "job_id": str(active_application.job_id),
                    "job_title": active_application.job_title,
                    "pipeline_stage": active_application.pipeline_stage,
                    "status_public": active_application.status_public,
                }
                if active_application is not None
                else None
            ),
        }
    )
