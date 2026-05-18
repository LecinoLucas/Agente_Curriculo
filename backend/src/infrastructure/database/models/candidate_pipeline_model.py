from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

_STAGE_VALUES = (
    "'entry', 'screening', 'hr_interview', 'technical_interview', "
    "'final', 'offer', 'hired', 'rejected'"
)


class CandidatePipelineModel(Base):
    __tablename__ = "candidate_pipeline"

    candidate_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidates.id"),
        primary_key=True,
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id"),
        primary_key=True,
    )
    stage: Mapped[str] = mapped_column(
        sa.String(50),
        nullable=False,
        server_default="entry",
    )
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="active",
    )
    match_score: Mapped[Decimal | None] = mapped_column(sa.Numeric(5, 2))
    # Set once when the candidate first enters the pipeline; never overwritten.
    entered_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    # NULL when the move was triggered by the system (auto_match); set to the recruiter's id on manual moves.
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
            f"stage IN ({_STAGE_VALUES})",
            name="ck_candidate_pipeline_stage",
        ),
        sa.Index("idx_candidate_pipeline_job_stage", "job_id", "stage"),
        sa.Index("idx_candidate_pipeline_job_score", "job_id", "match_score"),
        sa.Index("idx_candidate_pipeline_last_moved_by", "last_moved_by"),
    )


class PipelineStageTransitionModel(Base):
    """Append-only log of every stage movement for a (candidate, job) pair.

    Mirrors the design of AuditLogModel: no updated_at, no deleted_at, never mutated.
    """

    __tablename__ = "pipeline_stage_transitions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    # Not declared with individual ForeignKey — referential integrity is enforced
    # by the composite ForeignKeyConstraint to candidate_pipeline below.
    candidate_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    job_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), nullable=False)
    # NULL on the very first entry (no prior stage).
    from_stage: Mapped[str | None] = mapped_column(sa.String(50))
    to_stage: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    # NULL when trigger is 'auto_match' or 'system'.
    moved_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("users.id", ondelete="SET NULL"),
    )
    moved_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    # 'manual' → recruiter drag-and-drop; 'auto_match' → matching worker; 'system' → internal logic.
    trigger: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="system",
    )
    notes: Mapped[str | None] = mapped_column(sa.Text)
    # Structured reason for the move; complements free-text notes.
    reason: Mapped[str | None] = mapped_column(sa.String(500))

    __table_args__ = (
        # Composite FK guarantees the pipeline entry exists before a transition is recorded.
        sa.ForeignKeyConstraint(
            ["candidate_id", "job_id"],
            ["candidate_pipeline.candidate_id", "candidate_pipeline.job_id"],
            name="fk_transition_pipeline_entry",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "trigger IN ('manual', 'auto_match', 'system')",
            name="ck_pipeline_transition_trigger",
        ),
        sa.CheckConstraint(
            f"to_stage IN ({_STAGE_VALUES})",
            name="ck_pipeline_transition_to_stage",
        ),
        sa.CheckConstraint(
            f"from_stage IS NULL OR from_stage IN ({_STAGE_VALUES})",
            name="ck_pipeline_transition_from_stage",
        ),
        # Primary lookup: all transitions for a specific (candidate, job) ordered by time.
        sa.Index("idx_pipeline_transitions_entry_time", "candidate_id", "job_id", "moved_at"),
        # Analytics: recent activity across all candidates in a job.
        sa.Index("idx_pipeline_transitions_job_time", "job_id", "moved_at"),
        # Audit: what did a specific recruiter do.
        sa.Index("idx_pipeline_transitions_moved_by", "moved_by"),
    )
