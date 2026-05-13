from typing import Optional
from src.domain.exceptions import GoogleCalendarSyncNotAllowedError
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel


class CalendarSyncPolicy:
    @staticmethod
    def can_create_event(
        interview: InterviewScheduleModel,
        connection: Optional[GoogleCalendarConnectionModel],
        requested_explicitly: bool = False,
    ) -> str:
        """Decide se pode criar evento no Google Calendar.
        
        Retorna:
        - "allowed": Pode criar.
        - "already_synced": Já sincronizado.
        - "no_connection": Sem conexão ativa.
        - "cancelled": Entrevista cancelada.
        - "not_requested": Não solicitado.
        """
        if interview.external_calendar_event_id:
            return "already_synced"
            
        if interview.status == "cancelled":
            return "cancelled"
            
        if not connection:
            return "no_connection"
            
        # Se não pediu explicitamente e a política padrão for não sincronizar automaticamente
        if not requested_explicitly:
            # Por padrão vamos permitir se houver conexão, a menos que o usuário queira desativar
            pass
            
        return "allowed"

    @staticmethod
    def can_update_event(
        interview: InterviewScheduleModel,
        connection: Optional[GoogleCalendarConnectionModel],
    ) -> str:
        """Decide se pode atualizar evento no Google Calendar."""
        if not interview.external_calendar_event_id:
            return "not_synced"
            
        if not connection:
            return "no_connection"
            
        if interview.calendar_provider != "google":
            return "different_provider"
            
        return "allowed"

    @staticmethod
    def can_cancel_event(
        interview: InterviewScheduleModel,
        connection: Optional[GoogleCalendarConnectionModel],
    ) -> str:
        """Decide se pode cancelar evento no Google Calendar."""
        if not interview.external_calendar_event_id:
            return "not_synced"
            
        if not connection:
            return "no_connection"
            
        if interview.calendar_provider != "google":
            return "different_provider"
            
        return "allowed"
