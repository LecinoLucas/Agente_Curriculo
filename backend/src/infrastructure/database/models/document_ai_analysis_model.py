from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class DocumentAIAnalysisModel(Base):
    __tablename__ = "document_ai_analyses"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    document_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    raw_text: Mapped[str | None] = mapped_column(sa.Text)
    clean_text: Mapped[str | None] = mapped_column(sa.Text)
    structured_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB_COMPAT)
    confidence: Mapped[float | None] = mapped_column(sa.Numeric(4, 2))
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="pending",
    )
    model_used: Mapped[str] = mapped_column(
        sa.String(100),
        nullable=False,
        server_default="document_ai_v1",
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    error_message: Mapped[str | None] = mapped_column(sa.Text)

    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'processed', 'failed')",
            name="ck_document_ai_analyses_status",
        ),
        sa.Index(
            "uq_document_ai_analyses_document_processing",
            "document_id",
            unique=True,
            postgresql_where=sa.text("status = 'processing'"),
        ),
        sa.Index("idx_document_ai_analyses_document_created", "document_id", "created_at"),
        sa.Index("idx_document_ai_analyses_status", "status"),
    )
