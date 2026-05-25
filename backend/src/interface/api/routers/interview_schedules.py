import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.interview_schedule_service import (
    InterviewScheduleService,
    InterviewScheduleNotFoundError,
    InterviewScheduleAlreadyCancelledError,
    InterviewScheduleConflictError,
    InterviewScheduleValidationError,
)
from src.infrastructure.repositories.sqlalchemy_interview_schedule_repository import (
    SQLAlchemyInterviewScheduleRepository,
)
from src.interface.api.dependencies import InternalUser, get_db
from src.interface.api.routers.communication_events import notify_candidate_event_safely
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.interview_schedule_schemas import (
    AgendaKpiResponse,
    CandidateJobInterviewCreate,
    InterviewScheduleCreate,
    InterviewScheduleUpdate,
    InterviewScheduleCancelRequest,
    InterviewScheduleCompleteRequest,
    InterviewScheduleNoShowRequest,
    InterviewScheduleRescheduleRequest,
    InterviewScheduleResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agenda", tags=["agenda"])


from src.application.services.interview_calendar_sync_service import InterviewCalendarSyncService
from src.infrastructure.security.encryption_service import EncryptionService
from src.infrastructure.security.google_oauth_client import GoogleOAuthClient
from src.infrastructure.calendar.google_calendar_client import GoogleCalendarClient

def _get_service(db: AsyncSession = Depends(get_db)) -> InterviewScheduleService:
    repository = SQLAlchemyInterviewScheduleRepository(db)
    
    encryption_service = EncryptionService()
    oauth_client = GoogleOAuthClient()
    calendar_client = GoogleCalendarClient()
    
    sync_service = InterviewCalendarSyncService(db, encryption_service, oauth_client, calendar_client)
    
    return InterviewScheduleService(repository, sync_service)


@router.get("/interviews", response_model=PaginatedResponse[InterviewScheduleResponse])
async def list_interviews(
    current_user: InternalUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    candidate_id: Optional[UUID] = Query(None),
    job_id: Optional[UUID] = Query(None),
    interviewer: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    service: InterviewScheduleService = Depends(_get_service),
) -> PaginatedResponse[InterviewScheduleResponse]:
    # Parse dates if provided
    date_from_dt = None
    date_to_dt = None

    if date_from:
        date_from_dt = datetime.fromisoformat(date_from)
    if date_to:
        date_to_dt = datetime.fromisoformat(date_to)

    items, total = await service.list_interviews(
        page=page,
        page_size=page_size,
        date_from=date_from_dt,
        date_to=date_to_dt,
        status=status,
        candidate_id=candidate_id,
        job_id=job_id,
        interviewer=interviewer,
        search=search,
    )

    return PaginatedResponse(
        data=[InterviewScheduleResponse(**item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 1,
    )


@router.post("/interviews", response_model=InterviewScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_interview(
    body: InterviewScheduleCreate,
    current_user: InternalUser,
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.create_interview(
            candidate_id=body.candidate_id,
            job_id=body.job_id,
            pipeline_id=body.pipeline_id,
            title=body.title,
            description=body.description,
            public_notes=body.public_notes,
            internal_notes=body.internal_notes,
            scheduled_start=body.scheduled_start,
            scheduled_end=body.scheduled_end,
            timezone=body.timezone,
            interview_type=body.interview_type,
            interview_format=body.interview_format,
            status=body.status,
            location=body.location,
            meeting_url=body.meeting_url,
            interviewer_name=body.interviewer_name,
            interviewer_email=body.interviewer_email,
            create_google_event=body.create_google_event,
            create_google_meet=body.create_google_meet,
            requested_by_user_id=current_user.id,
        )
        details = await service.get_interview_details(schedule.id)
        return InterviewScheduleResponse(**details)
    except InterviewScheduleConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except InterviewScheduleValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("/interviews/{schedule_id}", response_model=InterviewScheduleResponse)
async def get_interview(
    schedule_id: UUID,
    current_user: InternalUser,
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        details = await service.get_interview_details(schedule_id)
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.patch("/interviews/{schedule_id}", response_model=InterviewScheduleResponse)
async def update_interview(
    schedule_id: UUID,
    body: InterviewScheduleUpdate,
    current_user: InternalUser,
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.update_interview(
            schedule_id,
            title=body.title,
            description=body.description,
            public_notes=body.public_notes,
            internal_notes=body.internal_notes,
            scheduled_start=body.scheduled_start,
            scheduled_end=body.scheduled_end,
            timezone=body.timezone,
            interview_type=body.interview_type,
            interview_format=body.interview_format,
            status=body.status,
            location=body.location,
            meeting_url=body.meeting_url,
            interviewer_name=body.interviewer_name,
            interviewer_email=body.interviewer_email,
            sync_google_event=body.sync_google_event,
            create_google_meet=body.create_google_meet,
            requested_by_user_id=current_user.id,
        )
        details = await service.get_interview_details(schedule.id)
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InterviewScheduleConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except InterviewScheduleValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.patch("/interviews/{schedule_id}/cancel", response_model=InterviewScheduleResponse)
async def cancel_interview(
    schedule_id: UUID,
    body: InterviewScheduleCancelRequest,
    current_user: InternalUser,
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.cancel_interview(
            schedule_id, 
            body.cancel_reason,
            sync_google_event=body.sync_google_event,
            requested_by_user_id=current_user.id,
        )
        details = await service.get_interview_details(schedule.id)
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InterviewScheduleAlreadyCancelledError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("/kpis", response_model=AgendaKpiResponse)
async def get_kpis(
    current_user: InternalUser,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    candidate_id: Optional[UUID] = Query(None),
    job_id: Optional[UUID] = Query(None),
    interviewer: Optional[str] = Query(None),
    service: InterviewScheduleService = Depends(_get_service),
) -> AgendaKpiResponse:
    # Parse dates if provided
    date_from_dt = None
    date_to_dt = None

    if date_from:
        date_from_dt = datetime.fromisoformat(date_from)
    if date_to:
        date_to_dt = datetime.fromisoformat(date_to)

    kpis = await service.get_kpis(
        date_from=date_from_dt,
        date_to=date_to_dt,
        status=status,
        search=search,
        candidate_id=candidate_id,
        job_id=job_id,
        interviewer=interviewer,
    )

    return kpis


operational_router = APIRouter(tags=["interviews"])


@operational_router.get(
    "/jobs/{job_id}/candidates/{candidate_id}/interviews",
    response_model=PaginatedResponse[InterviewScheduleResponse],
)
async def list_candidate_job_interviews(
    job_id: UUID,
    candidate_id: UUID,
    current_user: InternalUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    service: InterviewScheduleService = Depends(_get_service),
) -> PaginatedResponse[InterviewScheduleResponse]:
    items, total = await service.list_interviews(
        page=page,
        page_size=page_size,
        candidate_id=candidate_id,
        job_id=job_id,
        active_pipeline_only=True,
    )
    return PaginatedResponse(
        data=[InterviewScheduleResponse(**item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 1,
    )


@operational_router.post(
    "/jobs/{job_id}/candidates/{candidate_id}/interviews",
    response_model=InterviewScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_candidate_job_interview(
    job_id: UUID,
    candidate_id: UUID,
    body: CandidateJobInterviewCreate,
    current_user: InternalUser,
    db: AsyncSession = Depends(get_db),
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.create_interview(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=body.pipeline_id,
            title=body.title,
            description=body.description,
            public_notes=body.public_notes,
            internal_notes=body.internal_notes,
            scheduled_start=body.scheduled_start,
            scheduled_end=body.scheduled_end,
            timezone=body.timezone,
            interview_type=body.interview_type,
            interview_format=body.interview_format,
            status=body.status,
            location=body.location,
            meeting_url=body.meeting_url,
            interviewer_name=body.interviewer_name,
            interviewer_email=body.interviewer_email,
            create_google_event=body.create_google_event,
            create_google_meet=body.create_google_meet,
            requested_by_user_id=current_user.id,
        )
        details = await service.get_interview_details(schedule.id)
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="interview_scheduled",
            candidate_id=candidate_id,
            job_id=job_id,
            related_entity_type="interview_schedule",
            related_entity_id=schedule.id,
            context={"scheduled_start": str(details.get("scheduled_start") or "")},
            actor_id=current_user.id,
        )
        return InterviewScheduleResponse(**details)
    except InterviewScheduleConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except InterviewScheduleValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@operational_router.patch(
    "/interviews/{interview_id}/reschedule",
    response_model=InterviewScheduleResponse,
)
async def reschedule_interview(
    interview_id: UUID,
    body: InterviewScheduleRescheduleRequest,
    current_user: InternalUser,
    db: AsyncSession = Depends(get_db),
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.reschedule_interview(
            interview_id,
            scheduled_start=body.scheduled_start,
            scheduled_end=body.scheduled_end,
            timezone=body.timezone,
            location=body.location,
            meeting_url=body.meeting_url,
            interviewer_name=body.interviewer_name,
            interviewer_email=body.interviewer_email,
            sync_google_event=body.sync_google_event,
            create_google_meet=body.create_google_meet,
            requested_by_user_id=current_user.id,
        )
        details = await service.get_interview_details(schedule.id)
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="interview_rescheduled",
            candidate_id=schedule.candidate_id,
            job_id=schedule.job_id,
            related_entity_type="interview_schedule",
            related_entity_id=schedule.id,
            context={"scheduled_start": str(details.get("scheduled_start") or "")},
            actor_id=current_user.id,
        )
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InterviewScheduleConflictError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except InterviewScheduleValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@operational_router.post(
    "/interviews/{interview_id}/cancel",
    response_model=InterviewScheduleResponse,
)
async def cancel_interview_operational(
    interview_id: UUID,
    body: InterviewScheduleCancelRequest,
    current_user: InternalUser,
    db: AsyncSession = Depends(get_db),
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.cancel_interview(
            interview_id,
            body.cancel_reason,
            sync_google_event=body.sync_google_event,
            requested_by_user_id=current_user.id,
        )
        details = await service.get_interview_details(schedule.id)
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="interview_cancelled",
            candidate_id=schedule.candidate_id,
            job_id=schedule.job_id,
            related_entity_type="interview_schedule",
            related_entity_id=schedule.id,
            actor_id=current_user.id,
        )
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InterviewScheduleAlreadyCancelledError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@operational_router.post(
    "/interviews/{interview_id}/complete",
    response_model=InterviewScheduleResponse,
)
async def complete_interview(
    interview_id: UUID,
    current_user: InternalUser,
    body: InterviewScheduleCompleteRequest | None = None,
    db: AsyncSession = Depends(get_db),
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.complete_interview(
            interview_id,
            internal_notes=body.internal_notes if body is not None else None,
        )
        details = await service.get_interview_details(schedule.id)
        await db.commit()
        if details.get("status") == "awaiting_feedback":
            await notify_candidate_event_safely(
                db,
                event_type="interview_awaiting_feedback",
                candidate_id=schedule.candidate_id,
                job_id=schedule.job_id,
                related_entity_type="interview_schedule",
                related_entity_id=schedule.id,
                actor_id=current_user.id,
            )
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InterviewScheduleValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@operational_router.post(
    "/interviews/{interview_id}/no-show",
    response_model=InterviewScheduleResponse,
)
async def mark_interview_no_show(
    interview_id: UUID,
    current_user: InternalUser,
    body: InterviewScheduleNoShowRequest | None = None,
    db: AsyncSession = Depends(get_db),
    service: InterviewScheduleService = Depends(_get_service),
) -> InterviewScheduleResponse:
    try:
        schedule = await service.mark_no_show(
            interview_id,
            reason=body.reason if body is not None else None,
        )
        details = await service.get_interview_details(schedule.id)
        await db.commit()
        await notify_candidate_event_safely(
            db,
            event_type="interview_no_show",
            candidate_id=schedule.candidate_id,
            job_id=schedule.job_id,
            related_entity_type="interview_schedule",
            related_entity_id=schedule.id,
            actor_id=current_user.id,
        )
        return InterviewScheduleResponse(**details)
    except InterviewScheduleNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InterviewScheduleValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
