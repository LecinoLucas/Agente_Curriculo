from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

_PURPOSE_VALUES = "'login_code', 'portal_session'"


class CandidateAuthTokenModel(Base):
    __tablename__ = "candidate_auth_tokens"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
    )
    token_hash: Mapped[str | None] = mapped_column(sa.String(128))
    code_hash: Mapped[str | None] = mapped_column(sa.String(128))
    expires_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
    )
    used_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    attempt_count: Mapped[int] = mapped_column(
        sa.SmallInteger,
        nullable=False,
        server_default="0",
    )
    max_attempts: Mapped[int] = mapped_column(
        sa.SmallInteger,
        nullable=False,
        server_default="5",
    )
    ip_hash: Mapped[str | None] = mapped_column(sa.String(128))
    user_agent_hash: Mapped[str | None] = mapped_column(sa.String(128))
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.CheckConstraint(
            f"purpose IN ({_PURPOSE_VALUES})",
            name="ck_candidate_auth_tokens_purpose",
        ),
        sa.Index(
            "idx_candidate_auth_tokens_candidate_purpose_created",
            "candidate_id",
            "purpose",
            "created_at",
        ),
        sa.Index(
            "idx_candidate_auth_tokens_token_hash",
            "token_hash",
            unique=True,
            postgresql_where=sa.text("token_hash IS NOT NULL"),
            sqlite_where=sa.text("token_hash IS NOT NULL"),
        ),
        sa.Index(
            "idx_candidate_auth_tokens_expires_at",
            "expires_at",
        ),
    )
