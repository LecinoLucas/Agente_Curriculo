from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class UserRole(str, Enum):
    """
    User roles in the system.

    IMPORTANT - Semantic Meaning:
    ────────────────────────────
    - ADMIN: Full system access, no restrictions.
    - RECRUITER: Hiring operations (jobs, candidates, pipeline, interviews, scorecards, hiring decisions).
    - HR: Pre-admission, documents, admission packages, ERP integration, HR communications.
    - MANAGER: Simplified view of candidates in assigned jobs, interviews as participant, scorecards as evaluator.
    - VIEWER: Read-only, limited to aggregated data, no sensitive/internal data.
    - CANDIDATE: External candidate account with portal access only.
    """
    ADMIN = "admin"
    RECRUITER = "recruiter"
    HR = "hr"
    MANAGER = "manager"
    VIEWER = "viewer"
    CANDIDATE = "candidate"


class UserStatus(str, Enum):
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


class UserPreferredTheme(str, Enum):
    THEME_1 = "theme_1"
    THEME_2 = "theme_2"
    THEME_3 = "theme_3"
    THEME_4 = "theme_4"


DEFAULT_PREFERRED_THEME = UserPreferredTheme.THEME_4
MAX_FAILED_LOGINS = 5
LOCKOUT_DURATION_MINUTES = 15


@dataclass
class User:
    id: UUID
    email: str
    password_hash: str
    role: UserRole
    status: UserStatus
    full_name: str
    created_at: datetime
    updated_at: datetime
    email_verified_at: Optional[datetime] = None
    avatar_url: Optional[str] = None
    must_change_password: bool = False
    last_login_at: Optional[datetime] = None
    login_count: int = 0
    failed_login_count: int = 0
    locked_until: Optional[datetime] = None
    preferred_theme: Optional[UserPreferredTheme] = DEFAULT_PREFERRED_THEME
    deleted_at: Optional[datetime] = None

    @classmethod
    def create(
        cls,
        email: str,
        password_hash: str,
        full_name: str,
        role: UserRole = UserRole.CANDIDATE,
        is_active: bool | None = None,
        must_change_password: bool = False,
    ) -> "User":
        now = datetime.now(timezone.utc)
        if is_active is None:
            status = UserStatus.PENDING_VERIFICATION
            email_verified_at = None
        else:
            status = UserStatus.ACTIVE if is_active else UserStatus.INACTIVE
            email_verified_at = now if is_active else None
        return cls(
            id=uuid4(),
            email=email.lower().strip(),
            password_hash=password_hash,
            role=role,
            status=status,
            full_name=full_name.strip(),
            created_at=now,
            updated_at=now,
            email_verified_at=email_verified_at,
            must_change_password=must_change_password,
        )

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE and self.deleted_at is None

    @property
    def is_locked(self) -> bool:
        if self.locked_until is None:
            return False
        lu = self.locked_until
        if lu.tzinfo is None:
            lu = lu.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) < lu

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def record_failed_login(self) -> None:
        self.failed_login_count += 1
        self.updated_at = datetime.now(timezone.utc)
        if self.failed_login_count >= MAX_FAILED_LOGINS:
            self.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)

    def record_successful_login(self) -> None:
        self.login_count += 1
        self.failed_login_count = 0
        self.locked_until = None
        self.last_login_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def verify_email(self) -> None:
        self.email_verified_at = datetime.now(timezone.utc)
        self.status = UserStatus.ACTIVE
        self.updated_at = datetime.now(timezone.utc)

    def set_password(self, password_hash: str, *, must_change_password: bool) -> None:
        self.password_hash = password_hash
        self.must_change_password = must_change_password
        self.updated_at = datetime.now(timezone.utc)

    def clear_must_change_password(self) -> None:
        self.must_change_password = False
        self.updated_at = datetime.now(timezone.utc)

    def soft_delete(self) -> None:
        self.deleted_at = datetime.now(timezone.utc)
        self.status = UserStatus.INACTIVE
        self.updated_at = datetime.now(timezone.utc)
