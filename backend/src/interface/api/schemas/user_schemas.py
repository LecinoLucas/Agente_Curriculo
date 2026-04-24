from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from src.domain.entities.user import UserRole, UserStatus


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    role: UserRole = UserRole.CANDIDATE


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    real_ai_token_spend_enabled: bool = False

    model_config = {"from_attributes": True}


class PatchUserRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
