from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class AIProviderHealthModel(Base):
    __tablename__ = "ai_provider_health"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    provider: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    model_id: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(30), nullable=False, server_default="available")
    configured_key_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    available_key_count: Mapped[int | None] = mapped_column(sa.Integer)
    cooldown_until: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    last_error_type: Mapped[str | None] = mapped_column(sa.String(100))
    last_status_code: Mapped[int | None] = mapped_column(sa.Integer)
    last_error_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    consecutive_rate_limit_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    last_admin_notification_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.UniqueConstraint("provider", "model_id", name="uq_ai_provider_health_provider_model"),
        sa.CheckConstraint(
            "status IN ('available', 'degraded', 'rate_limited', 'unavailable')",
            name="ck_ai_provider_health_status",
        ),
        sa.Index("idx_ai_provider_health_status", "status"),
    )
