from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.candidate_portal_service import (
    CandidatePortalApplicationNotFoundError,
    CandidatePortalProfileConflictError,
    CandidatePortalService,
)
from src.interface.api.dependencies import CurrentCandidateSession, get_db
from src.interface.api.schemas.candidate_portal_schemas import (
    CandidatePortalApplicationDetailResponse,
    CandidatePortalApplicationListItemResponse,
    CandidatePortalMeResponse,
)

router = APIRouter(prefix="/candidate-portal", tags=["candidate-portal"])
public_router = APIRouter(prefix="/public/candidate-portal", tags=["public"])


async def get_candidate_portal_me_response(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession,
) -> CandidatePortalMeResponse:
    try:
        return await CandidatePortalService(db).get_me(candidate_session.candidate_id)
    except CandidatePortalProfileConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão do candidato inválida ou expirada",
        ) from exc


async def list_candidate_portal_applications_response(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession,
) -> list[CandidatePortalApplicationListItemResponse]:
    return await CandidatePortalService(db).list_applications(candidate_session.candidate_id)


async def get_candidate_portal_application_detail_response(
    application_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession,
) -> CandidatePortalApplicationDetailResponse:
    try:
        return await CandidatePortalService(db).get_application_detail(
            candidate_id=candidate_session.candidate_id,
            application_id=application_id,
        )
    except CandidatePortalApplicationNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidatura não encontrada.",
        ) from exc


@router.get("/me", response_model=CandidatePortalMeResponse)
async def get_candidate_portal_me(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalMeResponse:
    return await get_candidate_portal_me_response(candidate_session, db)


@router.get("/me/applications", response_model=list[CandidatePortalApplicationListItemResponse])
async def list_candidate_portal_applications(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> list[CandidatePortalApplicationListItemResponse]:
    return await list_candidate_portal_applications_response(candidate_session, db)


@router.get(
    "/me/applications/{application_id}",
    response_model=CandidatePortalApplicationDetailResponse,
)
async def get_candidate_portal_application_detail(
    application_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalApplicationDetailResponse:
    return await get_candidate_portal_application_detail_response(
        application_id,
        candidate_session,
        db,
    )


@public_router.get("/me", response_model=CandidatePortalMeResponse)
async def get_public_candidate_portal_me(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalMeResponse:
    return await get_candidate_portal_me_response(candidate_session, db)


@public_router.get(
    "/me/applications",
    response_model=list[CandidatePortalApplicationListItemResponse],
)
async def list_public_candidate_portal_applications(
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> list[CandidatePortalApplicationListItemResponse]:
    return await list_candidate_portal_applications_response(candidate_session, db)


@public_router.get(
    "/me/applications/{application_id}",
    response_model=CandidatePortalApplicationDetailResponse,
)
async def get_public_candidate_portal_application_detail(
    application_id: UUID,
    candidate_session: CurrentCandidateSession,
    db: AsyncSession = Depends(get_db),
) -> CandidatePortalApplicationDetailResponse:
    return await get_candidate_portal_application_detail_response(
        application_id,
        candidate_session,
        db,
    )
