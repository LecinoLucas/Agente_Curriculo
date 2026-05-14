from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")

BEHAVIORAL_TEMPLATE_STATUSES = "'draft', 'active', 'archived'"
BEHAVIORAL_QUESTION_TYPES = "'text', 'scale', 'multiple_choice'"


class BehavioralAssessmentTemplateModel(Base):
    __tablename__ = "behavioral_assessment_templates"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[str] = mapped_column(sa.String(20), nullable=False, server_default="draft")
    version: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="1")
    created_by: Mapped[UUID | None] = mapped_column(sa.UUID(as_uuid=True))
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
    archived_at: Mapped[datetime | None] = mapped_column(sa.TIMESTAMP(timezone=True))

    __table_args__ = (
        sa.CheckConstraint(
            f"status IN ({BEHAVIORAL_TEMPLATE_STATUSES})",
            name="ck_behavioral_assessment_templates_status",
        ),
    )


class BehavioralTemplateCompetencyModel(Base):
    __tablename__ = "behavioral_template_competencies"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    template_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_assessment_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(sa.Text)
    weight: Mapped[float] = mapped_column(sa.Numeric(5, 2), nullable=False, server_default="1.0")
    display_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
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
        sa.Index("idx_behavioral_template_competencies_template_order", "template_id", "display_order"),
    )


class BehavioralTemplateQuestionModel(Base):
    __tablename__ = "behavioral_template_questions"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    competency_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("behavioral_template_competencies.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_text: Mapped[str] = mapped_column(sa.Text, nullable=False)
    answer_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    is_required: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.true())
    weight: Mapped[float] = mapped_column(sa.Numeric(5, 2), nullable=False, server_default="1.0")
    display_order: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default="0")
    options_json: Mapped[list | None] = mapped_column(JSONB_COMPAT)
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
            f"answer_type IN ({BEHAVIORAL_QUESTION_TYPES})",
            name="ck_behavioral_template_questions_answer_type",
        ),
        sa.Index("idx_behavioral_template_questions_competency_order", "competency_id", "display_order"),
    )
