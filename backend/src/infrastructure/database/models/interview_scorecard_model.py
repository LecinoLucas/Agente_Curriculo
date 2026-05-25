from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

INTERVIEW_SCORECARD_STATUSES = "'draft', 'submitted'"
INTERVIEW_SCORECARD_RECOMMENDATIONS = "'strong_yes', 'yes', 'neutral', 'no', 'strong_no'"


class InterviewScorecardModel(Base):
    __tablename__ = "interview_scorecards"

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
    interview_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("interview_schedules.id", ondelete="SET NULL"),
    )
    evaluator_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="draft")
    final_recommendation: Mapped[str | None] = mapped_column(sa.String(20))
    overall_notes: Mapped[str | None] = mapped_column(sa.Text)
    submitted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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

    items: Mapped[list["InterviewScorecardItemModel"]] = relationship(
        "InterviewScorecardItemModel",
        back_populates="scorecard",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="InterviewScorecardItemModel.display_order",
    )

    __table_args__ = (
        sa.CheckConstraint(
            f"status IN ({INTERVIEW_SCORECARD_STATUSES})",
            name="ck_interview_scorecards_status",
        ),
        sa.CheckConstraint(
            f"final_recommendation IS NULL OR final_recommendation IN ({INTERVIEW_SCORECARD_RECOMMENDATIONS})",
            name="ck_interview_scorecards_final_recommendation",
        ),
        sa.Index(
            "uq_interview_scorecard_pipeline_no_interview",
            "pipeline_id",
            "candidate_id",
            "job_id",
            unique=True,
            postgresql_where=sa.text("interview_id IS NULL AND pipeline_id IS NOT NULL"),
            sqlite_where=sa.text("interview_id IS NULL AND pipeline_id IS NOT NULL"),
        ),
        sa.Index(
            "uq_interview_scorecard_pipeline_with_interview",
            "pipeline_id",
            "candidate_id",
            "job_id",
            "interview_id",
            unique=True,
            postgresql_where=sa.text("interview_id IS NOT NULL AND pipeline_id IS NOT NULL"),
            sqlite_where=sa.text("interview_id IS NOT NULL AND pipeline_id IS NOT NULL"),
        ),
        sa.Index("idx_interview_scorecards_job_candidate", "job_id", "candidate_id"),
        sa.Index("idx_interview_scorecards_pipeline", "pipeline_id"),
        sa.Index("idx_interview_scorecards_status", "status"),
    )


class InterviewScorecardItemModel(Base):
    __tablename__ = "interview_scorecard_items"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    scorecard_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("interview_scorecards.id", ondelete="CASCADE"),
        nullable=False,
    )
    competency_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    question_text: Mapped[str | None] = mapped_column(sa.Text)
    rating: Mapped[int | None] = mapped_column(sa.Integer)
    evidence: Mapped[str | None] = mapped_column(sa.Text)
    weight: Mapped[Decimal] = mapped_column(sa.Numeric(6, 2), nullable=False, default=Decimal("1.00"), server_default="1.00")
    display_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default="0")
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

    scorecard: Mapped[InterviewScorecardModel] = relationship(
        "InterviewScorecardModel",
        back_populates="items",
    )

    __table_args__ = (
        sa.CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_interview_scorecard_items_rating"),
        sa.Index("idx_interview_scorecard_items_scorecard", "scorecard_id"),
    )
