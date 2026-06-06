from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AiAssistantReadOnlyRequest(BaseModel):
    intent: str = Field(..., description="Intent estruturada no formato 'dominio.acao' (ex: 'job.summary')")
    arguments: dict[str, Any] = Field(default_factory=dict)
    message: str | None = None
    session_id: str | None = None


class AiAssistantReadOnlyResponse(BaseModel):
    ok: bool
    intent: str
    tool_name: str | None = None
    data: Any = None
    error_code: str | None = None
    message: str | None = None
    requires_approval: bool = False
    warnings: list[str] = Field(default_factory=list)
