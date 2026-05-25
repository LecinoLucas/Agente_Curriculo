from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

HIRING_DECISION_STATUSES = "'draft', 'submitted', 'superseded'"
HIRING_DECISION_OUTCOMES = (
    "'advance', 'hold', 'reject', 'hire', 'request_another_interview', 'keep_under_review'"
)
HIRING_DECISION_REASON_CODES = (
    "'strong_fit', 'partial_fit', 'missing_required_skill', 'salary_mismatch', "
    "'availability_mismatch', 'behavioral_concern', 'interview_concern', "
    "'better_candidates', 'candidate_withdrew', 'other'"
)


class CandidateJobHiringDecisionModel(Base):
    __tablename__ = "candidate_job_hiring_decisions"

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
    pipeline_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
    )
    decided_by: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"))
    decision_status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="draft")
    decision_outcome: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    reason_code: Mapped[str] = mapped_column(sa.String(40), nullable=False)
    notes: Mapped[str | None] = mapped_column(sa.Text)
    based_on_decision_summary_snapshot: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    based_on_scorecard_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("interview_scorecards.id", ondelete="SET NULL"),
    )
    based_on_behavioral_assignment_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_assignments.id", ondelete="SET NULL"),
    )
    based_on_behavioral_ai_evaluation_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_ai_evaluations.id", ondelete="SET NULL"),
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
    submitted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))

    __table_args__ = (
        sa.CheckConstraint(
            f"decision_status IN ({HIRING_DECISION_STATUSES})",
            name="ck_candidate_job_hiring_decisions_status",
        ),
        sa.CheckConstraint(
            f"decision_outcome IN ({HIRING_DECISION_OUTCOMES})",
            name="ck_candidate_job_hiring_decisions_outcome",
        ),
        sa.CheckConstraint(
            f"reason_code IN ({HIRING_DECISION_REASON_CODES})",
            name="ck_candidate_job_hiring_decisions_reason_code",
        ),
        sa.Index(
            "uq_candidate_job_hiring_decision_current_pipeline",
            "pipeline_id",
            "candidate_id",
            "job_id",
            unique=True,
            postgresql_where=sa.text("decision_status <> 'superseded' AND pipeline_id IS NOT NULL"),
            sqlite_where=sa.text("decision_status <> 'superseded' AND pipeline_id IS NOT NULL"),
        ),
        sa.Index("idx_candidate_job_hiring_decisions_job_candidate", "job_id", "candidate_id"),
        sa.Index("idx_candidate_job_hiring_decisions_status", "decision_status"),
    )
