"""
Pipeline Tools: Tools read-only de consulta para o Pipeline Agent.

Fase AI-TOOLS-3 — implementação real usando PipelineService.

Permissão mínima para todas as tools: can_view_pipeline

Campos NUNCA retornados:
- StageTransition.notes  (texto livre de recrutador — potencialmente sensível)
- StageTransition.moved_by UUID (desnecessário sem contexto de usuário; kept: moved_by_name)
"""
from uuid import UUID

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.application.services.pipeline_service import (
    STAGE_CONFIG,
    STAGE_LABELS,
    PipelineCandidateNotFoundError,
    PipelineEntryNotFoundError,
    PipelineJobNotFoundError,
    PipelineService,
)

_REQUIRED_PERMISSION = "can_view_pipeline"
_LIMIT_MAX = 50


def _stage_order(stage: str) -> int:
    cfg = STAGE_CONFIG.get(stage)
    return cfg.order if cfg is not None else 99


def _stage_is_terminal(stage: str) -> bool:
    cfg = STAGE_CONFIG.get(stage)
    return cfg.is_terminal if cfg is not None else False


async def get_job_pipeline_overview(
    context: AgentContext,
    job_id: str,
    pipeline_service: PipelineService,
) -> ToolResult:
    """
    Retorna visão geral do pipeline de uma vaga: etapas, contagens e gargalos.

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        pipeline_service: PipelineService injetado pelo caller.

    Returns:
        ToolResult com job_id, total_candidates, stage_summary (por etapa),
        bottleneck_stage (etapa ativa com mais candidatos) e flag truncated.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        j_uuid = UUID(job_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"job_id inválido: {job_id!r}")

    try:
        board = await pipeline_service.get_board(j_uuid)

        stage_summary = []
        total = 0
        for col in board.columns:
            count = len(col.candidates)
            total += count
            stage_summary.append({
                "stage": col.stage,
                "label": col.label,
                "count": count,
                "stage_order": _stage_order(col.stage),
                "is_terminal": _stage_is_terminal(col.stage),
            })

        active_with_candidates = [
            s for s in stage_summary
            if not s["is_terminal"] and s["count"] > 0
        ]
        bottleneck = (
            max(active_with_candidates, key=lambda s: s["count"])["stage"]
            if active_with_candidates
            else None
        )

        return ToolResult.success(
            data={
                "job_id": str(board.job_id),
                "total_candidates": total,
                "truncated": board.truncated,
                "stage_summary": stage_summary,
                "bottleneck_stage": bottleneck,
            }
        )
    except PipelineJobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada no pipeline.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar overview do pipeline: {type(exc).__name__}")


async def get_candidate_pipeline_position(
    context: AgentContext,
    job_id: str,
    candidate_id: str,
    pipeline_service: PipelineService,
) -> ToolResult:
    """
    Retorna a posição atual de um candidato no pipeline de uma vaga.

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        candidate_id: UUID do candidato como string.
        pipeline_service: PipelineService injetado pelo caller.

    Returns:
        ToolResult com current_stage, stage_label, stage_order,
        is_terminal_stage, status, entered_at, updated_at.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        j_uuid = UUID(job_id)
        c_uuid = UUID(candidate_id)
    except ValueError as exc:
        return ToolResult.error("INVALID_INPUT", f"UUID inválido: {exc}")

    try:
        history = await pipeline_service.get_candidate_history(c_uuid, j_uuid)
        stage = history.current_stage
        return ToolResult.success(
            data={
                "candidate_id": str(history.candidate_id),
                "candidate_name": history.candidate_name,
                "job_id": str(history.job_id),
                "job_title": history.job_title,
                "current_stage": stage,
                "stage_label": STAGE_LABELS.get(stage, stage),
                "stage_order": _stage_order(stage),
                "is_terminal_stage": _stage_is_terminal(stage),
                "status": history.status,
                "entered_at": history.entered_at.isoformat() if history.entered_at else None,
                "updated_at": history.updated_at.isoformat(),
            }
        )
    except PipelineJobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada no pipeline.")
    except PipelineCandidateNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Candidato '{candidate_id}' não encontrado.")
    except PipelineEntryNotFoundError:
        return ToolResult.error(
            "NOT_FOUND",
            f"Candidato '{candidate_id}' não está no pipeline da vaga '{job_id}'.",
        )
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar posição no pipeline: {type(exc).__name__}")


