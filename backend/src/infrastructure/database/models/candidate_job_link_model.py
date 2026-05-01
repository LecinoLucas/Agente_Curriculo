from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

_STATUS_VALUES = "'active', 'removed', 'transferred', 'hired', 'rejected'"
_SOURCE_VALUES = "'manual', 'pipeline', 'ai_match', 'import'"


class CandidateJobLinkModel(Base):
    """Official link between candidate and job, independent of pipeline or analysis state.

    This is the single source of truth for candidate-job relationships.
    Status determines the lifecycle of the link; source tracks how it was created.
    """

    __tablename__ = "candidate_job_links"

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
        index=True,
    )
    job_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # active: link is current; removed: unlinked by user; transferred: candidate moved to another job;
    # hired: candidate was hired; rejected: candidate was rejected
    status: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
        server_default="active",
    )
    # manual: recruiter linked directly; pipeline: added via pipeline; ai_match: auto-matched by AI;
    # import: bulk import
    source: Mapped[str] = mapped_column(
        sa.String(20),
        nullable=False,
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
    # Soft delete: link can be restored by setting back to NULL if needed
    deleted_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True),
    )

    __table_args__ = (
        # Partial unique constraint (only active) created in migration with raw SQL
        # to enforce: UNIQUE(candidate_id, job_id) WHERE deleted_at IS NULL
        # Indexes for common queries
        sa.Index("idx_candidate_job_links_candidate", "candidate_id"),
        sa.Index("idx_candidate_job_links_job", "job_id"),
        sa.Index("idx_candidate_job_links_status", "status"),
        sa.Index("idx_candidate_job_links_source", "source"),
        sa.Index("idx_candidate_job_links_created", "created_at"),
        sa.Index("idx_candidate_job_links_deleted", "deleted_at"),
        # Constraints
        sa.CheckConstraint(
            f"status IN ({_STATUS_VALUES})",
            name="ck_candidate_job_links_status",
        ),
        sa.CheckConstraint(
            f"source IN ({_SOURCE_VALUES})",
            name="ck_candidate_job_links_source",
        ),
    )
