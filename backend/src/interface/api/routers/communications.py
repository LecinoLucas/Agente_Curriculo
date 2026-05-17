"""Router for communication templates, messages, and delivery."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.communication_service import CommunicationService
from src.interface.api.dependencies import (
    AdminOnly,
    CurrentCompleteCandidateSession,
    RecruiterOrAdmin,
    get_db,
)
from src.interface.api.schemas.communication_schemas import (
    CommunicationListResponse,
    CommunicationMarkReadRequest,
    CommunicationResponse,
    CommunicationRetryRequest,
    CommunicationSendRequest,
    CommunicationTemplateCreateRequest,
    CommunicationTemplateListResponse,
    CommunicationTemplateResponse,
    CommunicationTemplateUpdateRequest,
)
from src.application.services.candidate_portal_auth_service import CandidatePortalSession

router = APIRouter(tags=["communications"])


def _get_service(db: AsyncSession = Depends(get_db)) -> CommunicationService:
    return CommunicationService(db)


@router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/communications",
    response_model=CommunicationListResponse,
)
async def list_communications_for_recruiter(
    job_id: UUID,
    candidate_id: UUID,
    _current_user: RecruiterOrAdmin,
    service: CommunicationService = Depends(_get_service),
) -> CommunicationListResponse:
    """List communications for a candidate (recruiter view)."""
    communications = await service.list_for_recruiter(candidate_id, job_id)
    return CommunicationListResponse(
        communications=[
            CommunicationResponse.model_validate(comm) for comm in communications
        ]
    )


@router.post(
    "/communications/{communication_id}/retry",
    response_model=dict,
)
async def retry_communication(
    communication_id: UUID,
    request: CommunicationRetryRequest,
    _current_user: RecruiterOrAdmin,
    service: CommunicationService = Depends(_get_service),
) -> dict:
    """Retry a failed or queued communication."""
    try:
        await service.retry_communication(communication_id, _current_user.id)
        return {"message": "Communication retry initiated"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/candidate-portal/communications",
    response_model=CommunicationListResponse,
)
async def list_communications_for_candidate(
    current_session: CurrentCompleteCandidateSession,
    service: CommunicationService = Depends(_get_service),
) -> CommunicationListResponse:
    """List communications for current candidate."""
    communications = await service.list_for_candidate(
        current_session.candidate_id, audience="candidate"
    )
    return CommunicationListResponse(
        communications=[
            CommunicationResponse.model_validate(comm) for comm in communications
        ]
    )


@router.post(
    "/candidate-portal/communications/{communication_id}/mark-read",
    response_model=dict,
)
async def mark_communication_read(
    communication_id: UUID,
    request: CommunicationMarkReadRequest,
    current_session: CurrentCompleteCandidateSession,
    service: CommunicationService = Depends(_get_service),
) -> dict:
    """Mark communication as read."""
    try:
        await service.mark_read(communication_id, current_session.candidate_id)
        return {"message": "Communication marked as read"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/admin/communication/templates",
    response_model=CommunicationTemplateListResponse,
)
async def list_templates(
    _current_user: AdminOnly,
    service: CommunicationService = Depends(_get_service),
) -> CommunicationTemplateListResponse:
    """List communication templates."""
    templates = await service.list_templates()
    return CommunicationTemplateListResponse(
        templates=[
            CommunicationTemplateResponse.model_validate(template)
            for template in templates
        ]
    )


@router.post(
    "/admin/communication/templates",
    response_model=CommunicationTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    request: CommunicationTemplateCreateRequest,
    _current_user: AdminOnly,
    service: CommunicationService = Depends(_get_service),
) -> CommunicationTemplateResponse:
    """Create communication template."""
    template = await service.create_template(
        key=request.key,
        channel=request.channel,
        audience=request.audience,
        body_template=request.body_template,
        subject_template=request.subject_template,
        status=request.status,
    )
    return CommunicationTemplateResponse.model_validate(template)


@router.patch(
    "/admin/communication/templates/{template_id}",
    response_model=CommunicationTemplateResponse,
)
async def update_template(
    template_id: UUID,
    request: CommunicationTemplateUpdateRequest,
    _current_user: AdminOnly,
    service: CommunicationService = Depends(_get_service),
) -> CommunicationTemplateResponse:
    """Update communication template."""
    try:
        template = await service.update_template(
            template_id=template_id,
            key=request.key,
            channel=request.channel,
            audience=request.audience,
            body_template=request.body_template,
            subject_template=request.subject_template,
            status=request.status,
        )
        return CommunicationTemplateResponse.model_validate(template)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/communications/send",
    response_model=CommunicationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_custom_message(
    job_id: UUID,
    candidate_id: UUID,
    request: CommunicationSendRequest,
    current_user: RecruiterOrAdmin,
    service: CommunicationService = Depends(_get_service),
) -> CommunicationResponse:
    """Send a custom direct communication message to the candidate."""
    comm = await service.send_custom_message(
        candidate_id=candidate_id,
        job_id=job_id,
        subject=request.subject,
        body=request.body,
        channel=request.channel,
        audience=request.audience,
        created_by=current_user.id,
    )
    return CommunicationResponse.model_validate(comm)
