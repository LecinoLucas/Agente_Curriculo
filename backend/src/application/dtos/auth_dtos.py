from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class LoginCommand:
    email: str
    password: str
    ip_address: str
    user_agent: str


@dataclass(frozen=True)
class LoginResult:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


@dataclass(frozen=True)
class RefreshTokenCommand:
    refresh_token: str
    ip_address: str
    user_agent: str


@dataclass(frozen=True)
class RefreshTokenResult:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


@dataclass(frozen=True)
class LogoutCommand:
    refresh_token: str
    user_id: UUID
