from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AIModelResponse(BaseModel):
    id: UUID
    provider: str
    model_id: str
    model_name: str
    context_window: Optional[int] = None
    is_active: bool
    activated_at: datetime
    deprecated_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateAIModelRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=100)
    model_id: str = Field(min_length=1, max_length=255)
    model_name: str = Field(min_length=1, max_length=255)
    context_window: Optional[int] = Field(default=None, ge=1)
    is_active: bool = True


class PatchAIModelRequest(BaseModel):
    is_active: Optional[bool] = None
    provider: Optional[str] = Field(default=None, min_length=1, max_length=100)
    model_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    model_name: Optional[str] = Field(default=None, max_length=255)
    context_window: Optional[int] = Field(default=None, ge=1)


class PromptTemplateResponse(BaseModel):
    id: UUID
    name: str
    version: int
    description: Optional[str] = None
    template_type: str
    system_prompt: Optional[str] = None
    user_prompt_template: str
    output_schema: Optional[dict[str, Any]] = None
    max_tokens: int
    temperature: Decimal
    is_active: bool
    activated_at: Optional[datetime] = None
    deactivated_at: Optional[datetime] = None
    created_by: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class CreatePromptTemplateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    version: int = Field(ge=1)
    description: Optional[str] = None
    template_type: str = Field(min_length=1, max_length=100)
    system_prompt: Optional[str] = None
    user_prompt_template: str = Field(min_length=10)
    output_schema: Optional[dict[str, Any]] = None
    max_tokens: int = Field(default=4096, ge=256, le=32768)
    temperature: Decimal = Field(default=Decimal("0.1"), ge=0, le=1)


class PatchPromptTemplateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    version: Optional[int] = Field(default=None, ge=1)
    description: Optional[str] = None
    template_type: Optional[str] = Field(default=None, min_length=1, max_length=100)
    system_prompt: Optional[str] = None
    user_prompt_template: Optional[str] = Field(default=None, min_length=10)
    output_schema: Optional[dict[str, Any]] = None
    max_tokens: Optional[int] = Field(default=None, ge=256, le=32768)
    temperature: Optional[Decimal] = Field(default=None, ge=0, le=1)
