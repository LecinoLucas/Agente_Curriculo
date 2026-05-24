from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class AIProviderCredentialModel(Base):
    __tablename__ = "ai_provider_credentials"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    provider: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    model_id: Mapped[str | None] = mapped_column(sa.String(255))
    label: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    encrypted_api_key: Mapped[str] = mapped_column(sa.Text, nullable=False)
    key_last4: Mapped[str] = mapped_column(sa.String(4), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(30), nullable=False, server_default="active")
    priority: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="100")
    cooldown_until: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    last_used_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    last_error_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    last_error_type: Mapped[str | None] = mapped_column(sa.String(100))
    consecutive_rate_limit_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    created_by_user_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
    )
    disabled_by_user_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id"),
    )
    disabled_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'rate_limited', 'invalid')",
            name="ck_ai_provider_credentials_status",
        ),
        sa.UniqueConstraint("provider", "label", name="uq_ai_provider_credentials_provider_label"),
        sa.Index("idx_ai_provider_credentials_provider_model_status", "provider", "model_id", "status"),
        sa.Index("idx_ai_provider_credentials_cooldown_until", "cooldown_until"),
        sa.Index("idx_ai_provider_credentials_status_cooldown", "status", "cooldown_until"),
        sa.Index("idx_ai_provider_credentials_provider_model_priority", "provider", "model_id", "priority"),
    )
