from __future__ import annotations

import sqlalchemy as sa
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base


class InterviewScheduleModel(Base):
    """Agendamento de entrevista entre candidato e vaga."""

    __tablename__ = "interview_schedules"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id"),
        nullable=False,
    )
    job_id: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id"),
        nullable=True,
    )
    pipeline_id: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(
        sa.String(255),
        nullable=False,
    )
    description: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    public_notes: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    internal_notes: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    interview_format: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="online",
    )
    scheduled_start: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
    )
    scheduled_end: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(
        sa.String(100),
        nullable=False,
        server_default="America/Recife",
    )
    interview_type: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
    )
    location: Mapped[Optional[str]] = mapped_column(
        sa.String(255),
        nullable=True,
    )
    meeting_url: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    calendar_provider: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="internal",
    )
    external_calendar_event_id: Mapped[Optional[str]] = mapped_column(
        sa.String(255),
        nullable=True,
    )
    external_calendar_html_link: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    meeting_provider: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="none",
    )
    calendar_sync_status: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="not_synced",
    )
    calendar_sync_error: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )
    calendar_synced_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )
    interviewer_name: Mapped[Optional[str]] = mapped_column(
        sa.String(255),
        nullable=True,
    )
    interviewer_email: Mapped[Optional[str]] = mapped_column(
        sa.String(255),
        nullable=True,
    )
    created_by: Mapped[Optional[UUID]] = mapped_column(
        sa.UUID(as_uuid=True),
        nullable=True,
    )
    cancel_reason: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
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
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        sa.CheckConstraint(
            "scheduled_end > scheduled_start",
            name="ck_interview_end_after_start",
        ),
        sa.CheckConstraint(
            "status IN ('scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show', 'awaiting_feedback')",
            name="ck_interview_status",
        ),
        sa.CheckConstraint(
            "interview_type IN ('screening', 'technical', 'manager', 'hr', 'final', 'other')",
            name="ck_interview_type",
        ),
        sa.CheckConstraint(
            "interview_format IN ('online', 'presencial', 'telefone')",
            name="ck_interview_format",
        ),
        sa.Index("idx_interview_schedules_candidate_id", "candidate_id"),
        sa.Index("idx_interview_schedules_job_id", "job_id"),
        sa.Index("idx_interview_schedules_status", "status"),
        sa.Index("idx_interview_schedules_scheduled_start", "scheduled_start"),
        sa.Index("idx_interview_schedules_pipeline_id", "pipeline_id"),
        sa.Index("idx_interview_schedules_external_calendar_event_id", "external_calendar_event_id"),
        sa.Index("idx_interview_schedules_calendar_sync_status", "calendar_sync_status"),
        sa.Index("idx_interview_schedules_calendar_provider_sync", "calendar_provider", "calendar_sync_status"),
    )
