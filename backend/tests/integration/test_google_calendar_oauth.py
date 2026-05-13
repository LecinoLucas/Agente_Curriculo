import json
import pytest
from uuid import uuid4
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.google_calendar_connection_service import GoogleCalendarConnectionService
from src.infrastructure.repositories.sqlalchemy_google_calendar_connection_repository import (
    SQLAlchemyGoogleCalendarConnectionRepository,
)
from src.infrastructure.security.encryption_service import EncryptionService
from src.infrastructure.security.google_oauth_client import GoogleOAuthClient, GoogleTokenResponse, GoogleUserInfo
from src.infrastructure.database.models.user_model import UserModel


@pytest.mark.asyncio
async def test_build_auth_url_creates_secure_state(fake_redis):
    """Gera URL com state opaco e salva no Redis."""
    repo = AsyncMock()
    enc = AsyncMock()
    oauth = AsyncMock()
    
    service = GoogleCalendarConnectionService(repo, enc, oauth, fake_redis)
    user_id = uuid4()
    
    url = await service.build_auth_url(
        user_id,
        frontend_origin="http://localhost:5173",
        return_path="/agenda?tab=calendar",
    )
    
    # Verifica se a URL contém o state
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert "state" in query
    state = query["state"][0]
    
    # Verifica se o state NÃO contém o user_id puro
    assert str(user_id) not in state

    # Verifica que redirect_uri e scope foram codificados corretamente
    assert "redirect_uri" in query
    assert "scope" in query
    
    # Verifica se salvou no Redis
    val = await fake_redis.get(f"oauth_state:{state}")
    payload = json.loads(val.decode() if isinstance(val, bytes) else val)
    assert payload["user_id"] == str(user_id)
    assert payload["frontend_origin"] == "http://localhost:5173"
    assert payload["return_path"] == "/agenda?tab=calendar"


@pytest.mark.asyncio
async def test_callback_rejects_invalid_state(fake_redis):
    """Rejeita callback com state inexistente."""
    repo = AsyncMock()
    enc = AsyncMock()
    oauth = AsyncMock()
    
    service = GoogleCalendarConnectionService(repo, enc, oauth, fake_redis)
    
    with pytest.raises(Exception) as exc:
        await service.handle_oauth_callback("code", "invalid_state")
    assert "State inválido" in str(exc.value)


@pytest.mark.asyncio
async def test_callback_rejects_consumed_state(fake_redis):
    """Rejeita state que já foi usado."""
    repo = AsyncMock()
    enc = AsyncMock()
    oauth = AsyncMock()
    
    service = GoogleCalendarConnectionService(repo, enc, oauth, fake_redis)
    user_id = uuid4()
    state = "valid_state"
    
    # Salvar no Redis
    await fake_redis.set(f"oauth_state:{state}", str(user_id))
    
    # Mock do OAuth
    oauth.exchange_code_for_tokens.return_value = GoogleTokenResponse({
        "access_token": "at",
        "refresh_token": "rt",
        "expires_in": 3600
    })
    oauth.get_userinfo.return_value = GoogleUserInfo({"email": "test@gmail.com"})
    
    # Primeiro uso deve passar
    await service.handle_oauth_callback("code", state)
    
    # Segundo uso deve falhar
    with pytest.raises(Exception) as exc:
        await service.handle_oauth_callback("code", state)
    assert "State inválido" in str(exc.value)


@pytest.mark.asyncio
async def test_callback_fails_if_no_refresh_token(fake_redis):
    """Falha se o Google não retornar refresh_token."""
    repo = AsyncMock()
    enc = AsyncMock()
    oauth = AsyncMock()
    
    service = GoogleCalendarConnectionService(repo, enc, oauth, fake_redis)
    user_id = uuid4()
    state = "valid_state"
    
    await fake_redis.set(f"oauth_state:{state}", str(user_id))
    
    # Google não retorna refresh_token
    oauth.exchange_code_for_tokens.return_value = GoogleTokenResponse({
        "access_token": "at",
        "expires_in": 3600
    })
    
    with pytest.raises(Exception) as exc:
        await service.handle_oauth_callback("code", state)
    assert "refresh_token" in str(exc.value)


@pytest.mark.asyncio
async def test_google_oauth_client_exchange_code():
    """Testa que o client faz a chamada HTTP correta."""
    client = GoogleOAuthClient()
    
    mock_response = AsyncMock()
    mock_response.status_code = 200
    from unittest.mock import MagicMock
    mock_response.json = MagicMock(return_value={
        "access_token": "at",
        "refresh_token": "rt",
        "expires_in": 3600
    })
    
    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        resp = await client.exchange_code_for_tokens("valid_code")
        
        assert resp.access_token == "at"
        assert resp.refresh_token == "rt"
        mock_post.assert_called_once()
