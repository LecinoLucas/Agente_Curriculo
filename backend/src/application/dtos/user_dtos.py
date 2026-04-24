from dataclasses import dataclass
from uuid import UUID

from src.domain.entities.user import UserRole, UserStatus


@dataclass(frozen=True)
class CreateUserCommand:
    email: str
    password: str
    full_name: str
    role: UserRole = UserRole.CANDIDATE


@dataclass(frozen=True)
class UserResult:
    id: UUID
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
