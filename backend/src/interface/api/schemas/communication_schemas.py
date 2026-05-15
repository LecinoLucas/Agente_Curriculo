"""Schemas for communication templates, messages, and delivery."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CommunicationTemplateResponse(BaseModel):
    """Communication template response."""
    id: UUID = Field(..., description="Template UUID")
    key: str = Field(..., description="Unique template key (e.g., 'candidate_applied')")
    channel: str = Field(..., description="Channel: 'internal' or 'email'")
    audience: str = Field(..., description="Audience: 'candidate', 'recruiter', 'manager', or 'hr'")
    subject_template: Optional[str] = Field(None, description="Subject template with placeholders")
    body_template: str = Field(..., description="Body template with placeholders")
    status: str = Field(..., description="Status: 'active' or 'inactive'")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CommunicationTemplateCreateRequest(BaseModel):
    """Request to create communication template."""
    key: str = Field(..., description="Unique template key")
    channel: str = Field(..., description="Channel: 'internal' or 'email'")
    audience: str = Field(..., description="Audience: 'candidate', 'recruiter', 'manager', or 'hr'")
    subject_template: Optional[str] = Field(None, description="Subject template")
    body_template: str = Field(..., description="Body template")
    status: str = Field("active", description="Status: 'active' or 'inactive'")


class CommunicationTemplateUpdateRequest(BaseModel):
    """Request to update communication template."""
    key: Optional[str] = None
    channel: Optional[str] = None
    audience: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    status: Optional[str] = None


class CommunicationResponse(BaseModel):
    """Communication message response."""
    id: UUID = Field(..., description="Communication UUID")
    candidate_id: UUID = Field(..., description="Candidate UUID")
    job_id: Optional[UUID] = Field(None, description="Job UUID")
    related_entity_type: Optional[str] = Field(None, description="Entity type for deduplication")
    related_entity_id: Optional[UUID] = Field(None, description="Entity ID for deduplication")
    template_key: Optional[str] = Field(None, description="Template key used")
    channel: str = Field(..., description="Channel: 'internal' or 'email'")
    audience: str = Field(..., description="Audience: 'candidate', 'recruiter', 'manager', or 'hr'")
    subject: Optional[str] = Field(None, description="Rendered subject")
    body: str = Field(..., description="Rendered body")
    status: str = Field(..., description="Status: 'draft', 'queued', 'sent', 'failed', 'read', 'cancelled'")
    created_by: Optional[UUID] = Field(None, description="User ID who created")
    created_at: datetime
    queued_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class CommunicationListResponse(BaseModel):
    """Response with list of communications."""
    communications: list[CommunicationResponse] = Field(..., description="List of communications")


class CommunicationRetryRequest(BaseModel):
    """Request to retry a communication."""
    pass


class CommunicationMarkReadRequest(BaseModel):
    """Request to mark communication as read."""
    pass


class CommunicationTemplateListResponse(BaseModel):
    """Response with list of templates."""
    templates: list[CommunicationTemplateResponse] = Field(..., description="List of templates")
