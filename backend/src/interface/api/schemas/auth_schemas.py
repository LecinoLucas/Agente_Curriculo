from pydantic import BaseModel, Field, field_validator


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        local, sep, domain = normalized.partition("@")
        if not sep or not local or not domain or "." not in domain:
            raise ValueError("value is not a valid email address")
        return normalized


class TokenResponse(BaseModel):
    access_token: str
    must_change_password: bool = False
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str
