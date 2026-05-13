import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.google_calendar_connection_service import GoogleCalendarConnectionService
from src.domain.exceptions import ValidationException
from src.domain.entities.user import UserRole

from .helpers import _auth_headers, _create_active_user


@pytest.mark.asyncio
async def test_google_calendar_auth_url_returns_expected_contract(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
):
    await _create_active_user(
        db_session,
        email="calendar@test.com",
        password="password123",
        role=UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "calendar@test.com", "password123")

    async def fake_build_auth_url(self, user_id, frontend_origin=None, return_path=None):
        return "https://accounts.google.com/mock-auth"

    monkeypatch.setattr(
        GoogleCalendarConnectionService,
        "build_auth_url",
        fake_build_auth_url,
    )

    response = await client.get(
        "/api/v1/integrations/google-calendar/auth-url",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["auth_url"] == "https://accounts.google.com/mock-auth"


@pytest.mark.asyncio
async def test_google_calendar_callback_returns_browser_html_on_success(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_get_oauth_redirect_context(self, state):
        return {
            "frontend_origin": "http://localhost:5173",
            "return_path": "/agenda",
            "frontend_redirect_url": "http://localhost:5173/agenda",
        }

    async def fake_handle_oauth_callback(self, code, state):
        return True

    monkeypatch.setattr(
        GoogleCalendarConnectionService,
        "get_oauth_redirect_context",
        fake_get_oauth_redirect_context,
    )
    monkeypatch.setattr(
        GoogleCalendarConnectionService,
        "handle_oauth_callback",
        fake_handle_oauth_callback,
    )

    response = await client.get(
        "/api/v1/integrations/google-calendar/callback?code=test-code&state=test-state"
    )

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "GOOGLE_CALENDAR_OAUTH_RESULT" in response.text
    assert '"success": true' in response.text
    assert "window.opener.postMessage" in response.text
    assert "google_calendar_oauth=success" in response.text


@pytest.mark.asyncio
async def test_google_calendar_callback_hides_internal_errors(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    async def fake_get_oauth_redirect_context(self, state):
        return {
            "frontend_origin": "http://localhost:5173",
            "return_path": "/agenda",
            "frontend_redirect_url": "http://localhost:5173/agenda",
        }

    async def fake_handle_oauth_callback(self, code, state):
        raise ValidationException("refresh_token ausente do provedor")

    monkeypatch.setattr(
        GoogleCalendarConnectionService,
        "get_oauth_redirect_context",
        fake_get_oauth_redirect_context,
    )
    monkeypatch.setattr(
        GoogleCalendarConnectionService,
        "handle_oauth_callback",
        fake_handle_oauth_callback,
    )

    response = await client.get(
        "/api/v1/integrations/google-calendar/callback?code=test-code&state=test-state"
    )

    assert response.status_code == 400
    assert "text/html" in response.headers["content-type"]
    assert '"success": false' in response.text
    assert "refresh_token ausente do provedor" not in response.text
    assert "google_calendar_oauth=error" in response.text
