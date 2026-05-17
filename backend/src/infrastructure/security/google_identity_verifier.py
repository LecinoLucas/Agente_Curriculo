from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from src.core.settings import settings


class GoogleIdentityVerificationError(Exception):
    pass


class GoogleIdentityConfigurationError(Exception):
    pass


@dataclass(slots=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str | None
    picture: str | None


class GoogleIdentityVerifier:
    TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"
    VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}

    async def verify(self, id_token: str) -> GoogleIdentity:
        client_id = settings.GOOGLE_CLIENT_ID.strip()
        if not client_id:
            raise GoogleIdentityConfigurationError

        token = id_token.strip()
        if not token:
            raise GoogleIdentityVerificationError("Token do Google ausente.")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.TOKEN_INFO_URL, params={"id_token": token})
        except httpx.RequestError as exc:
            raise GoogleIdentityVerificationError("Não foi possível validar o token do Google.") from exc

        if response.status_code != 200:
            raise GoogleIdentityVerificationError("Token do Google inválido ou expirado.")

        payload = response.json()
        audience = str(payload.get("aud") or "").strip()
        issuer = str(payload.get("iss") or "").strip()
        subject = str(payload.get("sub") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        email_verified = str(payload.get("email_verified") or "").strip().lower() == "true"
        exp_raw = str(payload.get("exp") or "").strip()

        if audience != client_id:
            raise GoogleIdentityVerificationError("Token do Google inválido para esta aplicação.")
        if issuer not in self.VALID_ISSUERS:
            raise GoogleIdentityVerificationError("Emissor do Google inválido.")
        if not subject or not email:
            raise GoogleIdentityVerificationError("Token do Google incompleto.")
        if not exp_raw.isdigit():
            raise GoogleIdentityVerificationError("Token do Google inválido ou expirado.")

        expires_at = datetime.fromtimestamp(int(exp_raw), tz=UTC)
        if expires_at <= datetime.now(UTC):
            raise GoogleIdentityVerificationError("Token do Google inválido ou expirado.")

        return GoogleIdentity(
            sub=subject,
            email=email,
            email_verified=email_verified,
            name=str(payload.get("name") or "").strip() or None,
            picture=str(payload.get("picture") or "").strip() or None,
        )
