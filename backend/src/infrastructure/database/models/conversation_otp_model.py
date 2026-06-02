from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

OTP_IDENTIFIER_TYPES = ("cpf", "whatsapp")


class ConversationOtpModel(Base):
    """One-time code for verifying candidate identity inside a conversation session.

    Design notes:
    - candidate_id is nullable so OTPs can be issued even when the identifier
      resolves to an unknown candidate (anti-enumeration: the flow and timing
      are identical for known and unknown identifiers).
    - otp_hash stores SHA-256(session_id + ":" + otp_code) — the session_id
      acts as a salt so the same code used in different sessions hashes
      differently, preventing cross-session replay.
    - consumed_at is set when the correct code is accepted; a consumed OTP
      cannot be reused regardless of expiry.
    - attempts tracks incorrect guesses; the OTP is locked when
      attempts >= max_attempts.
    """

    __tablename__ = "conversation_otp_tokens"
    __table_args__ = (
        sa.CheckConstraint(
            "identifier_type IN ('cpf', 'whatsapp')",
            name="ck_conversation_otp_tokens_identifier_type",
        ),
        sa.Index("ix_conversation_otp_tokens_session_id", "session_id"),
        sa.Index("ix_conversation_otp_tokens_expires_at", "expires_at"),
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
    candidate_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="SET NULL"),
        nullable=True,
    )
    identifier_type: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    otp_hash: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
    )
    attempts: Mapped[int] = mapped_column(
        sa.SmallInteger,
        nullable=False,
        default=0,
        server_default="0",
    )
    max_attempts: Mapped[int] = mapped_column(
        sa.SmallInteger,
        nullable=False,
        default=5,
        server_default="5",
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
