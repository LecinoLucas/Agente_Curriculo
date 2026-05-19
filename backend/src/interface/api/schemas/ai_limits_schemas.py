from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from src.interface.api.schemas.common import APISchemaModel


Scope = Literal["user", "job", "global"]


class AILimitOverrideResponse(APISchemaModel):
    id: UUID
    scope: Scope
    scope_id: UUID | None = None
    limit_type: str
    old_limit: int
    new_limit: int
    reason: str
    expires_at: datetime
    created_by: UUID
    created_at: datetime
    revoked_at: datetime | None = None
    revoked_by: UUID | None = None


class CreateOverrideRequest(BaseModel):
    scope: Scope
    scope_id: UUID | None = None
    new_limit: int = Field(gt=0)
    expires_at: datetime
    reason: str = Field(min_length=1, max_length=500)


class AILimitUsageEntry(APISchemaModel):
    scope: Scope
    scope_id: UUID | None = None
    label: str | None = None
    used_today: int
    effective_limit: int
    limit_source: Literal["override", "default"]
    override_id: UUID | None = None


class AILimitsUsageResponse(APISchemaModel):
    today: datetime
    defaults: dict[str, int]
    active_overrides: list[AILimitOverrideResponse]
    by_user: list[AILimitUsageEntry]
    by_job: list[AILimitUsageEntry]
    global_usage: AILimitUsageEntry
