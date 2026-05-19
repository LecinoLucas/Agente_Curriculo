"""Google sign-in for staff users (admin panel).

Flow:
1. Frontend obtains a Google ID token via Google Identity Services (GIS).
2. Calls ``POST /api/v1/auth/google`` with that token.
3. Backend validates the token (via the existing ``GoogleIdentityVerifier``
   used for the candidate portal — same audience, same issuer rules).
4. Backend enforces:
   - ``email_verified == True``
   - email ends with ``settings.GOOGLE_ALLOWED_DOMAIN`` (case-insensitive)
5. Linking is done by **email** (no `google_sub` column needed):
   - existing user → log in, preserve existing role.
   - no user with that email → create with role ``UserRole.VIEWER`` (read-only).
6. Same access/refresh token issuance as ``LoginUseCase`` so the rest of the
   stack (JWT, refresh cookie, audit middleware) sees no difference.

Why link by email only:
- The domain is restricted to a single corporate domain controlled by the org;
- Email comes verified from Google (we check ``email_verified``);
- Avoids a schema migration for ``google_sub`` for a contained P0 ship.
  Add ``google_sub`` later if the org needs strong identity binding
  (e.g., if the same user re-creates a corporate email).
"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.settings import settings
from src.domain.entities.user import User, UserRole
from src.infrastructure.cache.redis_client import get_redis
from src.infrastructure.repositories.sqlalchemy_user_repository import (
    SQLAlchemyUserRepository,
)
from src.infrastructure.security.google_identity_verifier import (
    GoogleIdentity,
    GoogleIdentityConfigurationError,
    GoogleIdentityVerificationError,
    GoogleIdentityVerifier,
)
from src.infrastructure.security.jwt_service import create_access_token
from src.infrastructure.security.password_service import hash_password

logger = structlog.get_logger(__name__)


# Sentinel password for Google-created accounts. The bcrypt hash is unguessable
# and the password path is unreachable for these users (they never call /login).
# Stored hashed only — never persisted in plaintext.
def _opaque_password_hash() -> str:
    return hash_password(secrets.token_urlsafe(32))


# ── Errors mapped by the router to HTTP statuses ─────────────────────────────


class StaffGoogleLoginDisabledError(Exception):
    """Login disabled by settings → 503."""


class StaffGoogleDomainNotAllowedError(Exception):
    """Email domain outside ``GOOGLE_ALLOWED_DOMAIN`` → 403."""


class StaffGoogleEmailNotVerifiedError(Exception):
    """Google account email not verified → 401."""


class StaffGoogleUserInactiveError(Exception):
    """Existing user has been deactivated → 403."""


@dataclass(slots=True)
class StaffGoogleLoginResult:
    access_token: str
    refresh_token: str
    must_change_password: bool
    user_id: str
    role: str
    created: bool


class StaffGoogleAuthService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        verifier: GoogleIdentityVerifier | None = None,
    ) -> None:
        self._db = db
        self._user_repo = SQLAlchemyUserRepository(db)
        self._verifier = verifier or GoogleIdentityVerifier()

    async def authenticate(
        self,
        *,
        id_token: str,
        ip_address: str,
    ) -> StaffGoogleLoginResult:
        if not settings.GOOGLE_LOGIN_ENABLED:
            raise StaffGoogleLoginDisabledError

        identity = await self._verifier.verify(id_token)

        if not identity.email_verified:
            raise StaffGoogleEmailNotVerifiedError

        allowed_domain = settings.GOOGLE_ALLOWED_DOMAIN.strip().lower()
        email = identity.email.strip().lower()
        if not allowed_domain or not email.endswith(f"@{allowed_domain}"):
            logger.warning(
                "staff_google_login.domain_rejected",
                # Mask local part to avoid leaking corporate identifiers in logs.
                email_domain=email.rsplit("@", 1)[-1] if "@" in email else "unknown",
            )
            raise StaffGoogleDomainNotAllowedError

        user = await self._user_repo.find_by_email(email)
        created = False
        if user is None:
            user = await self._create_viewer_user(identity)
            created = True
            logger.info(
                "staff_google_login.user_created",
                user_id=str(user.id),
                role=user.role.value,
            )
        else:
            if not user.is_active:
                logger.warning(
                    "staff_google_login.user_inactive",
                    user_id=str(user.id),
                )
                raise StaffGoogleUserInactiveError
            # Preserve existing role — never auto-promote a Google account.

        access_token = create_access_token(str(user.id), user.role.value)
        refresh_token = secrets.token_urlsafe(64)
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

        redis = await get_redis()
        await redis.setex(
            f"session:refresh:{token_hash}",
            settings.jwt_refresh_expire_seconds,
            str(user.id),
        )

        user.record_successful_login()
        await self._user_repo.save(user)

        logger.info(
            "staff_google_login.success",
            user_id=str(user.id),
            role=user.role.value,
            created=created,
            ip=ip_address,
        )

        return StaffGoogleLoginResult(
            access_token=access_token,
            refresh_token=refresh_token,
            must_change_password=user.must_change_password,
            user_id=str(user.id),
            role=user.role.value,
            created=created,
        )

    async def _create_viewer_user(self, identity: GoogleIdentity) -> User:
        full_name = (identity.name or identity.email.split("@", 1)[0]).strip()
        user = User.create(
            email=identity.email,
            password_hash=_opaque_password_hash(),
            full_name=full_name,
            role=UserRole.VIEWER,
            is_active=True,
        )
        return await self._user_repo.save(user)
