from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_auth_token_model import (
    CandidateAuthTokenModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.security.password_service import verify_password

PORTAL_SESSION_PURPOSE = "portal_session"
CANDIDATE_PORTAL_COOKIE_NAME = "candidate_portal_token"
PORTAL_SESSION_TTL_HOURS = 24


class CandidatePortalAuthError(Exception):
    pass


class CandidatePortalInvalidCredentialsError(CandidatePortalAuthError):
    pass


class CandidatePortalSessionError(CandidatePortalAuthError):
    pass


@dataclass(slots=True)
class CandidatePortalSession:
    candidate_id: UUID
    session_id: UUID


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
            raise CandidatePortalInvalidCredentialsError

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

    @staticmethod
    def _normalize_email(value: str | None) -> str | None:
        return value.lower().strip() if value else None

    @staticmethod
    def _sha256(value: str) -> str:
        return sha256(value.encode("utf-8")).hexdigest()
