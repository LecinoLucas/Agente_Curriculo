from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

HANDOFF_STATUSES = ("pending", "assigned", "resolved", "cancelled")


class ConversationHandoffModel(Base):
    """Registro de solicitação de atendimento humano originada em uma sessão de bot.

    Criado quando o candidato expressa intent 'talk_to_hr' durante uma conversa.
    Permite ao RH visualizar sessões aguardando atendimento humano.
    """

    __tablename__ = "conversation_handoffs"
    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'assigned', 'resolved', 'cancelled')",
            name="ck_conversation_handoffs_status",
        ),
        sa.Index("ix_conversation_handoffs_session_id", "session_id"),
        sa.Index("ix_conversation_handoffs_status", "status"),
        sa.Index("ix_conversation_handoffs_candidate_id", "candidate_id"),
        sa.Index("ix_conversation_handoffs_requested_at", "requested_at"),
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
    reason: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    status: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default=sa.text("'pending'"),
    )
    requested_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )
    assigned_to_user_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        nullable=True,
    )
    metadata_json: Mapped[dict | None] = mapped_column(JSONB_COMPAT, nullable=True)
