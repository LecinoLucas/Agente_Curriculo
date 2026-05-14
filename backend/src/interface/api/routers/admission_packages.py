"""Router for admission export packages — manual, auditable ERP integration."""

import csv
import io
import json
from uuid import UUID

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admission_package_service import AdmissionPackageService
from src.application.services.erp_integration_service import ErpIntegrationService
from src.domain.exceptions import ValidationException
from src.interface.api.dependencies import RecruiterHrOrAdmin, get_db
from src.interface.api.routers.communication_events import notify_candidate_event_safely
from src.interface.api.schemas.admission_package_schemas import (
    AdmissionPackageApproveRequest,
    AdmissionPackageCancelRequest,
    AdmissionPackageResponse,
    AdmissionPackageCreateRequest,
    ErpIntegrationAttemptListResponse,
    ErpIntegrationAttemptResponse,
    ProtheusMockSendRequest,
    ErpRetryRequest,
)

router = APIRouter(tags=["admission-packages"])


def _service(db: AsyncSession) -> AdmissionPackageService:
    return AdmissionPackageService(db)


def _erp_service(db: AsyncSession) -> ErpIntegrationService:
    return ErpIntegrationService(db)


def _to_response(package) -> AdmissionPackageResponse:
    return AdmissionPackageResponse.model_validate(
        {
            "id": str(package.id),
            "case_id": str(package.case_id),
            "candidate_id": str(package.candidate_id),
            "job_id": str(package.job_id),
            "status": package.status,
            "payload": package.payload_json,
            "validation_errors": package.validation_errors_json,
            "created_by": str(package.created_by) if package.created_by else None,
            "approved_by": str(package.approved_by) if package.approved_by else None,
            "exported_by": str(package.exported_by) if package.exported_by else None,
            "created_at": package.created_at,
            "updated_at": package.updated_at,
            "approved_at": package.approved_at,
            "exported_at": package.exported_at,
            "cancelled_at": package.cancelled_at,
        }
    )


def _to_attempt_response(attempt) -> ErpIntegrationAttemptResponse:
    return ErpIntegrationAttemptResponse.model_validate(
        {
            "id": str(attempt.id),
            "package_id": str(attempt.package_id),
            "case_id": str(attempt.case_id),
            "candidate_id": str(attempt.candidate_id),
            "job_id": str(attempt.job_id),
            "provider": attempt.provider,
            "mode": attempt.mode,
            "status": attempt.status,
            "idempotency_key": attempt.idempotency_key,
            "external_reference": attempt.external_reference,
            "http_status": attempt.http_status,
            "request_headers_json": attempt.request_headers_json,
            "response_headers_json": attempt.response_headers_json,
            "attempt_number": attempt.attempt_number,
            "request_payload_json": attempt.request_payload_json,
            "response_payload_json": attempt.response_payload_json,
            "validation_errors_json": attempt.validation_errors_json,
            "error_message": attempt.error_message,
            "attempted_by": str(attempt.attempted_by) if attempt.attempted_by else None,
            "created_at": attempt.created_at,
            "updated_at": attempt.updated_at,
            "completed_at": attempt.completed_at,
        }
    )


