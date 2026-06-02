from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

CONVERSATION_CHANNELS = ("web", "whatsapp")
CONVERSATION_STATES = (
    "IDENTIFY",
    "VERIFY_OTP",
    "CHOOSE_LOCATION",
    "CHOOSE_UNIT_OR_ANY",
    "CHOOSE_FUNCTION",
    "CHOOSE_SHIFT",
    "SHOW_JOBS",
    "COLLECT_RESUME",
    "CONFIRM_APPLICATION",
    "DONE",
)
CONVERSATION_STATUSES = ("active", "completed", "abandoned", "cancelled")
CONVERSATION_MESSAGE_ROLES = ("candidate", "assistant", "system")
CONVERSATION_MESSAGE_TYPES = ("text", "quick_reply", "system")


class ConversationSessionModel(Base):
    __tablename__ = "conversation_sessions"
    __table_args__ = (
        sa.CheckConstraint(
            "channel IN ('web', 'whatsapp')",
            name="ck_conversation_sessions_channel",
        ),
        sa.CheckConstraint(
            "current_state IN ("
            "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
            "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
            "'COLLECT_RESUME', 'COLLECT_LEAD_NAME', 'COLLECT_LEAD_WHATSAPP', "
            "'COLLECT_LGPD_CONSENT', 'CONFIRM_APPLICATION', 'DONE'"
            ")",
            name="ck_conversation_sessions_current_state",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'abandoned', 'cancelled')",
            name="ck_conversation_sessions_status",
        ),
        sa.Index("ix_conversation_sessions_candidate_id", "candidate_id"),
        sa.Index("ix_conversation_sessions_application_id", "application_id"),
        sa.Index("ix_conversation_sessions_status", "status"),
        sa.Index("ix_conversation_sessions_current_state", "current_state"),
        sa.Index("ix_conversation_sessions_last_message_at", "last_message_at"),
    )

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
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
    channel: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="web",
    )
    current_state: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="IDENTIFY",
    )
    status: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="active",
    )
    context_json: Mapped[dict] = mapped_column(
        JSONB_COMPAT,
        nullable=False,
        default=dict,
        server_default=sa.text("'{}'"),
    )
    last_message_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
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
    deleted_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )

    candidate = relationship("CandidateModel", lazy="noload")
    application = relationship("CandidateApplicationModel", lazy="noload")
    messages: Mapped[list["ConversationMessageModel"]] = relationship(
        "ConversationMessageModel",
        back_populates="session",
        lazy="noload",
        cascade="all, delete-orphan",
    )


class ConversationMessageModel(Base):
    __tablename__ = "conversation_messages"
    __table_args__ = (
        sa.CheckConstraint(
            "role IN ('candidate', 'assistant', 'system')",
            name="ck_conversation_messages_role",
        ),
        sa.CheckConstraint(
            "message_type IN ('text', 'quick_reply', 'system')",
            name="ck_conversation_messages_message_type",
        ),
        sa.Index("ix_conversation_messages_session_id", "session_id"),
        sa.Index("ix_conversation_messages_created_at", "created_at"),
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
    role: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    message_type: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="text",
    )
    interpreted_intent: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB_COMPAT, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    session: Mapped[ConversationSessionModel] = relationship(
        "ConversationSessionModel",
        back_populates="messages",
        lazy="noload",
    )
