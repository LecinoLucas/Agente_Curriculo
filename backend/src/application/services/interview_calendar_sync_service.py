from datetime import datetime, timezone, timedelta
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from src.domain.exceptions import ValidationException, NotFoundException
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel
from src.infrastructure.database.models.calendar_sync_event_model import CalendarSyncEventModel
from src.infrastructure.repositories.sqlalchemy_google_calendar_connection_repository import (
    SQLAlchemyGoogleCalendarConnectionRepository,
)
from src.infrastructure.security.encryption_service import EncryptionService
from src.infrastructure.security.google_oauth_client import GoogleOAuthClient
from src.infrastructure.calendar.google_calendar_client import GoogleCalendarClient, CalendarEventPayload
from src.application.services.calendar_sync_policy import CalendarSyncPolicy
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel


class InterviewCalendarSyncService:
    def __init__(
        self,
        db: AsyncSession,
        encryption_service: EncryptionService,
        oauth_client: GoogleOAuthClient,
        calendar_client: GoogleCalendarClient,
    ) -> None:
        self._db = db
        self._encryption_service = encryption_service
        self._oauth_client = oauth_client
        self._calendar_client = calendar_client
        self._connection_repo = SQLAlchemyGoogleCalendarConnectionRepository(db)

    async def _get_or_refresh_token(self, connection: GoogleCalendarConnectionModel) -> str:
        """Verifica validade do token e renova se necessário."""
        now = datetime.now(timezone.utc)
        if connection.expires_at and connection.expires_at < now + timedelta(minutes=5):
            refresh_token = self._encryption_service.decrypt(connection.refresh_token_encrypted)
            
            token_response = await self._oauth_client.refresh_access_token(refresh_token)
            
            access_token_encrypted = self._encryption_service.encrypt(token_response.access_token)
            
            expires_at = now + timedelta(seconds=token_response.expires_in or 3600)
            
            await self._connection_repo.upsert_connection(
                user_id=connection.user_id,
                google_account_email=connection.google_account_email,
                access_token_encrypted=access_token_encrypted,
                refresh_token_encrypted=connection.refresh_token_encrypted,
                scopes=connection.scopes,
                expires_at=expires_at,
            )
            
            return token_response.access_token
            
        return self._encryption_service.decrypt(connection.access_token_encrypted)

    async def sync_create_event(self, interview_id: UUID, requested_by_user_id: UUID, create_meet: bool = False) -> str:
        """Sincroniza a criação de um evento."""
        interview = await self._db.get(InterviewScheduleModel, interview_id)
        if not interview:
            raise NotFoundException("Entrevista não encontrada")
            
        connection = await self._connection_repo.get_active_by_user_id(requested_by_user_id)
        
        decision = CalendarSyncPolicy.can_create_event(interview, connection, requested_explicitly=True)
        
        # Check idempotency
        idempotency_key = f"google_calendar:create:{interview_id}"
        res = await self._db.execute(
            select(CalendarSyncEventModel).where(CalendarSyncEventModel.idempotency_key == idempotency_key)
        )
        existing = res.scalar_one_or_none()
        if existing:
            return existing.status
            
        sync_event = CalendarSyncEventModel(
            interview_schedule_id=interview_id,
            user_id=requested_by_user_id,
            action="create",
            status="requested",
            idempotency_key=idempotency_key,
        )
        self._db.add(sync_event)
        await self._db.commit()
        
        if decision != "allowed":
            sync_event.status = "skipped"
            sync_event.error_message = f"Sincronização não permitida: {decision}"
            await self._db.commit()
            return decision
            
        try:
            access_token = await self._get_or_refresh_token(connection)
            
            candidate = await self._db.get(CandidateModel, interview.candidate_id)
            job = None
            if interview.job_id:
                job = await self._db.get(JobModel, interview.job_id)
                
            candidate_name = candidate.full_name if candidate else "Candidato"
            job_title = job.title if job else "Vaga não informada"
            
            payload = CalendarEventPayload(
                summary=f"Entrevista - {candidate_name}",
                description=f"Entrevista agendada pelo Admissão RH.\n\nCandidato: {candidate_name}\nVaga: {job_title}\nTipo: {interview.interview_type}\nObservações: {interview.description or ''}",
                start_datetime=interview.scheduled_start,
                end_datetime=interview.scheduled_end,
                timezone=interview.timezone or "America/Recife",
                attendees=[],
                create_meet=create_meet,
            )
            
            if candidate and candidate.email:
                payload.attendees.append(candidate.email)
            if interview.interviewer_email:
                payload.attendees.append(interview.interviewer_email)
            
            result = await self._calendar_client.create_event(access_token, payload)
            
            interview.calendar_provider = "google"
            interview.external_calendar_event_id = result.external_event_id
            interview.external_calendar_html_link = result.html_link
            if result.meeting_url:
                interview.meeting_provider = "google_meet"
                interview.meeting_url = result.meeting_url
            interview.calendar_sync_status = "synced"
            interview.calendar_synced_at = datetime.now(timezone.utc)
            
            sync_event.status = "success"
            sync_event.external_calendar_event_id = result.external_event_id
            
            await self._db.commit()
            return "success"
            
        except Exception as exc:
            sync_event.status = "failed"
            sync_event.error_message = str(exc)
            
            interview.calendar_sync_status = "failed"
            interview.calendar_sync_error = str(exc)
            
            await self._db.commit()
            raise exc

    async def sync_update_event(self, interview_id: UUID, requested_by_user_id: UUID, create_meet: bool = False) -> str:
        """Sincroniza a atualização de um evento."""
        interview = await self._db.get(InterviewScheduleModel, interview_id)
        if not interview:
            raise NotFoundException("Entrevista não encontrada")
            
        connection = await self._connection_repo.get_active_by_user_id(requested_by_user_id)
        
        decision = CalendarSyncPolicy.can_update_event(interview, connection)
        
        sync_event = CalendarSyncEventModel(
            interview_schedule_id=interview_id,
            user_id=requested_by_user_id,
            action="update",
            status="requested",
            idempotency_key=f"google_calendar:update:{interview_id}:{interview.updated_at.timestamp() if interview.updated_at else datetime.now().timestamp()}",
        )
        self._db.add(sync_event)
        await self._db.commit()
        
        if decision != "allowed":
            sync_event.status = "skipped"
            sync_event.error_message = f"Sincronização não permitida: {decision}"
            await self._db.commit()
            return decision
            
        try:
            access_token = await self._get_or_refresh_token(connection)
            
            candidate = await self._db.get(CandidateModel, interview.candidate_id)
            job = None
            if interview.job_id:
                job = await self._db.get(JobModel, interview.job_id)
                
            candidate_name = candidate.full_name if candidate else "Candidato"
            job_title = job.title if job else "Vaga não informada"
            
            payload = CalendarEventPayload(
                summary=f"Entrevista - {candidate_name} (Atualizada)",
                description=f"Entrevista agendada pelo Admissão RH.\n\nCandidato: {candidate_name}\nVaga: {job_title}\nTipo: {interview.interview_type}\nObservações: {interview.description or ''}",
                start_datetime=interview.scheduled_start,
                end_datetime=interview.scheduled_end,
                timezone=interview.timezone or "America/Recife",
                attendees=[],
                create_meet=create_meet,
            )
            
            if candidate and candidate.email:
                payload.attendees.append(candidate.email)
            if interview.interviewer_email:
                payload.attendees.append(interview.interviewer_email)
            
            result = await self._calendar_client.update_event(access_token, interview.external_calendar_event_id, payload)
            
            interview.calendar_synced_at = datetime.now(timezone.utc)
            interview.calendar_sync_status = "synced"
            
            sync_event.status = "success"
            
            await self._db.commit()
            return "success"
            
        except Exception as exc:
            sync_event.status = "failed"
            sync_event.error_message = str(exc)
            
            interview.calendar_sync_status = "failed"
            interview.calendar_sync_error = str(exc)
            
            await self._db.commit()
            raise exc

    async def sync_cancel_event(self, interview_id: UUID, requested_by_user_id: UUID) -> str:
        """Sincroniza o cancelamento de um evento."""
        interview = await self._db.get(InterviewScheduleModel, interview_id)
        if not interview:
            raise NotFoundException("Entrevista não encontrada")
            
        connection = await self._connection_repo.get_active_by_user_id(requested_by_user_id)
        
        decision = CalendarSyncPolicy.can_cancel_event(interview, connection)
        
        sync_event = CalendarSyncEventModel(
            interview_schedule_id=interview_id,
            user_id=requested_by_user_id,
            action="cancel",
            status="requested",
            idempotency_key=f"google_calendar:cancel:{interview_id}",
        )
        self._db.add(sync_event)
        await self._db.commit()
        
        if decision != "allowed":
            sync_event.status = "skipped"
            sync_event.error_message = f"Sincronização não permitida: {decision}"
            await self._db.commit()
            return decision
            
        try:
            access_token = await self._get_or_refresh_token(connection)
            
            await self._calendar_client.cancel_event(access_token, interview.external_calendar_event_id)
            
            interview.calendar_sync_status = "cancelled"
            interview.calendar_synced_at = datetime.now(timezone.utc)
            
            sync_event.status = "success"
            
            await self._db.commit()
            return "success"
            
        except Exception as exc:
            sync_event.status = "failed"
            sync_event.error_message = str(exc)
            
            interview.calendar_sync_status = "failed"
            interview.calendar_sync_error = str(exc)
            
            await self._db.commit()
            raise exc
