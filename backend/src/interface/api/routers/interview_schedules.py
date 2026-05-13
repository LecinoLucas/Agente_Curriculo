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
from src.interface.api.schemas.common import PaginatedResponse
from src.interface.api.schemas.interview_schedule_schemas import (
    AgendaKpiResponse,
    InterviewScheduleCreate,
    InterviewScheduleUpdate,
    InterviewScheduleCancelRequest,
    InterviewScheduleResponse,
)

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
        job_id=job_id,
        interviewer=interviewer,
    )

    return kpis
