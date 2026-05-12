from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from src.interface.api.schemas.common import APISchemaModel


class AuditLogResponse(APISchemaModel):
    id: UUID
    action: str
    entity_type: str
    entity_id: UUID | None = None
    user_id: UUID | None = None
    user_name: str | None = None
    user_email: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    created_at: datetime
    request_id: UUID | None = None
    correlation_id: str | None = None