@router.post(
    "/pre-admission/{case_id}/admission-package",
    response_model=AdmissionPackageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_admission_package(
    case_id: UUID,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdmissionPackageResponse:
    """Create or retrieve admission export package for case."""
    try:
        package = await _service(db).create_package(case_id, user_id=current_user.id)
        await db.commit()
        return _to_response(package)
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/pre-admission/{case_id}/admission-package",
    response_model=AdmissionPackageResponse | None,
)
async def get_admission_package(
    case_id: UUID,
    _current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdmissionPackageResponse | None:
    """Retrieve admission package for case (null if not created)."""
    package = await _service(db).repository.get_by_case_id(case_id)
    if not package:
        return None
    return _to_response(package)


@router.post(
    "/admission-packages/{package_id}/approve",
    response_model=AdmissionPackageResponse,
)
async def approve_admission_package(
    package_id: UUID,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdmissionPackageResponse:
    """Approve admission package for export."""
    try:
        package = await _service(db).approve_package(package_id, user_id=current_user.id)
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="admission_package_approved",
            candidate_id=package.candidate_id,
            job_id=package.job_id,
            related_entity_type="admission_package",
            related_entity_id=package.id,
            actor_id=current_user.id,
        )
        return _to_response(package)
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission-packages/{package_id}/cancel",
    response_model=AdmissionPackageResponse,
)
async def cancel_admission_package(
    package_id: UUID,
    _current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> AdmissionPackageResponse:
    """Cancel admission package."""
    try:
        package = await _service(db).cancel_package(package_id, reason=None)
        await db.commit()
        return _to_response(package)
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/admission-packages/{package_id}/export-json",
    response_class=Response,
)
async def export_package_json(
    package_id: UUID,
    _current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export admission package as JSON."""
    try:
        package = await _service(db).get_export_payload(package_id, user_id=_current_user.id)
        await db.commit()
        return Response(
            content=json.dumps(package.payload_json, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="admission-package-{package_id}.json"'},
        )
    except ValidationException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/admission-packages/{package_id}/export-csv",
    response_class=Response,
)
async def export_package_csv(
    package_id: UUID,
    _current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Export admission package as CSV."""
    try:
        package = await _service(db).get_export_payload(package_id, user_id=_current_user.id)
        await db.commit()

        # Build CSV from payload
        p = package.payload_json
        rows = [
            ("Campo", "Valor"),
            ("", ""),
            ("CANDIDATO", ""),
            ("Nome", p.get("candidate", {}).get("full_name", "")),
            ("Email", p.get("candidate", {}).get("email", "")),
            ("Telefone", p.get("candidate", {}).get("phone", "")),
            ("CPF", p.get("candidate", {}).get("cpf", "")),
            ("", ""),
            ("VAGA", ""),
            ("Título", p.get("job", {}).get("title", "")),
            ("Empresa", p.get("job", {}).get("company", "")),
            ("", ""),
            ("PRÉ-ADMISSÃO", ""),
            ("Data de Início", p.get("pre_admission", {}).get("start_date", "")),
            ("Salário Ofertado", p.get("pre_admission", {}).get("salary_offer", "")),
            ("Regime", p.get("pre_admission", {}).get("work_model", "")),
            ("", ""),
            ("DECISÃO", ""),
            ("Resultado", p.get("decision", {}).get("decision_outcome", "")),
            ("Motivo", p.get("decision", {}).get("reason_code", "")),
            ("", ""),
            ("DOCUMENTOS", ""),
            ("Quantidade", len(p.get("documents", []))),
            ("Aprovados", sum(1 for d in p.get("documents", []) if d.get("status") == "approved")),
        ]

        buf = io.StringIO()
        csv.writer(buf).writerows(rows)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="admission-package-{package_id}.csv"'},
        )
    except ValidationException:
        await db.rollback()
        raise


@router.post(
    "/admission-packages/{package_id}/erp/protheus/dry-run",
    response_model=ErpIntegrationAttemptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_protheus_dry_run_attempt(
    package_id: UUID,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptResponse:
    try:
        attempt = await _erp_service(db).create_protheus_dry_run_attempt(
            package_id=package_id,
            user_id=current_user.id,
        )
        await db.commit()
        return _to_attempt_response(attempt)
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission-packages/{package_id}/erp/protheus/mock-send",
    response_model=ErpIntegrationAttemptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_protheus_mock_send_attempt(
    package_id: UUID,
    payload: ProtheusMockSendRequest,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptResponse:
    try:
        attempt = await _erp_service(db).create_protheus_mock_attempt(
            package_id=package_id,
            user_id=current_user.id,
            simulate_failure=payload.simulate_failure,
        )
        await db.commit()
        return _to_attempt_response(attempt)
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/admission-packages/{package_id}/erp/protheus/homolog-send",
    response_model=ErpIntegrationAttemptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_protheus_homolog_send_attempt(
    package_id: UUID,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptResponse:
    """Send to real Protheus in homologation environment.

    Security gates enforced:
    - Only in development/staging (APP_ENV != production)
    - Requires ERP_ALLOW_REAL_SEND=true
    - All requests idempotent via idempotency_key
    - Audit logged with masked secrets
    """
    try:
        attempt = await _erp_service(db).create_protheus_homolog_attempt(
            package_id=package_id,
            user_id=current_user.id,
        )
        await db.commit()
        return _to_attempt_response(attempt)
    except Exception:
        await db.rollback()
        raise


@router.get(
    "/admission-packages/{package_id}/erp/attempts",
    response_model=ErpIntegrationAttemptListResponse,
)
async def list_protheus_attempts(
    package_id: UUID,
    _current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptListResponse:
    attempts = await _erp_service(db).list_attempts(package_id=package_id)
    return ErpIntegrationAttemptListResponse(attempts=[_to_attempt_response(a) for a in attempts])


@router.get(
    "/erp-integration-attempts/{attempt_id}",
    response_model=ErpIntegrationAttemptResponse,
)
async def get_erp_integration_attempt(
    attempt_id: UUID,
    _current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptResponse:
    attempt = await _erp_service(db).get_attempt(attempt_id=attempt_id)
    return _to_attempt_response(attempt)


@router.post(
    "/erp-integration-attempts/{attempt_id}/simulate",
    response_model=ErpIntegrationAttemptResponse,
)
async def simulate_erp_integration_attempt(
    attempt_id: UUID,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptResponse:
    try:
        attempt = await _erp_service(db).simulate_attempt(
            attempt_id=attempt_id,
            user_id=current_user.id,
        )
        await db.commit()
        return _to_attempt_response(attempt)
    except Exception:
        await db.rollback()
        raise


@router.post(
    "/erp-integration-attempts/{attempt_id}/retry",
    response_model=ErpIntegrationAttemptResponse,
)
async def retry_erp_integration_attempt(
    attempt_id: UUID,
    payload: ErpRetryRequest,
    current_user: RecruiterHrOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ErpIntegrationAttemptResponse:
    try:
        attempt = await _erp_service(db).retry_attempt(
            attempt_id=attempt_id,
            user_id=current_user.id,
            simulate_failure=payload.simulate_failure,
        )
        await db.commit()
        return _to_attempt_response(attempt)
    except Exception:
        await db.rollback()
        raise
