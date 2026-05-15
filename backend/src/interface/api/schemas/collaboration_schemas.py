"""Schemas for collaboration comments."""
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class CollaborationComment(BaseModel):
    """Internal collaboration comment."""

    id: str = Field(..., description="Comment ID")
    author_id: Optional[str] = Field(None, description="Author user ID")
    author_role: str = Field(..., description="Author role")
    comment_type: str = Field(..., description="Type: comment, review_request, manager_feedback, interview_request")
    recommendation: Optional[str] = Field(None, description="advance, hold, reject, request_interview, none")
    message: str = Field(..., description="Comment text")
    target_manager_id: Optional[str] = Field(None, description="Directed manager user ID")
    priority: Optional[str] = Field(None, description="Priority: low, medium, high")
    created_at: str = Field(..., description="ISO timestamp")


class CollaborationListResponse(BaseModel):
    """List of collaboration comments."""

    comments: list[CollaborationComment]


class CreateCommentRequest(BaseModel):
    """Create internal collaboration comment."""

    message: str = Field(..., min_length=1, max_length=5000, description="Comment message")
    comment_type: str = Field(default="comment", description="Type of comment")
    recommendation: Optional[str] = Field(None, description="Optional recommendation")


class RequestManagerReviewRequest(BaseModel):
    """Recruiter/admin requests manager review of a candidate."""

    message: str = Field(..., min_length=1, max_length=5000, description="Message to the manager")
    target_manager_id: Optional[UUID] = Field(None, description="Specific manager to address (optional)")
    priority: Optional[str] = Field(
        None,
        description="Priority: low, medium, high",
        pattern="^(low|medium|high)$",
    )


class ManagerFeedbackRequest(BaseModel):
    """Manager feedback on candidate."""

    message: str = Field(..., min_length=1, max_length=5000, description="Feedback message")
    recommendation: str = Field(
        ...,
        description="Recommendation: advance, hold, reject, request_interview",
        pattern="^(advance|hold|reject|request_interview)$",
    )
