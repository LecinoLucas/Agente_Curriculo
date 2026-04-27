from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class DocumentAIAnalysisResponse(BaseModel):
    id: UUID
    document_id: UUID
    raw_text: str | None = None
    clean_text: str | None = None
    structured_data: dict[str, Any] | None = None
    confidence: float | None = None
    status: str
    model_used: str
    created_at: datetime
    error_message: str | None = None


class DocumentAIRetryResponse(BaseModel):
    analysis_id: UUID
    new_analysis_id: UUID
    status: str

