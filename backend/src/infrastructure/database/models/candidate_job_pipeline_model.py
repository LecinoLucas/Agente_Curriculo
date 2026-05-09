from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

_PIPELINE_STAGE_VALUES = (
    "'entry', 'screening', 'hr_interview', 'technical_interview', "
    "'final', 'offer', 'hired', 'rejected'"
)
_LINK_STATUS_VALUES = "'active', 'removed', 'transferred', 'hired', 'rejected'"
_RELATIONSHIP_STATUS_VALUES = "'active', 'rejected', 'hired', 'withdrawn', 'archived'"
_PIPELINE_STATUS_VALUES = "'active', 'terminal'"
_SOURCE_VALUES = "'manual', 'ai_match', 'import'"


class CandidateJobPipelineModel(Base):
    __tablename__ = "candidate_job_pipeline"

    candidate_job_pipeline_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id", ondelete="CASCADE"),
        primary_key=True,
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    resume_version_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("resume_versions.id", ondelete="SET NULL"),
    )
    link_status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="active",
    )
    relationship_status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="active",
    )
    is_terminal: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        default=False,
        server_default=sa.false(),
    )
    terminated_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    termination_reason: Mapped[str | None] = mapped_column(sa.String(500))
    pipeline_stage: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="entry",
    )
    pipeline_status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="active",
    )
    source: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="manual",
    )
    current_analysis_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("analyses.id", ondelete="SET NULL"),
    )
    entered_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    last_moved_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
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
    )

    __table_args__ = (
        sa.CheckConstraint(
            f"pipeline_stage IN ({_PIPELINE_STAGE_VALUES})",
            name="ck_candidate_job_pipeline_stage",
        ),
        sa.CheckConstraint(
            f"link_status IN ({_LINK_STATUS_VALUES})",
            name="ck_candidate_job_pipeline_link_status",
        ),
        sa.CheckConstraint(
            f"relationship_status IN ({_RELATIONSHIP_STATUS_VALUES})",
            name="ck_candidate_job_pipeline_relationship_status",
        ),
        sa.CheckConstraint(
            f"pipeline_status IN ({_PIPELINE_STATUS_VALUES})",
            name="ck_candidate_job_pipeline_pipeline_status",
        ),
        sa.CheckConstraint(
            "("
            "relationship_status = 'active' AND is_terminal = FALSE AND terminated_at IS NULL AND termination_reason IS NULL"
            ") OR ("
            "relationship_status <> 'active' AND is_terminal = TRUE AND terminated_at IS NOT NULL"
            ")",
            name="ck_candidate_job_pipeline_relationship_terminal",
        ),
        sa.CheckConstraint(
            f"source IN ({_SOURCE_VALUES})",
            name="ck_candidate_job_pipeline_source",
        ),
        sa.Index(
            "idx_candidate_job_pipeline_job_stage",
            "job_id",
            "pipeline_stage",
        ),
        sa.Index(
            "idx_candidate_job_pipeline_job_active",
            "job_id",
            "pipeline_status",
            "link_status",
        ),
        sa.Index(
            "idx_candidate_job_pipeline_job_relationship_active",
            "job_id",
            "relationship_status",
            "is_terminal",
        ),
        sa.Index(
            "idx_candidate_job_pipeline_analysis",
            "current_analysis_id",
        ),
        sa.Index(
            "uq_candidate_job_pipeline_row_id",
            "candidate_job_pipeline_id",
            unique=True,
        ),
    )


class CandidateJobPipelineEventModel(Base):
    __tablename__ = "candidate_job_pipeline_events"

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
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    from_stage: Mapped[str | None] = mapped_column(sa.String(50))
    to_stage: Mapped[str | None] = mapped_column(sa.String(50))
    from_job_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    to_job_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    actor_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
    )
    idempotency_key: Mapped[str | None] = mapped_column(sa.String(255), unique=True)
    metadata_payload: Mapped[dict | None] = mapped_column("metadata", sa.JSON)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.Index("idx_candidate_job_pipeline_events_entry_time", "candidate_id", "job_id", "created_at"),
        sa.Index("idx_candidate_job_pipeline_events_job_time", "job_id", "created_at"),
        sa.Index("idx_candidate_job_pipeline_events_type_time", "event_type", "created_at"),
        sa.Index("idx_candidate_job_pipeline_events_actor", "actor_id"),
    )
