from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

ASSISTANT_FAILURE_STATUSES = ("open", "reviewed", "resolved", "ignored")
ASSISTANT_FAILURE_CLASSIFICATIONS = (
    "location",
    "unit",
    "function",
    "shift",
    "identity",
    "spam",
    "talk_to_hr",
    "other",
)


class AssistantFailureModel(Base):
    __tablename__ = "assistant_failures"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('open', 'reviewed', 'resolved', 'ignored')",
            name="ck_assistant_failures_status",
        ),
        sa.CheckConstraint(
            "classification IS NULL OR classification IN ("
            "'location', 'unit', 'function', 'shift', 'identity', "
            "'spam', 'talk_to_hr', 'other'"
            ")",
            name="ck_assistant_failures_classification",
        ),
        sa.CheckConstraint(
            "attempts_count IS NULL OR attempts_count >= 0",
            name="ck_assistant_failures_attempts_count",
        ),
        sa.Index("ix_assistant_failures_session_id", "session_id"),
        sa.Index("ix_assistant_failures_message_id", "message_id"),
        sa.Index("ix_assistant_failures_candidate_id", "candidate_id"),
        sa.Index("ix_assistant_failures_application_id", "application_id"),
        sa.Index("ix_assistant_failures_status", "status"),
        sa.Index("ix_assistant_failures_reason", "reason"),
        sa.Index("ix_assistant_failures_classification", "classification"),
        sa.Index("ix_assistant_failures_state", "state"),
        sa.Index("ix_assistant_failures_created_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    session_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("conversation_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    message_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("conversation_messages.id", ondelete="SET NULL"),
        nullable=True,
    )
    candidate_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="SET NULL"),
        nullable=True,
    )
    application_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_applications.id", ondelete="SET NULL"),
        nullable=True,
    )
    state: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    raw_message: Mapped[str] = mapped_column(sa.Text, nullable=False)
    sanitized_message: Mapped[str] = mapped_column(sa.Text, nullable=False)
    reason: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        default="open",
        server_default="open",
    )
    classification: Mapped[str | None] = mapped_column(sa.String(30), nullable=True)
    attempts_count: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    reviewed_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    session = relationship("ConversationSessionModel", lazy="noload")
    message = relationship("ConversationMessageModel", lazy="noload")
    candidate = relationship("CandidateModel", lazy="noload")
    application = relationship("CandidateApplicationModel", lazy="noload")
    reviewer = relationship("UserModel", lazy="noload")
