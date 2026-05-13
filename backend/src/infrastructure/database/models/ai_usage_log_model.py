from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class AIUsageLogModel(Base):
    __tablename__ = "ai_usage_logs"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    provider: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    model: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    operation: Mapped[str | None] = mapped_column(sa.String(100), nullable=True)
    analysis_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("analyses.id", ondelete="SET NULL"),
        nullable=True,
    )
    candidate_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="SET NULL"),
        nullable=True,
    )
    job_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    input_tokens: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    output_tokens: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    total_tokens: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    estimated_cost_usd: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 6), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    status: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    error_message: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.Index("idx_ai_usage_logs_provider", "provider"),
        sa.Index("idx_ai_usage_logs_model", "model"),
        sa.Index("idx_ai_usage_logs_created_at", "created_at"),
        sa.Index("idx_ai_usage_logs_analysis_id", "analysis_id"),
        sa.Index("idx_ai_usage_logs_status", "status"),
    )
