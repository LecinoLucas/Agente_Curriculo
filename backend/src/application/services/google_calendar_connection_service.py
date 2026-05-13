from datetime import datetime, timezone, timedelta
import json
from typing import Optional
from uuid import UUID, uuid4
import secrets
from urllib.parse import urlencode

from redis.asyncio import Redis

from src.domain.exceptions import ValidationException, NotFoundException
from src.infrastructure.database.models.google_calendar_connection_model import GoogleCalendarConnectionModel
from src.infrastructure.repositories.sqlalchemy_google_calendar_connection_repository import (
    SQLAlchemyGoogleCalendarConnectionRepository,
)
from src.infrastructure.security.encryption_service import EncryptionService
from src.infrastructure.security.google_oauth_client import GoogleOAuthClient
from src.core.settings import settings


class GoogleCalendarConnectionService:
    def __init__(
        self,
        repository: SQLAlchemyGoogleCalendarConnectionRepository,
        encryption_service: EncryptionService,
        oauth_client: GoogleOAuthClient,
        redis: Redis,
    ) -> None:
        self._repository = repository
        self._encryption_service = encryption_service
        self._oauth_client = oauth_client
        self._redis = redis

    def _oauth_state_key(self, state: str) -> str:
        return f"oauth_state:{state}"

    def _deserialize_state_payload(self, raw_value: bytes | str) -> dict[str, str]:
        raw_text = raw_value.decode() if isinstance(raw_value, bytes) else raw_value

        try:
            payload = json.loads(raw_text)
        except json.JSONDecodeError:
            payload = None

        if isinstance(payload, dict):
            normalized = {
                key: value
                for key, value in payload.items()
                if isinstance(key, str) and isinstance(value, str)
            }
            if "user_id" in normalized:
                return normalized

        return {"user_id": raw_text}

    def _normalize_return_path(self, return_path: Optional[str]) -> str:
        if not return_path:
            return "/agenda"
        if not return_path.startswith("/") or return_path.startswith("//"):
            return "/agenda"
        return return_path

    async def get_status(self, user_id: UUID) -> dict:
        """Retorna o status da conexão do usuário."""
        conn = await self._repository.get_active_by_user_id(user_id)
        if not conn:
            return {"connected": False}
            
        return {
            "connected": True,
            "google_account_email": conn.google_account_email,
            "scopes": conn.scopes.split(" ") if conn.scopes else [],
            "connected_at": conn.connected_at,
            "revoked_at": conn.revoked_at,
        }

    async def build_auth_url(
        self,
        user_id: UUID,
        frontend_origin: Optional[str] = None,
        return_path: Optional[str] = None,
    ) -> str:
        """Gera a URL de autorização do Google com state seguro."""
        # Gera um state randômico opaco
        state = secrets.token_urlsafe(32)

        # Salva no Redis com TTL de 10 minutos
        key = self._oauth_state_key(state)
        state_payload = {
            "user_id": str(user_id),
            "frontend_origin": frontend_origin or settings.frontend_base_url,
            "return_path": self._normalize_return_path(return_path),
        }
        await self._redis.set(key, json.dumps(state_payload), ex=600)

        # Usa os scopes das configurações
        scope_str = settings.GOOGLE_CALENDAR_SCOPES

        auth_query = urlencode(
            {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "redirect_uri": settings.google_redirect_uri,
                "response_type": "code",
                "scope": scope_str,
                "state": state,
                "access_type": "offline",
                "prompt": "consent",
            }
        )
        return f"https://accounts.google.com/o/oauth2/v2/auth?{auth_query}"

    async def get_oauth_redirect_context(self, state: str) -> dict[str, str]:
        key = self._oauth_state_key(state)
        payload_raw = await self._redis.get(key)

        if not payload_raw:
            raise ValidationException("State inválido ou expirado")

        payload = self._deserialize_state_payload(payload_raw)
        frontend_origin = payload.get("frontend_origin") or settings.frontend_base_url
        return_path = self._normalize_return_path(payload.get("return_path"))

        return {
            "frontend_origin": frontend_origin.rstrip("/"),
            "return_path": return_path,
            "frontend_redirect_url": f"{frontend_origin.rstrip('/')}{return_path}",
        }

    async def handle_oauth_callback(self, code: str, state: str) -> bool:
        """Trata o callback do Google, troca code por tokens e salva."""
        # Validar state no Redis
        key = self._oauth_state_key(state)
        user_id_bytes = await self._redis.get(key)

        if not user_id_bytes:
            raise ValidationException("State inválido ou expirado")

        # Consumir state (one-time-use)
        await self._redis.delete(key)

        state_payload = self._deserialize_state_payload(user_id_bytes)
        user_id_str = state_payload["user_id"]
        user_id = UUID(user_id_str)

        # Trocar code por tokens
        token_response = await self._oauth_client.exchange_code_for_tokens(code)

        if not token_response.refresh_token:
            raise ValidationException("Google não retornou refresh_token. Reautorização necessária com prompt=consent.")

        # Buscar userinfo/email
        user_info = await self._oauth_client.get_userinfo(token_response.access_token)

        # Calcular expires_at
        expires_in = token_response.expires_in or 3600
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        # Criptografar tokens
        access_token_encrypted = self._encryption_service.encrypt(token_response.access_token)
        refresh_token_encrypted = self._encryption_service.encrypt(token_response.refresh_token)

        # Salvar no banco
        await self._repository.upsert_connection(
            user_id=user_id,
            google_account_email=user_info.email or "unknown@gmail.com",
            access_token_encrypted=access_token_encrypted,
            refresh_token_encrypted=refresh_token_encrypted,
            scopes=token_response.scope or " ".join([
                "openid", "email", "profile", "https://www.googleapis.com/auth/calendar.events"
            ]),
            expires_at=expires_at,
        )
        return True

    async def disconnect(self, user_id: UUID) -> bool:
        """Desconecta a conta do usuário."""
        return await self._repository.revoke_active_connection(user_id)
