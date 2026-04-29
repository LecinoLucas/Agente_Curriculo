from dataclasses import dataclass
from uuid import UUID

from src.domain.entities.user import UserRole, UserStatus


@dataclass(frozen=True)
class CreateUserCommand:
    email: str
    temporary_password: str
    full_name: str
    role: UserRole = UserRole.CANDIDATE
    is_active: bool = True
    must_change_password: bool = False


@dataclass(frozen=True)
class UserResult:
    id: UUID
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    must_change_password: bool