async def get_candidate_pipeline_history(
    context: AgentContext,
    job_id: str,
    candidate_id: str,
    pipeline_service: PipelineService,
) -> ToolResult:
    """
    Retorna o histórico de movimentações de um candidato no pipeline.

    Notas internas das transições (campo 'notes') são omitidas — podem
    conter texto sensível escrito por recrutadores.

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        candidate_id: UUID do candidato como string.
        pipeline_service: PipelineService injetado pelo caller.

    Returns:
        ToolResult com current_stage, status e lista de transições
        (from_stage, to_stage, moved_by_name, moved_at, trigger, reason).
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        j_uuid = UUID(job_id)
        c_uuid = UUID(candidate_id)
    except ValueError as exc:
        return ToolResult.error("INVALID_INPUT", f"UUID inválido: {exc}")

    try:
        history = await pipeline_service.get_candidate_history(c_uuid, j_uuid)
        transitions = [
            {
                "from_stage": t.from_stage,
                "to_stage": t.to_stage,
                "moved_by_name": t.moved_by_name,
                "moved_at": t.moved_at.isoformat(),
                "trigger": t.trigger,
                "reason": t.reason,
                # notes omitido: texto livre potencialmente sensível
            }
            for t in history.transitions
        ]
        return ToolResult.success(
            data={
                "candidate_id": str(history.candidate_id),
                "candidate_name": history.candidate_name,
                "job_id": str(history.job_id),
                "job_title": history.job_title,
                "current_stage": history.current_stage,
                "stage_label": STAGE_LABELS.get(history.current_stage, history.current_stage),
                "status": history.status,
                "entered_at": history.entered_at.isoformat() if history.entered_at else None,
                "updated_at": history.updated_at.isoformat(),
                "transitions": transitions,
                "transitions_count": len(transitions),
            }
        )
    except PipelineJobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada no pipeline.")
    except PipelineCandidateNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Candidato '{candidate_id}' não encontrado.")
    except PipelineEntryNotFoundError:
        return ToolResult.error(
            "NOT_FOUND",
            f"Candidato '{candidate_id}' não está no pipeline da vaga '{job_id}'.",
        )
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar histórico de pipeline: {type(exc).__name__}")


async def search_pipeline_candidates(
    context: AgentContext,
    job_id: str,
    pipeline_service: PipelineService,
    stage: str | None = None,
    query: str | None = None,
    limit: int = 10,
) -> ToolResult:
    """
    Busca candidatos no pipeline de uma vaga com filtragem opcional por etapa e nome.

    Filtros de etapa e query são aplicados no lado da aplicação sobre o
    resultado do PipelineService (sem repository direto).

    Args:
        context: Contexto com permissões do usuário.
        job_id: UUID da vaga como string.
        pipeline_service: PipelineService injetado pelo caller.
        stage: Filtro de etapa (ex: "screening", "hr_interview").
        query: Texto livre para busca por nome do candidato.
        limit: Máximo de resultados (1–50).

    Returns:
        ToolResult com lista de candidatos resumidos, returned e job_id.
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        j_uuid = UUID(job_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"job_id inválido: {job_id!r}")

    capped_limit = max(1, min(limit, _LIMIT_MAX))

    try:
        # Load a broad set from the service; filtering happens below.
        fetch_size = capped_limit if (stage is None and query is None) else _LIMIT_MAX
        matches = await pipeline_service.list_job_matches(j_uuid, max_rows=fetch_size)

        if stage is not None:
            matches = [m for m in matches if m.stage == stage]

        if query is not None:
            q_lower = query.lower()
            matches = [m for m in matches if q_lower in m.candidate_name.lower()]

        matches = matches[:capped_limit]

        return ToolResult.success(
            data={
                "job_id": job_id,
                "candidates": [
                    {
                        "candidate_id": str(m.candidate_id),
                        "candidate_name": m.candidate_name,
                        "stage": m.stage,
                        "stage_label": STAGE_LABELS.get(m.stage, m.stage),
                        "status": m.status,
                        "candidate_status": m.candidate_status,
                        "ai_status": m.ai_status,
                        "job_fit_score": float(m.job_fit_score) if m.job_fit_score is not None else None,
                        "top_skills": list(m.top_skills or []),
                        "entered_at": m.entered_at.isoformat() if m.entered_at else None,
                        "updated_at": m.updated_at.isoformat(),
                    }
                    for m in matches
                ],
                "returned": len(matches),
            }
        )
    except PipelineJobNotFoundError:
        return ToolResult.error("NOT_FOUND", f"Vaga '{job_id}' não encontrada no pipeline.")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar candidatos no pipeline: {type(exc).__name__}")
