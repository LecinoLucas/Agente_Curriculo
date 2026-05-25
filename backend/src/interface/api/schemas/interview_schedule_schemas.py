from datetime import datetime
from typing import Optional
from uuid import UUID

from src.interface.api.schemas.common import APISchemaModel, ORMAPISchemaModel


class InterviewScheduleCreate(APISchemaModel):
    """Schema para criar nova entrevista."""

    candidate_id: UUID
    job_id: Optional[UUID] = None
    pipeline_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    public_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    scheduled_start: datetime
    scheduled_end: datetime
    timezone: str = "America/Recife"
    interview_type: str
    interview_format: str = "online"
    status: str = "scheduled"
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_email: Optional[str] = None
    create_google_event: bool = False
    create_google_meet: bool = False


class CandidateJobInterviewCreate(APISchemaModel):
    """Schema para criar entrevista no contexto canônico candidato-vaga."""

    pipeline_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    public_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    scheduled_start: datetime
    scheduled_end: datetime
    timezone: str = "America/Recife"
    interview_type: str
    interview_format: str = "online"
    status: str = "scheduled"
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_email: Optional[str] = None
    create_google_event: bool = False
    create_google_meet: bool = False


class InterviewScheduleUpdate(APISchemaModel):
    """Schema para atualizar entrevista existente."""

    title: Optional[str] = None
    description: Optional[str] = None
    public_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    timezone: Optional[str] = None
    interview_type: Optional[str] = None
    interview_format: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_email: Optional[str] = None
    sync_google_event: Optional[bool] = None
    create_google_meet: bool = False


class InterviewScheduleCancelRequest(APISchemaModel):
    """Schema para cancelar entrevista."""

    cancel_reason: str
    sync_google_event: bool = True


class InterviewScheduleRescheduleRequest(APISchemaModel):
    """Schema operacional para remarcar entrevista."""

    scheduled_start: datetime
    scheduled_end: datetime
    timezone: Optional[str] = None
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    interviewer_name: Optional[str] = None
    interviewer_email: Optional[str] = None
    sync_google_event: bool = True
    create_google_meet: bool = False


class InterviewScheduleCompleteRequest(APISchemaModel):
    """Schema operacional para concluir entrevista."""

    internal_notes: Optional[str] = None


class InterviewScheduleNoShowRequest(APISchemaModel):
    """Schema operacional para marcar no-show."""

    reason: Optional[str] = None


class InterviewScheduleResponse(ORMAPISchemaModel):
    """Response com dados de agendamento incluindo nomes de candidato e vaga."""

    id: UUID
    candidate_id: UUID
    candidate_name: str
    job_id: Optional[UUID]
    job_title: Optional[str]
    pipeline_id: Optional[UUID] = None
    title: str
    description: Optional[str]
    public_notes: Optional[str] = None
    internal_notes: Optional[str] = None
    scheduled_start: datetime
    scheduled_end: datetime
    timezone: str
    interview_type: str
    interview_format: str
    status: str
    location: Optional[str]
    meeting_url: Optional[str]
    interviewer_name: Optional[str]
    interviewer_email: Optional[str]
    cancel_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    cancelled_at: Optional[datetime] = None
    calendar_provider: Optional[str] = None
    calendar_sync_status: Optional[str] = None
    calendar_sync_error: Optional[str] = None
    calendar_synced_at: Optional[datetime] = None
    meeting_provider: Optional[str] = None
    external_calendar_html_link: Optional[str] = None
    external_calendar_event_id: Optional[str] = None
    scorecard_id: Optional[UUID] = None
    scorecard_status: Optional[str] = None
    scorecard_final_recommendation: Optional[str] = None
    scorecard_submitted_at: Optional[datetime] = None
    counts_for_current_gate: bool = False


class AgendaKpiResponse(APISchemaModel):
    """KPIs da agenda de entrevistas."""

    total_scheduled: int
    today_count: int
    upcoming_count: int
    completed_count: int
    cancelled_count: int
    unique_interviewers_count: int
