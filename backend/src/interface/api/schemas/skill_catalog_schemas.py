from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

class CreateSkillRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)
    aliases: Optional[list[str]] = Field(default_factory=list)


class ValidateSkillSuggestionRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)
    aliases: Optional[list[str]] = Field(default_factory=list)
    source: str = Field(default="ai_suggestion", max_length=50)


class ApproveSkillSuggestionRequest(ValidateSkillSuggestionRequest):
    confirm_warnings: bool = Field(default=False)

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


class SkillCatalogGuardrailIssueResponse(BaseModel):
    type: str
    field: str
    value: str
    normalized_value: str
    message: str
    existing_skill_id: UUID | None = None
    existing_skill_name: str | None = None
    existing_alias: str | None = None


class SkillCatalogSuggestionValidationResponse(BaseModel):
    allowed: bool
    conflicts: list[SkillCatalogGuardrailIssueResponse] = Field(default_factory=list)
    warnings: list[SkillCatalogGuardrailIssueResponse] = Field(default_factory=list)
    normalized_canonical: str
    normalized_aliases: list[str] = Field(default_factory=list)
    source: str | None = None


class SkillCatalogSuggestionApprovalResponse(BaseModel):
    skill: "SkillCatalogResponse"
    warnings: list[SkillCatalogGuardrailIssueResponse] = Field(default_factory=list)
    validation: SkillCatalogSuggestionValidationResponse

class SkillCatalogResponse(BaseModel):
    id: UUID
    name: str
    normalized_name: str
    category: Optional[str] = None
    catalog_type: Optional[str] = None
    description: Optional[str] = None
    is_active: bool
    updated_at: datetime
    archived_at: Optional[datetime] = None
    archived_by: Optional[UUID] = None
    archive_reason: Optional[str] = None
    archive_reason_note: Optional[str] = None
    created_at: datetime
    aliases: list[SkillAliasResponse] = Field(default_factory=list)


SkillCatalogSuggestionApprovalResponse.model_rebuild()
