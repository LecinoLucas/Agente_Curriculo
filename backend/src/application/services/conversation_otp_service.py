"""OTP generation and verification for conversation identity (OP-6F.2).

Security properties:
- The OTP itself is never stored; only SHA-256(session_id + ":" + code) is saved,
  using session_id as a per-record salt so identical codes from different sessions
  produce different hashes (prevents cross-session replay of leaked hashes).
- Verification uses constant-time comparison (hmac.compare_digest) to avoid
  timing attacks.
- In production the plaintext code must be sent via an external channel (SMS,
  WhatsApp) — the caller is responsible for delivery. In dev/test the code is
  logged via structlog at a WARNING level so it appears in the test output without
  being included in any HTTP response.
- The same public response is returned whether the candidate was found or not
  (anti-enumeration): callers must not branch on candidate resolution here.
"""
from __future__ import annotations

import hmac
import logging
import random
import string
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.infrastructure.database.models.conversation_otp_model import ConversationOtpModel

_logger = logging.getLogger(__name__)

_OTP_ALPHABET = string.digits
_OTP_LENGTH = 6


def _generate_code() -> str:
    return "".join(random.SystemRandom().choices(_OTP_ALPHABET, k=_OTP_LENGTH))


def _hash_code(session_id: UUID, code: str) -> str:
    """Hash the OTP code salted with the session_id.

    Using session_id as a salt means the same 6-digit code from two different
    sessions produces two different hashes, preventing cross-session replay if a
    hash is ever leaked.
    """
    payload = f"{session_id}:{code}".encode()
    return sha256(payload).hexdigest()


class ConversationOtpService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Generation ────────────────────────────────────────────────────────────

    async def issue_otp(
        self,
        *,
        session_id: UUID,
        candidate_id: UUID | None,
        identifier_type: str,
    ) -> ConversationOtpModel:
        """Generate a new OTP for the given session and persist the hash.

        Any previous un-consumed, non-expired OTPs for the same session are
        invalidated (consumed) to prevent accumulation.  Returns the new OTP
        record; the caller decides how to deliver the code.
        """
        await self._invalidate_active_for_session(session_id)

        code = _generate_code()
        expires_at = datetime.now(UTC) + timedelta(minutes=settings.OTP_EXPIRATION_MINUTES)
        otp = ConversationOtpModel(
            session_id=session_id,
            candidate_id=candidate_id,
            identifier_type=identifier_type,
            otp_hash=_hash_code(session_id, code),
            expires_at=expires_at,
            attempts=0,
            max_attempts=settings.OTP_MAX_ATTEMPTS,
        )
        self._db.add(otp)
        await self._db.flush()

        # Dev/test delivery: emit via logging so tests can capture the code
        # without it appearing in any HTTP response. NEVER log in production.
        if not settings.is_production:
            _logger.warning(
                "conversation.otp.dev_code",
                extra={
                    "session_id": str(session_id),
                    "otp_code": code,
                    "expires_at": expires_at.isoformat(),
                },
            )

        return otp

    # ── Verification ──────────────────────────────────────────────────────────

    async def verify_otp(
        self,
        *,
        session_id: UUID,
        code: str,
    ) -> _VerifyResult:
        """Verify the candidate-supplied code against the active OTP.

        Returns a _VerifyResult describing what happened.  The caller should
        branch on ``result.outcome`` (never on outcome details that would leak
        enumeration information in the public response).
        """
        otp = await self._get_active_otp(session_id)
        now = datetime.now(UTC)

        if otp is None:
            return _VerifyResult(outcome="no_otp")

        if otp.consumed_at is not None:
            return _VerifyResult(outcome="already_consumed")

        # Normalize to UTC-aware for comparison (SQLite may return naive datetimes).
        expires = otp.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if now >= expires:
            return _VerifyResult(outcome="expired")

        if otp.attempts >= otp.max_attempts:
            return _VerifyResult(outcome="locked")

        # Constant-time comparison: avoid timing attacks.
        expected = _hash_code(session_id, code.strip())
        if not hmac.compare_digest(expected, otp.otp_hash):
            otp.attempts += 1
            await self._db.flush()
            remaining = otp.max_attempts - otp.attempts
            if remaining <= 0:
                return _VerifyResult(outcome="locked")
            return _VerifyResult(outcome="wrong_code", attempts_remaining=remaining)

        # Success — mark consumed and return the associated candidate_id.
        otp.consumed_at = now
        await self._db.flush()
        return _VerifyResult(outcome="ok", candidate_id=otp.candidate_id)

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _get_active_otp(self, session_id: UUID) -> ConversationOtpModel | None:
        return await self._db.scalar(
            sa.select(ConversationOtpModel)
            .where(
                ConversationOtpModel.session_id == session_id,
            )
            .order_by(ConversationOtpModel.created_at.desc())
            .limit(1)
        )

    async def _invalidate_active_for_session(self, session_id: UUID) -> None:
        """Consume all existing OTPs for the session so old codes stop working."""
        now = datetime.now(UTC)
        await self._db.execute(
            sa.update(ConversationOtpModel)
            .where(
                ConversationOtpModel.session_id == session_id,
                ConversationOtpModel.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )


class _VerifyResult:
    __slots__ = ("outcome", "candidate_id", "attempts_remaining")

    def __init__(
        self,
        outcome: str,
        *,
        candidate_id: UUID | None = None,
        attempts_remaining: int = 0,
    ) -> None:
        self.outcome = outcome
        self.candidate_id = candidate_id
        self.attempts_remaining = attempts_remaining
