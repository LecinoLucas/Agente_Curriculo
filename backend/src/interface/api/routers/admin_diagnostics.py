from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admin_candidate_job_diagnostics_service import (
    AdminCandidateJobDiagnosticsService,
)
from src.interface.api.dependencies import AdminOnly, get_db
from src.interface.api.schemas.admin_diagnostics_schemas import (
    CandidateJobFlowDiagnosticsResponse,
    CandidateJobFlowRepairRequest,
    CandidateJobFlowRepairResponse,
)

router = APIRouter(prefix="/admin/diagnostics", tags=["admin-diagnostics"])


def _service(db: AsyncSession = Depends(get_db)) -> AdminCandidateJobDiagnosticsService:
    return AdminCandidateJobDiagnosticsService(db)


@router.get(
    "/candidate-job-flow",
    response_model=CandidateJobFlowDiagnosticsResponse,
)
async def get_candidate_job_flow_diagnostics(
    _current_user: AdminOnly,
    candidate_id: UUID = Query(...),
    job_id: UUID = Query(...),
    service: AdminCandidateJobDiagnosticsService = Depends(_service),
) -> CandidateJobFlowDiagnosticsResponse:
    payload = await service.candidate_job_flow(candidate_id=candidate_id, job_id=job_id)
    return CandidateJobFlowDiagnosticsResponse.model_validate(payload.as_dict())


@router.post(
    "/candidate-job-flow/repair",
    response_model=CandidateJobFlowRepairResponse,
)
async def repair_candidate_job_flow(
    body: CandidateJobFlowRepairRequest,
    _current_user: AdminOnly,
    db: AsyncSession = Depends(get_db),
) -> CandidateJobFlowRepairResponse:
    service = AdminCandidateJobDiagnosticsService(db)
    try:
        payload = await service.repair_candidate_job_flow(
            candidate_id=body.candidate_id,
            job_id=body.job_id,
        )
        await db.commit()
        return CandidateJobFlowRepairResponse.model_validate(payload.as_dict())
    except Exception:
        await db.rollback()
        raise
