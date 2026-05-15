"""Model for candidate-job collaboration comments."""
from datetime import datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import Column, DateTime, ForeignKey, String, Text, UUID as UUIDType
from sqlalchemy.orm import mapped_column, Mapped

from src.infrastructure.database.base import Base


class CollaborationCommentModel(Base):
    """Internal collaboration comments between recruiter and manager."""

    __tablename__ = "candidate_job_collaboration_comments"

    id: Mapped[UUID] = mapped_column(UUIDType(as_uuid=True), primary_key=True)
    candidate_id: Mapped[UUID] = mapped_column(UUIDType(as_uuid=True), ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[UUID] = mapped_column(UUIDType(as_uuid=True), ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[UUID | None] = mapped_column(UUIDType(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_role: Mapped[str] = mapped_column(String(50), nullable=False)
    comment_type: Mapped[str] = mapped_column(String(50), nullable=False)
    visibility: Mapped[str] = mapped_column(String(50), nullable=False, default="internal")
    target_manager_id: Mapped[UUID | None] = mapped_column(UUIDType(as_uuid=True), nullable=True)
    priority: Mapped[str | None] = mapped_column(String(20), nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now())

    def __repr__(self) -> str:
        return (
            f"<CollaborationComment(id={self.id}, candidate={self.candidate_id}, "
            f"job={self.job_id}, type={self.comment_type}, author_role={self.author_role})>"
        )
