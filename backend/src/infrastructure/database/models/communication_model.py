"""Communication templates, messages, and delivery attempts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Optional
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class CommunicationTemplateModel(Base):
    """Template for communication messages."""

    __tablename__ = "communication_templates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    key: Mapped[str] = mapped_column(sa.String(100), nullable=False, unique=True)
    channel: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    audience: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    subject_template: Mapped[Optional[str]] = mapped_column(sa.Text)
    body_template: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default="active"
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
        server_default=sa.text("NOW()"),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        sa.CheckConstraint(
            "channel IN ('internal', 'email')", name="ck_comm_template_channel"
        ),
        sa.CheckConstraint(
            "audience IN ('candidate', 'recruiter', 'manager', 'hr')",
            name="ck_comm_template_audience",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'inactive')", name="ck_comm_template_status"
        ),
        sa.Index("idx_comm_template_key", "key"),
        sa.Index("idx_comm_template_status", "status"),
    )


class CandidateCommunicationModel(Base):
    """Communication message sent to/about a candidate."""

    __tablename__ = "candidate_communications"

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
    job_id: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )
    related_entity_type: Mapped[Optional[str]] = mapped_column(sa.String(80))
    related_entity_id: Mapped[Optional[UUID]] = mapped_column(sa.UUID(as_uuid=True))
    template_key: Mapped[Optional[str]] = mapped_column(sa.String(100))
    channel: Mapped[str] = mapped_column(sa.String(20), nullable=False)
    audience: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(sa.Text)
    body: Mapped[str] = mapped_column(sa.Text, nullable=False)
    status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default="draft"
    )
    created_by: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    queued_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    sent_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    read_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(sa.Text)

    __table_args__ = (
        sa.CheckConstraint(
            "channel IN ('internal', 'email')", name="ck_comm_channel"
        ),
        sa.CheckConstraint(
            "audience IN ('candidate', 'recruiter', 'manager', 'hr')",
            name="ck_comm_audience",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'queued', 'sent', 'failed', 'read', 'cancelled')",
            name="ck_comm_status",
        ),
        sa.Index("idx_comm_candidate_created", "candidate_id", "created_at"),
        sa.Index("idx_comm_candidate_job", "candidate_id", "job_id"),
        sa.Index(
            "idx_comm_dedup",
            "candidate_id",
            "related_entity_type",
            "related_entity_id",
            "template_key",
        ),
    )


class CommunicationDeliveryAttemptModel(Base):
    """Delivery attempt log for a communication."""

    __tablename__ = "communication_delivery_attempts"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    communication_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_communications.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[Optional[str]] = mapped_column(sa.String(40))
    status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default="pending"
    )
    request_payload_json: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    response_payload_json: Mapped[Optional[dict]] = mapped_column(JSONB_COMPAT)
    error_message: Mapped[Optional[str]] = mapped_column(sa.Text)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(sa.TIMESTAMP(timezone=True))

    __table_args__ = (
        sa.CheckConstraint(
            "status IN ('pending', 'sent', 'failed')",
            name="ck_delivery_attempt_status",
        ),
        sa.Index("idx_delivery_attempt_comm", "communication_id", "created_at"),
    )
