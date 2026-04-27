from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class PipelineEventModel(Base):
    __tablename__ = "pipeline_events"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    event_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB_COMPAT, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.Index("idx_pipeline_events_created_at", "created_at"),
        sa.Index("idx_pipeline_events_event_type_created", "event_type", "created_at"),
        sa.Index("idx_pipeline_events_entity_created", "entity_id", "created_at"),
    )
