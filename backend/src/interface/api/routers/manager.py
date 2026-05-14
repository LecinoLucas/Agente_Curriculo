"""Manager view routes — read-only access to assigned jobs and candidates."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.manager_view_service import ManagerViewService
from src.interface.api.dependencies import ManagerOrAdmin, get_db
from src.interface.api.schemas.manager_schemas import (
    ManagerJobListResponse,
    ManagerJobResponse,
    ManagerJobCandidatesResponse,
    ManagerCandidateSummary,
    ManagerCandidateDetailResponse,
)

router = APIRouter(tags=["manager"])


def _service(db: AsyncSession, user) -> ManagerViewService:
    return ManagerViewService(db, user)


@router.get(
    "/manager/jobs",
    response_model=ManagerJobListResponse,
)
async def list_manager_jobs(
    current_user: ManagerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ManagerJobListResponse:
    """
    List jobs where manager is evaluator, or all jobs for ADMIN.

    MANAGER: Returns only jobs where they are evaluator in at least one InterviewScorecard.
    ADMIN: Returns all jobs for auditing/oversight.
    """
    jobs = await _service(db, current_user).list_manager_jobs(current_user.id)
    return ManagerJobListResponse(
        jobs=[ManagerJobResponse(**job) for job in jobs]
    )


@router.get(
    "/manager/jobs/{job_id}/candidates",
    response_model=ManagerJobCandidatesResponse,
)
async def list_job_candidates(
    job_id: UUID,
    current_user: ManagerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ManagerJobCandidatesResponse:
    """
    List candidates in a job where manager is evaluator, or all candidates for ADMIN.

    MANAGER: Returns only if they are evaluator for this job.
    ADMIN: Returns all candidates in the job for oversight.
    Omits: documents, ERP payload, technical AI details.
    """
    candidates = await _service(db, current_user).list_job_candidates(current_user.id, job_id)
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager not assigned to this job",
        )

    return ManagerJobCandidatesResponse(
        job_id=str(job_id),
        candidates=[ManagerCandidateSummary(**c) for c in candidates],
    )


@router.get(
    "/manager/jobs/{job_id}/candidates/{candidate_id}/summary",
    response_model=ManagerCandidateDetailResponse,
)
async def get_candidate_summary(
    job_id: UUID,
    candidate_id: UUID,
    current_user: ManagerOrAdmin,
    db: AsyncSession = Depends(get_db),
) -> ManagerCandidateDetailResponse:
    """
    Get safe candidate summary for manager view.

    Safe fields:
    - Candidate: id, name, email
    - Pipeline: stage
    - Match: percentage only (no breakdown, no weights)
    - Scorecard: status, recommendation (no items)

    Omitted fields:
    - Documents, ERP payload, AI analysis details
    - Technical logs, prompts, raw scoring breakdown
    - Other managers' evaluations
    """
    summary = await _service(db, current_user).get_candidate_summary(
        current_user.id, job_id, candidate_id
    )

    if not summary:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager not assigned to this candidate/job",
        )

    return ManagerCandidateDetailResponse(**summary)
