from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from src.application.services.ai_provider_credential_service import mask_api_key_last4
from src.interface.api.schemas.common import ORMAPISchemaModel

AIProviderName = Literal["google", "gemini", "anthropic", "claude"]
AIProviderCredentialStatus = Literal["active", "disabled", "rate_limited", "invalid"]


class AIProviderCredentialCreateRequest(ORMAPISchemaModel):
    provider: AIProviderName
    model_id: str | None = Field(default=None, max_length=255)
    label: str = Field(min_length=1, max_length=255)
    api_key: str = Field(min_length=8, max_length=4096)
    priority: int = Field(default=100, ge=1, le=10000)

    @field_validator("provider", mode="before")
    @classmethod
    def normalize_provider(cls, value: str) -> str:
        return str(value or "").strip().lower()

    @field_validator("model_id", "label", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None


class AIProviderCredentialRotateRequest(ORMAPISchemaModel):
    api_key: str = Field(min_length=8, max_length=4096)


class AIProviderCredentialResponse(ORMAPISchemaModel):
    id: UUID
    provider: str
    model_id: str | None = None
    label: str
    masked_key: str
    key_last4: str
    status: AIProviderCredentialStatus
    priority: int = Field(ge=1, le=10000)
    cooldown_until: datetime | None = None
    last_used_at: datetime | None = None
    last_error_at: datetime | None = None
    last_error_type: str | None = None
    consecutive_rate_limit_count: int
    created_at: datetime
    updated_at: datetime

    @field_validator("masked_key", mode="before")
    @classmethod
    def build_masked_key(cls, value: str | None, info):
        if value:
            return value
        data = info.data
        return mask_api_key_last4(str(data.get("key_last4") or ""))
