from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.database.models.candidate_auth_token_model import (
    CandidateAuthTokenModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.security.password_service import hash_password, verify_password

PORTAL_SESSION_PURPOSE = "portal_session"
PASSWORD_SETUP_PURPOSE = "password_setup"
CANDIDATE_PORTAL_COOKIE_NAME = "candidate_portal_token"
PORTAL_SESSION_TTL_HOURS = 24
PASSWORD_SETUP_TTL_HOURS = 2

MAX_CANDIDATE_FAILED_LOGINS = 5
CANDIDATE_LOCKOUT_TTL_SECONDS = 15 * 60  # 15 minutos
_ATTEMPTS_KEY_PREFIX = "candidate_auth_attempts:"


class CandidatePortalAuthError(Exception):
    pass


class CandidatePortalInvalidCredentialsError(CandidatePortalAuthError):
    pass


class CandidatePortalSessionError(CandidatePortalAuthError):
    pass


class CandidatePortalLockedError(CandidatePortalAuthError):
    pass


class CandidatePortalPasswordSetupInvalidTokenError(CandidatePortalAuthError):
    pass


@dataclass(slots=True)
class CandidatePortalSession:
    candidate_id: UUID
    session_id: UUID


@dataclass(slots=True)
class CandidatePasswordSetupToken:
    candidate_id: UUID
    email: str
    full_name: str | None
    token: str
    expires_at: datetime


class CandidatePortalAuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def login(
        self,
        *,
        email: str,
        password: str,
        ip_address: str,
        user_agent: str,
    ) -> tuple[str, datetime]:
        clean_email = self._normalize_email(email)
        if clean_email is None or not password:
            raise CandidatePortalInvalidCredentialsError

        # Verificar bloqueio temporário antes de qualquer operação custosa
        if await self._is_locked(clean_email):
            raise CandidatePortalLockedError

        row = await self._db.execute(
            sa.select(
                CandidateModel.id,
                CandidateModel.password_hash,
            )
            .where(
                CandidateModel.email == clean_email,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
            .limit(1)
        )
        candidate = row.mappings().first()
        if candidate is None:
            raise CandidatePortalInvalidCredentialsError

        password_hash = candidate["password_hash"]
        if not password_hash or not verify_password(password, password_hash):
            await self._record_failed_attempt(clean_email)
            raise CandidatePortalInvalidCredentialsError

        # Sucesso: limpar contador de tentativas
        await self._clear_failed_attempts(clean_email)

        await self._db.execute(
            sa.update(CandidateModel)
            .where(CandidateModel.id == candidate["id"])
            .values(last_login_at=datetime.now(UTC))
        )
        return await self.create_session(
            candidate_id=candidate["id"],
            ip_address=ip_address,
            user_agent=user_agent,
        )

    async def create_session(
        self,
        *,
        candidate_id: UUID,
        ip_address: str,
        user_agent: str,
    ) -> tuple[str, datetime]:
        session_token = secrets.token_urlsafe(32)
        session_expires_at = datetime.now(UTC) + timedelta(hours=PORTAL_SESSION_TTL_HOURS)
        session = CandidateAuthTokenModel(
            candidate_id=candidate_id,
            purpose=PORTAL_SESSION_PURPOSE,
            token_hash=self._sha256(session_token),
            expires_at=session_expires_at,
            ip_hash=self._sha256(ip_address),
            user_agent_hash=self._sha256(user_agent),
        )
        self._db.add(session)
        await self._db.flush()
        return session_token, session_expires_at

    async def request_password_setup(
        self,
        *,
        email: str,
        ip_address: str,
        user_agent: str,
    ) -> CandidatePasswordSetupToken | None:
        clean_email = self._normalize_email(email)
        if clean_email is None:
            return None

        row = await self._db.execute(
            sa.select(
                CandidateModel.id,
                CandidateModel.email,
                CandidateModel.full_name,
            )
            .where(
                sa.func.lower(CandidateModel.email) == clean_email,
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
            .limit(1)
        )
        candidate = row.mappings().first()
        if candidate is None:
            return None

        now = datetime.now(UTC)
        await self._db.execute(
            sa.update(CandidateAuthTokenModel)
            .where(
                CandidateAuthTokenModel.candidate_id == candidate["id"],
                CandidateAuthTokenModel.purpose == PASSWORD_SETUP_PURPOSE,
                CandidateAuthTokenModel.used_at.is_(None),
            )
            .values(used_at=now)
        )

        raw_token = secrets.token_urlsafe(32)
        expires_at = now + timedelta(hours=PASSWORD_SETUP_TTL_HOURS)
        self._db.add(
            CandidateAuthTokenModel(
                candidate_id=candidate["id"],
                purpose=PASSWORD_SETUP_PURPOSE,
                token_hash=self._sha256(raw_token),
                expires_at=expires_at,
                ip_hash=self._sha256(ip_address),
                user_agent_hash=self._sha256(user_agent),
            )
        )
        await self._db.flush()
        return CandidatePasswordSetupToken(
            candidate_id=candidate["id"],
            email=candidate["email"],
            full_name=candidate["full_name"],
            token=raw_token,
            expires_at=expires_at,
        )

    async def confirm_password_setup(
        self,
        *,
        token: str,
        password: str,
    ) -> UUID:
        if not token or not password:
            raise CandidatePortalPasswordSetupInvalidTokenError

        now = datetime.now(UTC)
        token_hash = self._sha256(token)
        row = await self._db.execute(
            sa.select(CandidateAuthTokenModel, CandidateModel)
            .join(CandidateModel, CandidateModel.id == CandidateAuthTokenModel.candidate_id)
            .where(
                CandidateAuthTokenModel.purpose == PASSWORD_SETUP_PURPOSE,
                CandidateAuthTokenModel.token_hash == token_hash,
                CandidateAuthTokenModel.used_at.is_(None),
                CandidateModel.deleted_at.is_(None),
                CandidateModel.archived_at.is_(None),
            )
            .limit(1)
        )
        result = row.first()
        if result is None:
            raise CandidatePortalPasswordSetupInvalidTokenError

        auth_token, candidate = result
        expires_at = auth_token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= now:
            raise CandidatePortalPasswordSetupInvalidTokenError

        candidate.password_hash = hash_password(password)
        candidate.password_created_at = now
        auth_token.used_at = now
        await self._db.flush()
        return candidate.id

    async def authenticate(self, session_token: str | None) -> CandidatePortalSession:
        if not session_token:
            raise CandidatePortalSessionError

        token_hash = self._sha256(session_token)
        now = datetime.now(UTC)
        row = await self._db.execute(
            sa.select(
                CandidateAuthTokenModel.id.label("session_id"),
                CandidateAuthTokenModel.candidate_id.label("candidate_id"),
            )
            .where(
                CandidateAuthTokenModel.purpose == PORTAL_SESSION_PURPOSE,
                CandidateAuthTokenModel.token_hash == token_hash,
                CandidateAuthTokenModel.used_at.is_(None),
                CandidateAuthTokenModel.expires_at > now,
            )
            .limit(1)
        )
        session_row = row.mappings().first()
        if session_row is None:
            raise CandidatePortalSessionError

        return CandidatePortalSession(
            candidate_id=session_row["candidate_id"],
            session_id=session_row["session_id"],
        )

    async def logout(self, session_token: str | None) -> None:
        if not session_token:
            return

        token_hash = self._sha256(session_token)
        await self._db.execute(
            sa.update(CandidateAuthTokenModel)
            .where(
                CandidateAuthTokenModel.purpose == PORTAL_SESSION_PURPOSE,
                CandidateAuthTokenModel.token_hash == token_hash,
                CandidateAuthTokenModel.used_at.is_(None),
            )
            .values(used_at=datetime.now(UTC))
        )

    async def _is_locked(self, email: str) -> bool:
        redis = await get_redis()
        key = f"{_ATTEMPTS_KEY_PREFIX}{self._sha256(email)}"
        val = await redis.get(key)
        return int(val) >= MAX_CANDIDATE_FAILED_LOGINS if val else False

    async def _record_failed_attempt(self, email: str) -> None:
        redis = await get_redis()
        key = f"{_ATTEMPTS_KEY_PREFIX}{self._sha256(email)}"
        val = await redis.get(key)
        count = (int(val) if val else 0) + 1
        await redis.setex(key, CANDIDATE_LOCKOUT_TTL_SECONDS, str(count))

    async def _clear_failed_attempts(self, email: str) -> None:
        redis = await get_redis()
        key = f"{_ATTEMPTS_KEY_PREFIX}{self._sha256(email)}"
        await redis.delete(key)

    @staticmethod
    def _normalize_email(value: str | None) -> str | None:
        return value.lower().strip() if value else None

    @staticmethod
    def _sha256(value: str) -> str:
        return sha256(value.encode("utf-8")).hexdigest()
