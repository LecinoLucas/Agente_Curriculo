from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4


class UserRole(str, Enum):
    ADMIN = "admin"
    RECRUITER = "recruiter"
    CANDIDATE = "candidate"
    VIEWER = "viewer"


class UserStatus(str, Enum):
    PENDING_VERIFICATION = "pending_verification"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"


MAX_FAILED_LOGINS = 5


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
    last_login_at: Optional[datetime] = None
    login_count: int = 0
    failed_login_count: int = 0
    locked_until: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

    @classmethod
    def create(
        cls,
        email: str,
        password_hash: str,
        full_name: str,
        role: UserRole = UserRole.CANDIDATE,
    ) -> "User":
        now = datetime.now(timezone.utc)
        return cls(
            id=uuid4(),
            email=email.lower().strip(),
            password_hash=password_hash,
            role=role,
            status=UserStatus.PENDING_VERIFICATION,
            full_name=full_name.strip(),
            created_at=now,
            updated_at=now,
        )

    @property
    def is_active(self) -> bool:
        return self.status == UserStatus.ACTIVE and self.deleted_at is None

    @property
    def is_locked(self) -> bool:
        if self.locked_until is None:
            return False
        return datetime.now(timezone.utc) < self.locked_until

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def record_failed_login(self) -> None:
        self.failed_login_count += 1
        self.updated_at = datetime.now(timezone.utc)

    def record_successful_login(self) -> None:
        self.login_count += 1
        self.failed_login_count = 0
        self.last_login_at = datetime.now(timezone.utc)
        self.updated_at = datetime.now(timezone.utc)

    def verify_email(self) -> None:
        self.email_verified_at = datetime.now(timezone.utc)
        self.status = UserStatus.ACTIVE
        self.updated_at = datetime.now(timezone.utc)

    def soft_delete(self) -> None:
        self.deleted_at = datetime.now(timezone.utc)
        self.status = UserStatus.INACTIVE
        self.updated_at = datetime.now(timezone.utc)
