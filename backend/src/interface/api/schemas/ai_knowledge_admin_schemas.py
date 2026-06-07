from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


DocumentStatus = Literal["draft", "published", "archived"]
DocumentVisibility = Literal["internal", "admin_only"]
DocumentSensitivity = Literal["low", "medium", "high", "restricted"]


class AIKnowledgeDocumentBase(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    source_type: str = Field(min_length=2, max_length=100)
    domain: str = Field(min_length=2, max_length=100)
    content: str = Field(min_length=20)
    visibility: DocumentVisibility = "internal"
    allowed_roles: list[str] = Field(default_factory=list, max_length=20)
    sensitivity_level: DocumentSensitivity = "low"
    tags: list[str] = Field(default_factory=list, max_length=20)
    status: DocumentStatus = "draft"
    reviewed_by: str | None = Field(default=None, max_length=255)
    reviewed_at: datetime | None = None
    source_uri: str | None = Field(default=None, max_length=500)


class AIKnowledgeDocumentCreateRequest(AIKnowledgeDocumentBase):
    pass


class AIKnowledgeDocumentUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=255)
    source_type: str | None = Field(default=None, min_length=2, max_length=100)
    domain: str | None = Field(default=None, min_length=2, max_length=100)
    content: str | None = Field(default=None, min_length=20)
    visibility: DocumentVisibility | None = None
    allowed_roles: list[str] | None = Field(default=None, max_length=20)
    sensitivity_level: DocumentSensitivity | None = None
    tags: list[str] | None = Field(default=None, max_length=20)
    status: DocumentStatus | None = None
    reviewed_by: str | None = Field(default=None, max_length=255)
    reviewed_at: datetime | None = None
    source_uri: str | None = Field(default=None, max_length=500)


class AIKnowledgeChunkPreviewResponse(BaseModel):
    id: UUID
    chunk_index: int
    content_preview: str
    token_count: int | None = None


class AIKnowledgeDocumentResponse(BaseModel):
    id: UUID
    title: str
    source_type: str
    domain: str
    content: str
    visibility: str
    allowed_roles: list[str]
    sensitivity_level: str
    tags: list[str]
    status: str
    reviewed_by: str | None
    reviewed_at: datetime | None
    source_uri: str | None
    indexing_status: str
    last_indexed_at: datetime | None
    last_index_error: str | None
    chunk_count: int
    chunks: list[AIKnowledgeChunkPreviewResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class AIKnowledgeDocumentListResponse(BaseModel):
    items: list[AIKnowledgeDocumentResponse]
    total: int
    embedding_provider_status: str
    embedding_provider_message: str | None = None


class AIKnowledgeArchiveResponse(BaseModel):
    ok: bool
    document_id: UUID
    status: str


class AIKnowledgeReindexResponse(BaseModel):
    ok: bool
    document_id: UUID
    indexing_status: str
    chunks_created: int
    embeddings_created: int
    warnings: list[str] = Field(default_factory=list)
