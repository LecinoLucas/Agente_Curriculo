from datetime import datetime
from typing import Optional
from uuid import UUID

from src.domain.exceptions import ValidationException, NotFoundException
from src.application.services.interview_calendar_sync_service import InterviewCalendarSyncService
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.repositories.sqlalchemy_interview_schedule_repository import (
    SQLAlchemyInterviewScheduleRepository,
)
from src.interface.api.schemas.interview_schedule_schemas import AgendaKpiResponse


class InterviewScheduleNotFoundError(NotFoundException):
    """Entrevista não encontrada."""
    pass


class InterviewScheduleAlreadyCancelledError(ValidationException):
    """Entrevista já foi cancelada."""
    pass


class InterviewScheduleValidationError(ValidationException):
    """Erro de validação na entrevista."""
    pass


class InterviewScheduleConflictError(ValidationException):
    """Conflito de horário na agenda."""
    pass


VALID_STATUSES = ("scheduled", "completed", "cancelled", "rescheduled", "no_show", "awaiting_feedback")
VALID_TYPES = ("screening", "technical", "manager", "hr", "final", "other")
VALID_FORMATS = ("online", "presencial", "telefone")


class InterviewScheduleService:
    def __init__(
        self,
        repository: SQLAlchemyInterviewScheduleRepository,
        sync_service: Optional[InterviewCalendarSyncService] = None,
    ) -> None:
        self._repository = repository
        self._sync_service = sync_service

    async def list_interviews(
        self,
        *,
        page: int,
        page_size: int,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        candidate_id: Optional[UUID] = None,
        job_id: Optional[UUID] = None,
        interviewer: Optional[str] = None,
        search: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        if date_from and date_to and date_from > date_to:
            raise ValidationException("date_from não pode ser maior que date_to")

        items, total = await self._repository.list_schedules(
            page=page,
            page_size=page_size,
            date_from=date_from,
            date_to=date_to,
            status=status,
            candidate_id=candidate_id,
            job_id=job_id,
            interviewer=interviewer,
            search=search,
        )

        return items, total

    async def get_kpis(
        self,
        *,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        candidate_id: Optional[UUID] = None,
        job_id: Optional[UUID] = None,
        interviewer: Optional[str] = None,
    ) -> AgendaKpiResponse:
        if date_from and date_to and date_from > date_to:
            raise ValidationException("date_from não pode ser maior que date_to")

        kpis_dict = await self._repository.get_kpis(
            date_from=date_from,
            date_to=date_to,
            status=status,
            search=search,
            candidate_id=candidate_id,
            job_id=job_id,
            interviewer=interviewer,
        )

        return AgendaKpiResponse(**kpis_dict)

    async def get_interview(self, schedule_id: UUID) -> InterviewScheduleModel:
        """Buscar entrevista por ID."""
        schedule = await self._repository.get_by_id(schedule_id)
        if not schedule:
            raise InterviewScheduleNotFoundError("Entrevista não encontrada")
        return schedule

    async def get_interview_details(self, schedule_id: UUID) -> dict:
        details = await self._repository.get_detail_by_id(schedule_id)
        if not details:
            raise InterviewScheduleNotFoundError("Entrevista não encontrada")
        return details

    @staticmethod
    def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    async def _ensure_no_conflicts(
        self,
        *,
        candidate_id: UUID,
        scheduled_start: datetime,
        scheduled_end: datetime,
        status: str,
        interviewer_name: Optional[str],
        interviewer_email: Optional[str],
        exclude_schedule_id: Optional[UUID] = None,
    ) -> None:
        if status == "cancelled":
            return

        conflict = await self._repository.find_conflicting_schedule(
            candidate_id=candidate_id,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            interviewer_name=interviewer_name,
            interviewer_email=interviewer_email,
            exclude_schedule_id=exclude_schedule_id,
        )
        if conflict is None:
            return

        _, conflict_type = conflict
        if conflict_type == "interviewer":
            raise InterviewScheduleConflictError(
                "Conflito de horário: este avaliador já possui uma entrevista agendada neste período."
            )

        raise InterviewScheduleConflictError(
            "Conflito de horário: este candidato já possui uma entrevista agendada neste período."
        )

    async def create_interview(
        self,
        *,
        candidate_id: UUID,
        job_id: Optional[UUID],
        pipeline_id: Optional[UUID],
        title: str,
        description: Optional[str],
        public_notes: Optional[str] = None,
        internal_notes: Optional[str] = None,
        scheduled_start: datetime,
        scheduled_end: datetime,
        timezone: str,
        interview_type: str,
        interview_format: str = "online",
        status: str,
        location: Optional[str],
        meeting_url: Optional[str],
        interviewer_name: Optional[str],
        interviewer_email: Optional[str],
        create_google_event: bool = False,
        create_google_meet: bool = False,
        requested_by_user_id: Optional[UUID] = None,
    ) -> InterviewScheduleModel:
        """Criar nova entrevista com validações."""
        interviewer_name = self._normalize_optional_text(interviewer_name)
        interviewer_email = self._normalize_optional_text(interviewer_email)

        # Validar data passada
        now = datetime.now(scheduled_start.tzinfo) if scheduled_start.tzinfo else datetime.now()
        if scheduled_start < now:
            raise InterviewScheduleValidationError(
                "Não é possível agendar uma entrevista no passado"
            )

        # Validar scheduled_end > scheduled_start
        if scheduled_end <= scheduled_start:
            raise InterviewScheduleValidationError(
                "scheduled_end deve ser maior que scheduled_start"
            )

        # Validar status
        if status not in VALID_STATUSES:
            raise InterviewScheduleValidationError(f"Status inválido: {status}")

        # Validar interview_type
        if interview_type not in VALID_TYPES:
            raise InterviewScheduleValidationError(f"Tipo de entrevista inválido: {interview_type}")
        if interview_format not in VALID_FORMATS:
            raise InterviewScheduleValidationError(f"Formato de entrevista inválido: {interview_format}")
        if pipeline_id is None and job_id is not None:
            resolved_pipeline_id = await self._repository.find_active_pipeline_id(candidate_id, job_id)
            if isinstance(resolved_pipeline_id, UUID):
                pipeline_id = resolved_pipeline_id

        await self._ensure_no_conflicts(
            candidate_id=candidate_id,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            status=status,
            interviewer_name=interviewer_name,
            interviewer_email=interviewer_email,
        )

        schedule = InterviewScheduleModel(
            candidate_id=candidate_id,
            job_id=job_id,
            pipeline_id=pipeline_id,
            title=title,
            description=description,
            public_notes=public_notes,
            internal_notes=internal_notes,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            timezone=timezone,
            interview_type=interview_type,
            interview_format=interview_format,
            status=status,
            location=location,
            meeting_url=meeting_url,
            interviewer_name=interviewer_name,
            interviewer_email=interviewer_email,
        )

        schedule = await self._repository.create(schedule)
        
        if create_google_event and self._sync_service and requested_by_user_id:
            try:
                await self._sync_service.sync_create_event(
                    schedule.id, requested_by_user_id, create_meet=create_google_meet
                )
                # Recarregar para pegar os dados atualizados
                schedule = await self.get_interview(schedule.id)
            except Exception:
                # Erro no sync não deve quebrar a criação da entrevista
                pass
                
        return schedule

    async def reschedule_interview(
        self,
        schedule_id: UUID,
        *,
        scheduled_start: datetime,
        scheduled_end: datetime,
        timezone: Optional[str] = None,
        location: Optional[str] = None,
        meeting_url: Optional[str] = None,
        interviewer_name: Optional[str] = None,
        interviewer_email: Optional[str] = None,
        sync_google_event: bool = True,
        create_google_meet: bool = False,
        requested_by_user_id: Optional[UUID] = None,
    ) -> InterviewScheduleModel:
        schedule = await self.get_interview(schedule_id)
        if schedule.status in {"cancelled", "completed", "no_show"}:
            raise InterviewScheduleValidationError(
                "Não é possível remarcar entrevista cancelada, concluída ou no-show"
            )

        return await self.update_interview(
            schedule_id,
            scheduled_start=scheduled_start,
            scheduled_end=scheduled_end,
            timezone=timezone,
            status="rescheduled",
            location=location,
            meeting_url=meeting_url,
            interviewer_name=interviewer_name,
            interviewer_email=interviewer_email,
            sync_google_event=sync_google_event,
            create_google_meet=create_google_meet,
            requested_by_user_id=requested_by_user_id,
        )

    async def complete_interview(
        self,
        schedule_id: UUID,
        *,
        internal_notes: Optional[str] = None,
    ) -> InterviewScheduleModel:
        schedule = await self.get_interview(schedule_id)
        if schedule.status in {"cancelled", "no_show"}:
            raise InterviewScheduleValidationError(
                "Não é possível concluir entrevista cancelada ou no-show"
            )

        if internal_notes is not None:
            schedule.internal_notes = self._normalize_optional_text(internal_notes)

        has_submitted_scorecard = await self._repository.has_submitted_scorecard(schedule_id)
        schedule.status = "completed" if has_submitted_scorecard else "awaiting_feedback"
        return await self._repository.update(schedule)

    async def mark_no_show(
        self,
        schedule_id: UUID,
        *,
        reason: Optional[str] = None,
    ) -> InterviewScheduleModel:
        schedule = await self.get_interview(schedule_id)
        if schedule.status == "cancelled":
            raise InterviewScheduleValidationError("Não é possível marcar no-show em entrevista cancelada")
        if schedule.status == "completed":
            raise InterviewScheduleValidationError("Não é possível marcar no-show em entrevista concluída")

        schedule.status = "no_show"
        if reason is not None:
            schedule.cancel_reason = self._normalize_optional_text(reason)
        return await self._repository.update(schedule)

    async def update_interview(
        self,
        schedule_id: UUID,
        *,
        title: Optional[str] = None,
        description: Optional[str] = None,
        public_notes: Optional[str] = None,
        internal_notes: Optional[str] = None,
        scheduled_start: Optional[datetime] = None,
        scheduled_end: Optional[datetime] = None,
        timezone: Optional[str] = None,
        interview_type: Optional[str] = None,
        interview_format: Optional[str] = None,
        status: Optional[str] = None,
        location: Optional[str] = None,
        meeting_url: Optional[str] = None,
        interviewer_name: Optional[str] = None,
        interviewer_email: Optional[str] = None,
        sync_google_event: Optional[bool] = None,
        create_google_meet: bool = False,
        requested_by_user_id: Optional[UUID] = None,
    ) -> InterviewScheduleModel:
        """Editar/remarcar entrevista."""
        schedule = await self.get_interview(schedule_id)

        # Não permitir editar entrevista cancelada
        if schedule.status == "cancelled":
            raise InterviewScheduleValidationError(
                "Não é possível editar entrevista cancelada"
            )

        new_start = scheduled_start or schedule.scheduled_start
        new_end = scheduled_end or schedule.scheduled_end

        # Validar data passada
        now = datetime.now(new_start.tzinfo) if new_start.tzinfo else datetime.now()
        if new_start < now:
            raise InterviewScheduleValidationError(
                "Não é possível remarcar uma entrevista para o passado"
            )

        if new_end <= new_start:
            raise InterviewScheduleValidationError(
                "scheduled_end deve ser maior que scheduled_start"
            )

        new_interview_type = interview_type or schedule.interview_type
        if new_interview_type not in VALID_TYPES:
            raise InterviewScheduleValidationError(f"Tipo de entrevista inválido: {new_interview_type}")
        new_interview_format = interview_format or schedule.interview_format or "online"
        if new_interview_format not in VALID_FORMATS:
            raise InterviewScheduleValidationError(f"Formato de entrevista inválido: {new_interview_format}")

        time_changed = new_start != schedule.scheduled_start or new_end != schedule.scheduled_end
        new_status = status or schedule.status
        if time_changed and status is None and schedule.status == "scheduled":
            new_status = "rescheduled"
        if new_status not in VALID_STATUSES:
            raise InterviewScheduleValidationError(f"Status inválido: {new_status}")

        new_interviewer_name = (
            self._normalize_optional_text(interviewer_name)
            if interviewer_name is not None
            else self._normalize_optional_text(schedule.interviewer_name)
        )
        new_interviewer_email = (
            self._normalize_optional_text(interviewer_email)
            if interviewer_email is not None
            else self._normalize_optional_text(schedule.interviewer_email)
        )

        await self._ensure_no_conflicts(
            candidate_id=schedule.candidate_id,
            scheduled_start=new_start,
            scheduled_end=new_end,
            status=new_status,
            interviewer_name=new_interviewer_name,
            interviewer_email=new_interviewer_email,
            exclude_schedule_id=schedule_id,
        )

        if title is not None:
            schedule.title = title
        if description is not None:
            schedule.description = description
        if public_notes is not None:
            schedule.public_notes = self._normalize_optional_text(public_notes)
        if internal_notes is not None:
            schedule.internal_notes = self._normalize_optional_text(internal_notes)

        schedule.scheduled_start = new_start
        schedule.scheduled_end = new_end
        schedule.status = new_status

        if timezone is not None:
            schedule.timezone = timezone
        schedule.interview_type = new_interview_type
        schedule.interview_format = new_interview_format
        if location is not None:
            schedule.location = location
        if meeting_url is not None:
            schedule.meeting_url = meeting_url
        if interviewer_name is not None:
            schedule.interviewer_name = new_interviewer_name
        if interviewer_email is not None:
            schedule.interviewer_email = new_interviewer_email

        schedule = await self._repository.update(schedule)
        
        if sync_google_event is not False and self._sync_service and requested_by_user_id:
            if schedule.external_calendar_event_id and schedule.calendar_provider == "google":
                try:
                    await self._sync_service.sync_update_event(
                        schedule.id, requested_by_user_id, create_meet=create_google_meet
                    )
                    # Recarregar
                    schedule = await self.get_interview(schedule.id)
                except Exception:
                    pass
                    
        return schedule

    async def cancel_interview(
        self,
        schedule_id: UUID,
        cancel_reason: str,
        sync_google_event: bool = True,
        requested_by_user_id: Optional[UUID] = None,
    ) -> InterviewScheduleModel:
        """Cancelar entrevista."""
        schedule = await self.get_interview(schedule_id)

        # Não permitir cancelar entrevista já cancelada
        if schedule.status == "cancelled":
            raise InterviewScheduleAlreadyCancelledError(
                "Entrevista já foi cancelada"
            )

        schedule = await self._repository.cancel(schedule_id, cancel_reason)
        
        if sync_google_event and self._sync_service and requested_by_user_id:
            if schedule.external_calendar_event_id and schedule.calendar_provider == "google":
                try:
                    await self._sync_service.sync_cancel_event(
                        schedule.id, requested_by_user_id
                    )
                    # Recarregar
                    schedule = await self.get_interview(schedule.id)
                except Exception:
                    pass
                    
        return schedule
