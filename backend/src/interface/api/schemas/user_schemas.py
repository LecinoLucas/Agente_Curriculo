from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from src.domain.entities.user import DEFAULT_PREFERRED_THEME, UserPreferredTheme, UserRole, UserStatus


class CreateUserRequest(BaseModel):
    email: EmailStr
    temporary_password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    role: UserRole = UserRole.RECRUITER
    is_active: bool = True
    must_change_password: bool = False
    avatar_url: Optional[str] = Field(default=None, max_length=500)


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    real_ai_token_spend_enabled: bool = True
    must_change_password: bool = False
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    avatar_url: Optional[str] = None
    preferred_theme: Optional[UserPreferredTheme] = DEFAULT_PREFERRED_THEME

    model_config = {"from_attributes": True}


class PatchUserRequest(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = Field(default=None, max_length=500)


class PatchMyProfileRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    avatar_url: Optional[str] = Field(default=None, max_length=500)


class ResetUserPasswordRequest(BaseModel):
    temporary_password: str = Field(min_length=8, max_length=128)
    must_change_password: bool = False


class ChangeMyPasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UpdateMyPreferencesRequest(BaseModel):
    preferred_theme: UserPreferredTheme


class UserPreferencesResponse(BaseModel):
    preferred_theme: UserPreferredTheme


class UserStatsResponse(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    suspended_users: int
    pending_users: int
    admins: int
    recruiters: int
    viewers: int
    candidates: int


class ManagerListItemResponse(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole


class ManagerListResponse(BaseModel):
    managers: list[ManagerListItemResponse]
