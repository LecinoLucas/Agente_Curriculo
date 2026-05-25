from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

BEHAVIORAL_ASSIGNMENT_STATUSES = "'pending', 'in_progress', 'submitted', 'expired', 'cancelled'"


class BehavioralAssessmentAssignmentModel(Base):
    __tablename__ = "behavioral_assessment_assignments"

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
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="pending")
    assigned_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    started_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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
            f"status IN ({BEHAVIORAL_ASSIGNMENT_STATUSES})",
            name="ck_behavioral_assessment_assignments_status",
        ),
        sa.UniqueConstraint("pipeline_id", "template_id", name="uq_behavioral_assignment_pipeline_template"),
        sa.Index("idx_behavioral_assignments_candidate_status", "candidate_id", "status"),
        sa.Index("idx_behavioral_assignments_job_candidate", "job_id", "candidate_id"),
        sa.Index("idx_behavioral_assignments_pipeline", "pipeline_id"),
    )


class BehavioralAssessmentAnswerModel(Base):
    __tablename__ = "behavioral_assessment_answers"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    assignment_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_template_questions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    answer_text: Mapped[str | None] = mapped_column(sa.Text)
    answer_value: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2))
    selected_options_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
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
        sa.UniqueConstraint("assignment_id", "question_id", name="uq_behavioral_answer_assignment_question"),
        sa.Index("idx_behavioral_answers_assignment", "assignment_id"),
    )


BEHAVIORAL_AI_EVALUATION_STATUSES = "'pending', 'processing', 'retry_scheduled', 'completed', 'failed'"
BEHAVIORAL_CONFIDENCE_LEVELS = "'low', 'medium', 'high'"


class BehavioralAssessmentAIEvaluationModel(Base):
    __tablename__ = "behavioral_assessment_ai_evaluations"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    assignment_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_assignments.id", ondelete="CASCADE"),
        nullable=False,
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
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="pending")
    provider: Mapped[str] = mapped_column(sa.String(50), nullable=False, default="anthropic")
    model: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    prompt_version: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=1)
    confidence: Mapped[str | None] = mapped_column(sa.String(10))
    summary: Mapped[str | None] = mapped_column(sa.Text)
    strengths_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
    concerns_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
    competency_signals_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
    suggested_interview_questions_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
    evidence_json: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    risk_flags_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
    error_message: Mapped[str | None] = mapped_column(sa.Text)
    requested_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    queued_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
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
    completed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    next_retry_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    retry_count: Mapped[int] = mapped_column(sa.SmallInteger, nullable=False, server_default="0")
    task_id: Mapped[str | None] = mapped_column(sa.String(255))
    provider_error_type: Mapped[str | None] = mapped_column(sa.String(50))
    provider_status_code: Mapped[int | None] = mapped_column(sa.Integer)

    __table_args__ = (
        sa.CheckConstraint(
            f"status IN ({BEHAVIORAL_AI_EVALUATION_STATUSES})",
            name="ck_behavioral_ai_evaluation_status",
        ),
        sa.CheckConstraint(
            f"confidence IS NULL OR confidence IN ({BEHAVIORAL_CONFIDENCE_LEVELS})",
            name="ck_behavioral_ai_evaluation_confidence",
        ),
        sa.UniqueConstraint(
            "assignment_id",
            name="uq_behavioral_ai_evaluation_assignment",
        ),
        sa.Index("idx_behavioral_ai_eval_candidate_status", "candidate_id", "status"),
        sa.Index("idx_behavioral_ai_eval_job_candidate", "job_id", "candidate_id"),
    )
