from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)
    aliases: Optional[list[str]] = Field(default_factory=list)

class UpdateSkillRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)
    aliases: Optional[list[str]] = None

class ArchiveSkillRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=100)
    note: Optional[str] = Field(default=None, max_length=1000)

class SkillAliasResponse(BaseModel):
    id: UUID
    alias: str
    normalized_alias: str

class SkillCatalogResponse(BaseModel):
    id: UUID
    name: str
    normalized_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    updated_at: datetime
    archived_at: Optional[datetime] = None
    archived_by: Optional[UUID] = None
    archive_reason: Optional[str] = None
    archive_reason_note: Optional[str] = None
    created_at: datetime
    aliases: list[SkillAliasResponse] = Field(default_factory=list)
