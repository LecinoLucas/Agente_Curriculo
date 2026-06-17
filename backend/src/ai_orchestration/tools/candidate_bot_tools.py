"""
Candidate Bot Tools: allowlist segura para o portal do candidato.

Estas tools NÃO reutilizam o registry interno ATS/RH. Elas expõem apenas
consultas públicas/candidato e operam com permissões ``candidate_*``.
"""
from __future__ import annotations

from datetime import UTC, datetime
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
from src.application.services.candidate_application_service import CandidateApplicationService
from src.application.services.candidate_portal_service import (
    CandidatePortalIncompleteProfileError,
    CandidatePortalProfileConflictError,
    CandidatePortalService,
)
from src.domain.exceptions import ConflictException, NotFoundException, ValidationException
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobUnitModel
from src.infrastructure.database.models.operational_master_model import OperationalUnitModel
from src.infrastructure.repositories.sqlalchemy_candidate_application_repository import (
    SQLAlchemyCandidateApplicationRepository,
)
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.schemas.candidate_application_schemas import (
    CandidateApplicationCreateRequest,
)

PUBLIC_JOBS_PERMISSION = "candidate_read_public_jobs"
PUBLIC_KNOWLEDGE_PERMISSION = "candidate_read_public_knowledge"
APPLICATION_STATUS_PERMISSION = "candidate_read_application_status"
APPLICATION_WRITE_PERMISSION = "candidate_write_safe_application"

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


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_phone(phone: str | None) -> str | None:
    if phone is None:
        return None
    digits = "".join(ch for ch in phone if ch.isdigit())
    if not digits:
        return None
    if len(digits) < 10 or len(digits) > 11:
        raise ValidationException("Telefone inválido")
    return digits


async def create_candidate_application_from_bot(
    context: AgentContext,
    db_session,
    job_id: str,
    preferred_unit_id: str | None = None,
    candidate_name: str | None = None,
    contact_email: str | None = None,
    contact_phone: str | None = None,
    consent_given: bool = False,
    explicit_confirmation: bool = False,
    confirmation_requested_at: str | None = None,
) -> ToolResult:
    if denied := ToolPermissionGuard.enforce(context, APPLICATION_WRITE_PERMISSION):
        return denied

    if not explicit_confirmation or not confirmation_requested_at:
        return ToolResult.error(
            "CONFIRMATION_REQUIRED",
            "A candidatura só pode ser criada após confirmação explícita no contexto.",
        )

    try:
        candidate_id = UUID(context.user_id)
        job_uuid = UUID(job_id)
        preferred_unit_uuid = UUID(preferred_unit_id) if preferred_unit_id else None
    except ValueError:
        return ToolResult.error("INVALID_INPUT", "IDs informados são inválidos.")

    candidate = await db_session.scalar(
        sa.select(CandidateModel).where(
            CandidateModel.id == candidate_id,
            CandidateModel.deleted_at.is_(None),
        )
    )
    if candidate is None:
        return ToolResult.error("NOT_FOUND", "Candidato não encontrado.")

    resolved_name = _clean_optional_text(candidate_name) or _clean_optional_text(
        candidate.full_name
    )
    resolved_email = _clean_optional_text(contact_email) or _clean_optional_text(candidate.email)
    try:
        resolved_phone = _normalize_phone(contact_phone) or _normalize_phone(candidate.phone)
    except ValidationException as exc:
        return ToolResult.error("INVALID_INPUT", str(exc))

    if resolved_name is None:
        return ToolResult.error("MISSING_REQUIRED_DATA", "Nome é obrigatório.")
    if resolved_email is None and resolved_phone is None:
        return ToolResult.error(
            "MISSING_REQUIRED_DATA",
            "Telefone ou e-mail é obrigatório.",
        )
    if not consent_given:
        return ToolResult.error(
            "CONSENT_REQUIRED",
            "O uso dos dados precisa ser autorizado antes do envio.",
        )

    job = await db_session.scalar(
        sa.select(JobModel).where(
            JobModel.id == job_uuid,
            JobModel.status == "published",
            JobModel.deleted_at.is_(None),
        )
    )
    if job is None:
        return ToolResult.error("JOB_UNAVAILABLE", "Esta vaga não está mais disponível.")

    units_result = await db_session.execute(
        sa.select(OperationalUnitModel)
        .select_from(JobUnitModel)
        .join(OperationalUnitModel, OperationalUnitModel.id == JobUnitModel.operational_unit_id)
        .where(
            JobUnitModel.job_id == job_uuid,
            JobUnitModel.is_active.is_(True),
            OperationalUnitModel.is_active.is_(True),
        )
        .order_by(JobUnitModel.priority.asc().nullslast(), JobUnitModel.created_at.asc())
    )
    units = list(units_result.scalars().all())
    unit_by_id = {unit.id: unit for unit in units}
    selected_unit = unit_by_id.get(preferred_unit_uuid) if preferred_unit_uuid else None

    if len(units) >= 2 and selected_unit is None:
        return ToolResult.error(
            "UNIT_REQUIRED",
            "Essa vaga possui mais de uma unidade e exige uma escolha explícita.",
        )
    if len(units) == 1 and selected_unit is None:
        selected_unit = units[0]
    if preferred_unit_uuid is not None and selected_unit is None:
        return ToolResult.error(
            "INVALID_UNIT",
            "A unidade informada não está vinculada à vaga selecionada.",
        )

    candidate.full_name = resolved_name
    candidate.email = resolved_email
    candidate.phone = resolved_phone
    candidate.application_source = "bot"
    if candidate.lgpd_consent_at is None:
        candidate.lgpd_consent_at = datetime.now(UTC)
        candidate.lgpd_consent_version = "v1.0"

    application_service = CandidateApplicationService(
        db_session,
        SQLAlchemyCandidateApplicationRepository(db_session),
    )
    try:
        application = await application_service.create_application(
            CandidateApplicationCreateRequest(
                candidate_id=candidate_id,
                job_id=job_uuid,
                source="bot",
                status="submitted",
                preferred_location_group_id=(
                    selected_unit.location_group_id if selected_unit else None
                ),
                preferred_unit_id=selected_unit.id if selected_unit else None,
                accepts_any_unit_in_location=False,
                lgpd_consent_at=datetime.now(UTC),
                lgpd_consent_version="v1.0",
            )
        )
    except ConflictException:
        return ToolResult.error(
            "DUPLICATE_APPLICATION",
            "Já existe candidatura ativa para essa vaga.",
        )
    except NotFoundException as exc:
        return ToolResult.error("NOT_FOUND", str(exc))
    except ValidationException as exc:
        return ToolResult.error("INVALID_INPUT", str(exc))

    await db_session.flush()
    return ToolResult.success(
        data={
            "application_id": str(application.id),
            "job_id": str(job_uuid),
            "job_title": job.title,
            "preferred_unit_id": str(selected_unit.id) if selected_unit else None,
            "unit_name": (
                selected_unit.public_name
                or selected_unit.name
                if selected_unit is not None
                else None
            ),
        }
    )
