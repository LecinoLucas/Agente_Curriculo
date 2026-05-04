from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DetectedType = Literal["cpf", "rg", "cnh", "cnpj", "unknown"]


class DocumentProcessingResult(BaseModel):
    raw_text: str
    clean_text: str
    detected_type: DetectedType
    confidence: float = Field(ge=0.0, le=1.0)
    errors: list[str] = Field(default_factory=list)
