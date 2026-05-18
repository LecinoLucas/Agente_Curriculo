from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class CandidateNoteModel(Base):
    __tablename__ = "candidate_notes"

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
    author_user_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    note_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    visibility: Mapped[str] = mapped_column(
        sa.String(30),
        nullable=False,
        server_default="internal",
    )
    is_pinned: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("false"),
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        server_default=sa.text("NOW()"),
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        sa.CheckConstraint(
            "visibility IN ('internal')",
            name="ck_candidate_notes_visibility",
        ),
        sa.Index(
            "idx_candidate_notes_candidate_id_created_at",
            "candidate_id",
            "created_at",
        ),
        sa.Index("idx_candidate_notes_author_user_id", "author_user_id"),
        sa.Index("idx_candidate_notes_deleted_at", "deleted_at"),
    )
