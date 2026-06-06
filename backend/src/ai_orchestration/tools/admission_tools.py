"""
Admission Tools: Tools read-only de consulta para o Admission Agent.

Fase AI-TOOLS-4 — implementação real usando AdmissionCaseWorkspaceService.

Permissão mínima para todas as tools: can_view_admissions

Campos NUNCA retornados:
- AdmissionDocumentSummarySchema.review_notes  (notas internas do revisor)
- Arquivo bruto / bytes de documentos
- OCR / texto bruto de documentos
"""
from uuid import UUID

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.application.services.admission_case_workspace_service import AdmissionCaseWorkspaceService
from src.domain.exceptions import NotFoundException

_REQUIRED_PERMISSION = "can_view_admissions"
_EVENTS_PAGE_SIZE_MAX = 50


async def get_admission_case_summary(
    context: AgentContext,
    admission_case_id: str,
    admission_service: AdmissionCaseWorkspaceService,
) -> ToolResult:
    """
    Retorna resumo operacional de um caso de admissão.

    Inclui status, progresso, bloqueio principal, próxima ação e status de
    integração ERP. Não inclui dados financeiros sigilosos nem notas internas.

    Args:
        context: Contexto com permissões do usuário.
        admission_case_id: UUID do caso de admissão como string.
        admission_service: AdmissionCaseWorkspaceService injetado pelo caller.

    Returns:
        ToolResult com case_id, status, progresso, integration_status,
        main_blocker, next_action, responsible_name e datas.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        case_uuid = UUID(admission_case_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"admission_case_id inválido: {admission_case_id!r}")

    try:
        overview = await admission_service.get_overview(case_id=case_uuid)
        prog = overview.progress
        integ = overview.integration_status
        return ToolResult.success(
            data={
                "case_id": str(overview.case.id),
                "status": overview.case.status,
                "current_stage": overview.case.current_stage,
                "status_label": overview.status_label,
                "candidate_id": str(overview.candidate.id),
                "candidate_name": overview.candidate.name,
                "job_id": str(overview.job.id),
                "job_title": overview.job.title,
                "ready_for_export": overview.summary.ready_for_export,
                "readiness_status": overview.summary.readiness_status,
                "responsible_name": overview.summary.responsible_name,
                "progress": {
                    "total": prog.total,
                    "approved": prog.approved,
                    "pending": prog.pending,
                    "rejected": prog.rejected,
                    "in_review": prog.in_review,
                    "waived": prog.waived,
                },
                "integration_status": {
                    "state": integ.state,
                    "label": integ.label,
                    "ready_for_export": integ.ready_for_export,
                },
                "main_blocker": (
                    {
                        "type": overview.main_blocker.type,
                        "severity": overview.main_blocker.severity,
                        "title": overview.main_blocker.title,
                        "description": overview.main_blocker.description,
                        "action": overview.main_blocker.action,
                    }
                    if overview.main_blocker
                    else None
                ),
                "next_action": (
                    {
                        "type": overview.next_action.type,
                        "label": overview.next_action.label,
                        "enabled": overview.next_action.enabled,
                    }
                    if overview.next_action
                    else None
                ),
                "created_at": overview.case.created_at.isoformat(),
                "updated_at": overview.updated_at.isoformat(),
            }
        )
    except NotFoundException:
        return ToolResult.error("NOT_FOUND", f"Caso de admissão '{admission_case_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar resumo do caso: {type(exc).__name__}")


async def get_admission_checklist_status(
    context: AgentContext,
    admission_case_id: str,
    admission_service: AdmissionCaseWorkspaceService,
) -> ToolResult:
    """
    Retorna status do checklist de pré-admissão com contagens e itens resumidos.

    Não inclui notas internas de itens. Inclui apenas status operacional de
    cada item (título, status, obrigatório, posição).

    Args:
        context: Contexto com permissões do usuário.
        admission_case_id: UUID do caso de admissão como string.
        admission_service: AdmissionCaseWorkspaceService injetado pelo caller.

    Returns:
        ToolResult com contagens por status e lista de itens resumidos.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        case_uuid = UUID(admission_case_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"admission_case_id inválido: {admission_case_id!r}")

    try:
        workspace = await admission_service.get_workspace(case_id=case_uuid)
        checklist = workspace.checklist
        items = checklist.items

        not_required_count = sum(
            1 for i in items if i.status in ("waived", "not_required")
        )
        rejected_count = sum(
            1 for i in items if i.status in ("rejected", "correction_needed", "blocked")
        )

        return ToolResult.success(
            data={
                "case_id": admission_case_id,
                "total_items": checklist.total,
                "approved_count": checklist.approved,
                "pending_count": checklist.pending,
                "blocked_count": checklist.blocked,
                "rejected_count": rejected_count,
                "not_required_count": not_required_count,
                "items": [
                    {
                        "id": str(i.id),
                        "title": i.title,
                        "status": i.status,
                        "required": i.required,
                        "position": i.position,
                        "updated_at": i.updated_at.isoformat(),
                        # updated_by_name omitido — desnecessário para o agente
                    }
                    for i in items
                ],
            }
        )
    except NotFoundException:
        return ToolResult.error("NOT_FOUND", f"Caso de admissão '{admission_case_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar checklist: {type(exc).__name__}")


