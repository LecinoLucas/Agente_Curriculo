from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

ASSESSMENT_TYPES = "'behavioral_test', 'behavioral_survey'"
TEMPLATE_STATUSES = "'draft', 'active', 'archived'"
QUESTION_TYPES = "'single_choice', 'multiple_choice', 'scale', 'text'"
ASSIGNMENT_STATUSES = "'pending', 'in_progress', 'completed', 'expired', 'cancelled'"


class AssessmentTemplateModel(Base):
    __tablename__ = "assessment_templates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    title: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="draft")
    version: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="1")
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
        sa.CheckConstraint(f"type IN ({ASSESSMENT_TYPES})", name="ck_assessment_templates_type"),
        sa.CheckConstraint(f"status IN ({TEMPLATE_STATUSES})", name="ck_assessment_templates_status"),
    )


class AssessmentQuestionModel(Base):
    __tablename__ = "assessment_questions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("assessment_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    question_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    required: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.true())
    order_index: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    metadata_payload: Mapped[dict | None] = mapped_column("metadata", JSONB_COMPAT)
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
        sa.CheckConstraint(f"question_type IN ({QUESTION_TYPES})", name="ck_assessment_questions_type"),
        sa.Index("idx_assessment_questions_template_order", "template_id", "order_index"),
    )


class AssessmentOptionModel(Base):
    __tablename__ = "assessment_options"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    question_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("assessment_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    option_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    score_value: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2))
    metadata_payload: Mapped[dict | None] = mapped_column("metadata", JSONB_COMPAT)
    order_index: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")

    __table_args__ = (
        sa.Index("idx_assessment_options_question_order", "question_id", "order_index"),
    )


class JobAssessmentModel(Base):
    __tablename__ = "job_assessments"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    job_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("assessment_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    required: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.true())
    trigger_stage: Mapped[str] = mapped_column(sa.String(50), nullable=False, server_default="entry")
    order_index: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.UniqueConstraint("job_id", "template_id", name="uq_job_assessments_job_template"),
        sa.Index("idx_job_assessments_job_order", "job_id", "order_index"),
    )


class CandidateAssessmentAssignmentModel(Base):
    __tablename__ = "candidate_assessment_assignments"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    candidate_id: Mapped[UUID] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True), sa.ForeignKey("jobs.id", ondelete="CASCADE"))
    pipeline_id: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True))
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("assessment_templates.id", ondelete="RESTRICT"),
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
    completed_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))
    result_summary: Mapped[str | None] = mapped_column(sa.Text)
    score: Mapped[Decimal | None] = mapped_column(sa.Numeric(10, 2))
    metadata_payload: Mapped[dict | None] = mapped_column("metadata", JSONB_COMPAT)

    __table_args__ = (
        sa.CheckConstraint(f"status IN ({ASSIGNMENT_STATUSES})", name="ck_candidate_assessment_assignments_status"),
        sa.UniqueConstraint("candidate_id", "job_id", "pipeline_id", "template_id", name="uq_candidate_assessment_assignment_scope"),
        sa.Index("idx_candidate_assessment_candidate_status", "candidate_id", "status"),
        sa.Index("idx_candidate_assessment_pipeline", "pipeline_id"),
    )


class CandidateAssessmentAnswerModel(Base):
    __tablename__ = "candidate_assessment_answers"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    assignment_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("candidate_assessment_assignments.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("assessment_questions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    option_id: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("assessment_options.id", ondelete="RESTRICT"),
    )
    answer_text: Mapped[str | None] = mapped_column(sa.Text)
    answer_value: Mapped[dict | None] = mapped_column(JSONB_COMPAT)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.Index("idx_candidate_assessment_answers_assignment", "assignment_id"),
    )
