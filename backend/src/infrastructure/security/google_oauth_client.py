import httpx
from src.core.settings import settings
from src.domain.exceptions import ValidationException


class GoogleTokenResponse:
    def __init__(self, data: dict):
        self.access_token = data.get("access_token")
        self.refresh_token = data.get("refresh_token")
        self.expires_in = data.get("expires_in")
        self.scope = data.get("scope")
        self.token_type = data.get("token_type")
        self.id_token = data.get("id_token")


class GoogleUserInfo:
    def __init__(self, data: dict):
        self.email = data.get("email")
        self.name = data.get("name")
        self.picture = data.get("picture")


class GoogleOAuthClient:
    def __init__(self):
        self.client_id = settings.GOOGLE_CLIENT_ID
        self.client_secret = settings.GOOGLE_CLIENT_SECRET
        self.redirect_uri = settings.google_redirect_uri

    async def exchange_code_for_tokens(self, code: str) -> GoogleTokenResponse:
        """Troca o code por tokens no Google."""
        url = "https://oauth2.googleapis.com/token"
        data = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, data=data, timeout=10.0)
                if response.status_code != 200:
                    raise ValidationException(f"Erro no Google OAuth: {response.text}")
                return GoogleTokenResponse(response.json())
            except httpx.RequestError as exc:
                raise ValidationException(f"Erro de rede ao conectar com Google: {exc}")

    async def get_userinfo(self, access_token: str) -> GoogleUserInfo:
        """Busca informações do usuário usando o access_token."""
        url = "https://openidconnect.googleapis.com/v1/userinfo"
        headers = {"Authorization": f"Bearer {access_token}"}
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=headers, timeout=10.0)
                if response.status_code != 200:
                    raise ValidationException(f"Erro ao buscar userinfo no Google: {response.text}")
                return GoogleUserInfo(response.json())
            except httpx.RequestError as exc:
                raise ValidationException(f"Erro de rede ao buscar userinfo no Google: {exc}")

    async def refresh_access_token(self, refresh_token: str) -> GoogleTokenResponse:
        """Renova o access_token usando o refresh_token."""
        url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, data=data, timeout=10.0)
                if response.status_code != 200:
                    raise ValidationException(f"Erro ao renovar token no Google: {response.text}")
                return GoogleTokenResponse(response.json())
            except httpx.RequestError as exc:
                raise ValidationException(f"Erro de rede ao renovar token no Google: {exc}")
