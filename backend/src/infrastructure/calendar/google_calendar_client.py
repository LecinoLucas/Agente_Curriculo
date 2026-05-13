import httpx
from datetime import datetime, timezone
from typing import Optional, List
from uuid import uuid4
from src.domain.exceptions import (
    GoogleCalendarAuthError,
    GoogleCalendarApiError,
    GoogleCalendarRateLimitError,
)


class CalendarEventPayload:
    def __init__(
        self,
        summary: str,
        description: str,
        start_datetime: datetime,
        end_datetime: datetime,
        timezone: str,
        attendees: List[str],
        location: Optional[str] = None,
        create_meet: bool = False,
    ):
        self.summary = summary
        self.description = description
        self.start_datetime = start_datetime
        self.end_datetime = end_datetime
        self.timezone = timezone
        self.attendees = attendees
        self.location = location
        self.create_meet = create_meet


class CalendarEventResult:
    def __init__(
        self,
        external_event_id: str,
        html_link: str,
        meeting_url: Optional[str] = None,
        provider: str = "google",
        raw_status: Optional[str] = None,
    ):
        self.external_event_id = external_event_id
        self.html_link = html_link
        self.meeting_url = meeting_url
        self.provider = provider
        self.raw_status = raw_status


class GoogleCalendarClient:
    def __init__(self):
        pass

    async def create_event(self, access_token: str, payload: CalendarEventPayload) -> CalendarEventResult:
        """Cria um evento no Google Calendar."""
        url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        
        body = {
            "summary": payload.summary,
            "description": payload.description,
            "start": {
                "dateTime": payload.start_datetime.isoformat(),
                "timeZone": payload.timezone,
            },
            "end": {
                "dateTime": payload.end_datetime.isoformat(),
                "timeZone": payload.timezone,
            },
            "attendees": [{"email": email} for email in payload.attendees],
            "location": payload.location,
        }
        
        if payload.create_meet:
            body["conferenceData"] = {
                "createRequest": {
                    "requestId": f"meet_{uuid4().hex}",
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            }
            url += "?conferenceDataVersion=1"
            
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, headers=headers, json=body, timeout=10.0)
                if response.status_code == 401:
                    raise GoogleCalendarAuthError("Token inválido ou expirado")
                elif response.status_code == 429:
                    raise GoogleCalendarRateLimitError("Limite de requisições excedido no Google")
                elif response.status_code != 200:
                    raise GoogleCalendarApiError(f"Erro na API do Google: {response.text}")
                    
                data = response.json()
                
                # Extrair Meet URL
                meeting_url = None
                conf_data = data.get("conferenceData", {})
                entry_points = conf_data.get("entryPoints", [])
                for ep in entry_points:
                    if ep.get("entryPointType") == "video":
                        meeting_url = ep.get("uri")
                        break
                        
                return CalendarEventResult(
                    external_event_id=data.get("id"),
                    html_link=data.get("htmlLink"),
                    meeting_url=meeting_url,
                    raw_status=data.get("status"),
                )
            except httpx.RequestError as exc:
                raise GoogleCalendarApiError(f"Erro de rede ao conectar com Google: {exc}")

    async def update_event(self, access_token: str, event_id: str, payload: CalendarEventPayload) -> CalendarEventResult:
        """Atualiza um evento no Google Calendar."""
        url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }
        
        body = {
            "summary": payload.summary,
            "description": payload.description,
            "start": {
                "dateTime": payload.start_datetime.isoformat(),
                "timeZone": payload.timezone,
            },
            "end": {
                "dateTime": payload.end_datetime.isoformat(),
                "timeZone": payload.timezone,
            },
            "attendees": [{"email": email} for email in payload.attendees],
            "location": payload.location,
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.patch(url, headers=headers, json=body, timeout=10.0)
                if response.status_code == 401:
                    raise GoogleCalendarAuthError("Token inválido ou expirado")
                elif response.status_code == 404:
                    raise GoogleCalendarApiError("Evento não encontrado no Google Calendar")
                elif response.status_code == 429:
                    raise GoogleCalendarRateLimitError("Limite de requisições excedido no Google")
                elif response.status_code != 200:
                    raise GoogleCalendarApiError(f"Erro na API do Google: {response.text}")
                    
                data = response.json()
                return CalendarEventResult(
                    external_event_id=data.get("id"),
                    html_link=data.get("htmlLink"),
                    raw_status=data.get("status"),
                )
            except httpx.RequestError as exc:
                raise GoogleCalendarApiError(f"Erro de rede ao conectar com Google: {exc}")

    async def cancel_event(self, access_token: str, event_id: str) -> bool:
        """Deleta um evento no Google Calendar."""
        url = f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.delete(url, headers=headers, timeout=10.0)
                if response.status_code == 401:
                    raise GoogleCalendarAuthError("Token inválido ou expirado")
                elif response.status_code == 404:
                    # Se não encontrado, já foi deletado ou não existe.
                    return True
                elif response.status_code == 429:
                    raise GoogleCalendarRateLimitError("Limite de requisições excedido no Google")
                elif response.status_code != 204 and response.status_code != 200:
                    raise GoogleCalendarApiError(f"Erro na API do Google: {response.text}")
                    
                return True
            except httpx.RequestError as exc:
                raise GoogleCalendarApiError(f"Erro de rede ao conectar com Google: {exc}")