async def get_admission_documents_status(
    context: AgentContext,
    admission_case_id: str,
    admission_service: AdmissionCaseWorkspaceService,
) -> ToolResult:
    """
    Retorna status dos documentos de pré-admissão.

    Inclui nome do arquivo, tipo, status, data de envio e motivo de rejeição
    público. Não inclui conteúdo de arquivo, OCR, texto bruto nem notas
    internas do revisor (review_notes).

    Args:
        context: Contexto com permissões do usuário.
        admission_case_id: UUID do caso de admissão como string.
        admission_service: AdmissionCaseWorkspaceService injetado pelo caller.

    Returns:
        ToolResult com resumo do checklist e lista de documentos sem dados brutos.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        case_uuid = UUID(admission_case_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"admission_case_id inválido: {admission_case_id!r}")

    try:
        docs_response = await admission_service.get_documents(case_id=case_uuid)
        checklist = docs_response.checklist

        return ToolResult.success(
            data={
                "case_id": admission_case_id,
                "checklist_summary": {
                    "total": checklist.total,
                    "approved": checklist.approved,
                    "pending": checklist.pending,
                    "blocked": checklist.blocked,
                },
                "documents": [
                    {
                        "id": str(d.id),
                        "checklist_item_id": str(d.checklist_item_id),
                        "checklist_title": d.checklist_title,
                        "required": d.required,
                        "filename": d.filename,
                        "document_type": d.document_type,
                        "mime_type": d.mime_type,
                        "size_bytes": d.size_bytes,
                        "status": d.status,
                        "uploaded_at": d.uploaded_at.isoformat(),
                        "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                        "reviewed_by_name": d.reviewed_by_name,
                        "rejection_reason_public": d.rejection_reason_public,
                        "approved_at": d.approved_at.isoformat() if d.approved_at else None,
                        "is_current_for_item": d.is_current_for_item,
                        # review_notes OMITIDO: notas internas do revisor
                        # bytes/conteúdo OMITIDOS: nunca retornar documento bruto
                    }
                    for d in docs_response.documents
                ],
                "total_documents": len(docs_response.documents),
            }
        )
    except NotFoundException:
        return ToolResult.error("NOT_FOUND", f"Caso de admissão '{admission_case_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar documentos: {type(exc).__name__}")


async def get_admission_events_summary(
    context: AgentContext,
    admission_case_id: str,
    admission_service: AdmissionCaseWorkspaceService,
    page: int = 1,
    page_size: int = 20,
) -> ToolResult:
    """
    Retorna histórico de eventos do caso de admissão.

    Os eventos são apresentados já processados pelo serviço (tipo, título,
    descrição, ator). Nenhum payload interno de evento é exposto.

    Args:
        context: Contexto com permissões do usuário.
        admission_case_id: UUID do caso de admissão como string.
        admission_service: AdmissionCaseWorkspaceService injetado pelo caller.
        page: Número da página (padrão: 1).
        page_size: Eventos por página (1–50, padrão: 20).

    Returns:
        ToolResult com lista de eventos, total e paginação.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        case_uuid = UUID(admission_case_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"admission_case_id inválido: {admission_case_id!r}")

    capped_page_size = max(1, min(page_size, _EVENTS_PAGE_SIZE_MAX))

    try:
        events_response = await admission_service.get_events(
            case_id=case_uuid,
            page=max(1, page),
            page_size=capped_page_size,
        )
        return ToolResult.success(
            data={
                "case_id": admission_case_id,
                "events": [
                    {
                        "id": str(e.id),
                        "type": e.type,
                        "title": e.title,
                        "description": e.description,
                        "actor_name": e.actor_name,
                        "created_at": e.created_at.isoformat(),
                        # payload_json OMITIDO: dados internos do evento
                    }
                    for e in events_response.items
                ],
                "total": events_response.total,
                "page": events_response.page,
                "page_size": events_response.page_size,
                "has_next": events_response.has_next,
            }
        )
    except NotFoundException:
        return ToolResult.error("NOT_FOUND", f"Caso de admissão '{admission_case_id}' não encontrado.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar eventos: {type(exc).__name__}")
