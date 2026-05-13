import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone, timedelta
import httpx
from uuid import uuid4

from src.infrastructure.calendar.google_calendar_client import GoogleCalendarClient, CalendarEventPayload
from src.domain.exceptions import GoogleCalendarAuthError, GoogleCalendarApiError, GoogleCalendarRateLimitError
from src.application.services.calendar_sync_policy import CalendarSyncPolicy
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel
from src.application.services.interview_calendar_sync_service import InterviewCalendarSyncService


# ==============================================================================
# GoogleCalendarClient Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_google_calendar_client_create_event_success():
    client = GoogleCalendarClient()
    payload = CalendarEventPayload(
        summary="Test Event",
        description="Test Description",
        start_datetime=datetime.now(timezone.utc),
        end_datetime=datetime.now(timezone.utc) + timedelta(hours=1),
        timezone="UTC",
        attendees=["test@example.com"],
        create_meet=True,
    )
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "id": "event_123",
        "htmlLink": "https://link",
        "status": "confirmed",
        "conferenceData": {
            "entryPoints": [
                {"entryPointType": "video", "uri": "https://meet.google.com/abc"}
            ]
        }
    }
    
    # Mockando o método post da instância do AsyncClient
    # Para simplificar, vamos mockar o AsyncClient inteiro se possível, ou apenas o post.
    # Usando patch.object em httpx.AsyncClient ou similar.
    # Vamos usar uma abordagem mais direta: mockar o __aenter__ do AsyncClient.
    
    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    
    with patch("httpx.AsyncClient", return_value=MagicMock(__aenter__=AsyncMock(return_value=mock_client))):
        result = await client.create_event("fake_token", payload)
        
        assert result.external_event_id == "event_123"
        assert result.html_link == "https://link"
        assert result.meeting_url == "https://meet.google.com/abc"


@pytest.mark.asyncio
async def test_google_calendar_client_create_event_auth_error():
    client = GoogleCalendarClient()
    payload = CalendarEventPayload(
        summary="Test", description="Test", start_datetime=datetime.now(), end_datetime=datetime.now(), timezone="UTC", attendees=[]
    )
    
    mock_response = MagicMock()
    mock_response.status_code = 401
    
    mock_client = MagicMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    
    with patch("httpx.AsyncClient", return_value=MagicMock(__aenter__=AsyncMock(return_value=mock_client))):
        with pytest.raises(GoogleCalendarAuthError):
            await client.create_event("invalid_token", payload)


@pytest.mark.asyncio
async def test_google_calendar_client_update_event_success():
    client = GoogleCalendarClient()
    payload = CalendarEventPayload(
        summary="Test Updated", description="Test", start_datetime=datetime.now(), end_datetime=datetime.now(), timezone="UTC", attendees=[]
    )
    
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"id": "event_123", "htmlLink": "https://link"}
    
    mock_client = MagicMock()
    mock_client.patch = AsyncMock(return_value=mock_response)
    
    with patch("httpx.AsyncClient", return_value=MagicMock(__aenter__=AsyncMock(return_value=mock_client))):
        result = await client.update_event("fake_token", "event_123", payload)
        assert result.external_event_id == "event_123"


@pytest.mark.asyncio
async def test_google_calendar_client_cancel_event_success():
    client = GoogleCalendarClient()
    
    mock_response = MagicMock()
    mock_response.status_code = 204
    
    mock_client = MagicMock()
    mock_client.delete = AsyncMock(return_value=mock_response)
    
    with patch("httpx.AsyncClient", return_value=MagicMock(__aenter__=AsyncMock(return_value=mock_client))):
        result = await client.cancel_event("fake_token", "event_123")
        assert result is True


# ==============================================================================
# Policy Tests
# ==============================================================================

def test_policy_can_create_event():
    interview = InterviewScheduleModel(id=uuid4(), status="scheduled")
    connection = GoogleCalendarConnectionModel(user_id=uuid4())
    
    # Permitido
    assert CalendarSyncPolicy.can_create_event(interview, connection, True) == "allowed"
    
    # Já sincronizado
    interview.external_calendar_event_id = "event_123"
    assert CalendarSyncPolicy.can_create_event(interview, connection, True) == "already_synced"
    
    # Cancelada
    interview.external_calendar_event_id = None
    interview.status = "cancelled"
    assert CalendarSyncPolicy.can_create_event(interview, connection, True) == "cancelled"
    
    # Sem conexão
    interview.status = "scheduled"
    assert CalendarSyncPolicy.can_create_event(interview, None, True) == "no_connection"


# ==============================================================================
# Service Tests (Mocks)
# ==============================================================================

@pytest.mark.asyncio
async def test_service_sync_create_event_already_synced():
    db = AsyncMock()
    db.add = lambda x: None  # Evita warning de coroutine não awaitada
    encryption = AsyncMock()
    oauth = AsyncMock()
    calendar = AsyncMock()
    
    service = InterviewCalendarSyncService(db, encryption, oauth, calendar)
    
    # Mock interview
    interview = InterviewScheduleModel(id=uuid4(), status="scheduled", external_calendar_event_id="event_123")
    db.get.return_value = interview
    
    # Mock execute for idempotency check
    mock_res = MagicMock()
    mock_res.scalar_one_or_none.return_value = None
    db.execute.return_value = mock_res
    
    # Mock connection
    connection = GoogleCalendarConnectionModel(user_id=uuid4())
    service._connection_repo.get_active_by_user_id = AsyncMock(return_value=connection)
    
    # Chama o service
    result = await service.sync_create_event(interview.id, connection.user_id, True)
    
    # Deve retornar "already_synced" e não chamar o Google
    assert result == "already_synced"
    assert calendar.create_event.called is False
