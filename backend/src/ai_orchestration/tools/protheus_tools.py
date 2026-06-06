"""
Protheus Tools: Tools read-only de consulta de status de exportação ERP.

Fase AI-TOOLS-4 — implementação real usando AdmissionPackageService.

Permissão mínima: can_view_protheus_status

Campos NUNCA retornados:
- AdmissionExportPackageModel.payload_json  (snapshot completo do ERP — sensível e volumoso)
- UUIDs de created_by / approved_by / exported_by (irrelevantes sem lookup de usuário)
"""
from uuid import UUID

from src.ai_orchestration.core.agent_context import AgentContext
from src.ai_orchestration.core.agent_result import ToolResult
from src.ai_orchestration.core.permission_guard import ToolPermissionGuard
from src.application.services.admission_package_service import AdmissionPackageService
from src.domain.exceptions import ValidationException

_REQUIRED_PERMISSION = "can_view_protheus_status"
_VALIDATION_ERRORS_MAX = 10


async def get_protheus_export_status(
    context: AgentContext,
    package_id: str,
    admission_package_service: AdmissionPackageService,
) -> ToolResult:
    """
    Retorna status do pacote de exportação Protheus/ERP de uma admissão.

    Retorna status, datas de aprovação/exportação/cancelamento e erros de
    validação (se houver). Nunca retorna o payload completo enviado ao ERP.

    Args:
        context: Contexto com permissões do usuário.
        package_id: UUID do pacote de exportação como string.
        admission_package_service: AdmissionPackageService injetado pelo caller.

    Returns:
        ToolResult com package_id, case_id, status, datas, validation_errors
        e flags de estado. Sem payload_json (dados do ERP).
    """
    if denied := ToolPermissionGuard.enforce(context, _REQUIRED_PERMISSION):
        return denied

    try:
        pkg_uuid = UUID(package_id)
    except ValueError:
        return ToolResult.error("INVALID_INPUT", f"package_id inválido: {package_id!r}")

    try:
        pkg = await admission_package_service.get_export_payload(pkg_uuid)

        validation_errors = pkg.validation_errors_json or []
        truncated = len(validation_errors) > _VALIDATION_ERRORS_MAX

        return ToolResult.success(
            data={
                "package_id": str(pkg.id),
                "case_id": str(pkg.case_id),
                "candidate_id": str(pkg.candidate_id),
                "job_id": str(pkg.job_id),
                "status": pkg.status,
                "has_validation_errors": bool(validation_errors),
                "validation_errors": validation_errors[:_VALIDATION_ERRORS_MAX],
                "validation_errors_truncated": truncated,
                "created_at": pkg.created_at.isoformat(),
                "updated_at": pkg.updated_at.isoformat(),
                "approved_at": pkg.approved_at.isoformat() if pkg.approved_at else None,
                "exported_at": pkg.exported_at.isoformat() if pkg.exported_at else None,
                "cancelled_at": pkg.cancelled_at.isoformat() if pkg.cancelled_at else None,
                # payload_json OMITIDO: contém dados completos do candidato para o ERP
                # created_by / approved_by / exported_by OMITIDOS: UUIDs sem lookup de nome
            }
        )
    except ValidationException as exc:
        return ToolResult.error("NOT_FOUND", f"Pacote de exportação '{package_id}' não encontrado ou inválido: {exc}")
    except Exception as exc:  # noqa: BLE001
        return ToolResult.error("INTERNAL_ERROR", f"Erro ao buscar status de exportação: {type(exc).__name__}")
