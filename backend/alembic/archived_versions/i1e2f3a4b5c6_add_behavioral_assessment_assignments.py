"""add behavioral assessment assignments

Revision ID: i1e2f3a4b5c6
Revises: h0d1e2f3a4b5
Create Date: 2026-05-14 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "i1e2f3a4b5c6"
down_revision: str | Sequence[str] | None = "h0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _jsonb() -> sa.types.TypeEngine:
    return postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "behavioral_assessment_assignments",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("assigned_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'in_progress', 'submitted', 'expired', 'cancelled')",
            name="ck_behavioral_assessment_assignments_status",
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["behavioral_assessment_templates.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_id", "job_id", "template_id", name="uq_behavioral_assignment_candidate_job_template"),
    )
    op.create_index(
        "idx_behavioral_assignments_candidate_status",
        "behavioral_assessment_assignments",
        ["candidate_id", "status"],
    )
    op.create_index(
        "idx_behavioral_assignments_job_candidate",
        "behavioral_assessment_assignments",
        ["job_id", "candidate_id"],
    )

    op.create_table(
        "behavioral_assessment_answers",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("assignment_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("answer_text", sa.Text(), nullable=True),
        sa.Column("answer_value", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("selected_options_json", _jsonb(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.ForeignKeyConstraint(["assignment_id"], ["behavioral_assessment_assignments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["behavioral_template_questions.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("assignment_id", "question_id", name="uq_behavioral_answer_assignment_question"),
    )
    op.create_index("idx_behavioral_answers_assignment", "behavioral_assessment_answers", ["assignment_id"])


def downgrade() -> None:
    op.drop_index("idx_behavioral_answers_assignment", table_name="behavioral_assessment_answers")
    op.drop_table("behavioral_assessment_answers")
    op.drop_index("idx_behavioral_assignments_job_candidate", table_name="behavioral_assessment_assignments")
    op.drop_index("idx_behavioral_assignments_candidate_status", table_name="behavioral_assessment_assignments")
    op.drop_table("behavioral_assessment_assignments")
