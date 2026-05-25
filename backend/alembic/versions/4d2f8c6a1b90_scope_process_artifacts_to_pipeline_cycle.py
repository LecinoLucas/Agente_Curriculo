"""Scope process artifacts to active pipeline cycle.

Revision ID: 4d2f8c6a1b90
Revises: 0b8c7f1e9a24
Create Date: 2026-05-25 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "4d2f8c6a1b90"
down_revision: str | None = "0b8c7f1e9a24"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE candidate_job_pipeline
        SET candidate_job_pipeline_id = uuid_generate_v4()
        WHERE candidate_job_pipeline_id IS NULL
        """
    )
    op.add_column(
        "behavioral_assessment_assignments",
        sa.Column("pipeline_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "interview_scorecards",
        sa.Column("pipeline_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.drop_constraint(
        "candidate_job_hiring_decisions_pipeline_id_fkey",
        "candidate_job_hiring_decisions",
        type_="foreignkey",
    )

    op.execute(
        """
        UPDATE interview_schedules AS interview
        SET pipeline_id = pipeline.candidate_job_pipeline_id
        FROM candidate_job_pipeline AS pipeline
        WHERE interview.pipeline_id IS NULL
          AND interview.candidate_id = pipeline.candidate_id
          AND interview.job_id = pipeline.job_id
          AND pipeline.candidate_job_pipeline_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE behavioral_assessment_assignments AS assignment
        SET pipeline_id = pipeline.candidate_job_pipeline_id
        FROM candidate_job_pipeline AS pipeline
        WHERE assignment.pipeline_id IS NULL
          AND assignment.candidate_id = pipeline.candidate_id
          AND assignment.job_id = pipeline.job_id
          AND pipeline.candidate_job_pipeline_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE interview_scorecards AS scorecard
        SET pipeline_id = interview.pipeline_id
        FROM interview_schedules AS interview
        WHERE scorecard.pipeline_id IS NULL
          AND scorecard.interview_id = interview.id
          AND interview.pipeline_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE candidate_job_hiring_decisions AS decision
        SET pipeline_id = pipeline.candidate_job_pipeline_id
        FROM candidate_job_pipeline AS pipeline
        WHERE decision.pipeline_id IS NULL
          AND decision.candidate_id = pipeline.candidate_id
          AND decision.job_id = pipeline.job_id
          AND pipeline.candidate_job_pipeline_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE interview_scorecards AS scorecard
        SET pipeline_id = pipeline.candidate_job_pipeline_id
        FROM candidate_job_pipeline AS pipeline
        WHERE scorecard.pipeline_id IS NULL
          AND scorecard.candidate_id = pipeline.candidate_id
          AND scorecard.job_id = pipeline.job_id
          AND pipeline.candidate_job_pipeline_id IS NOT NULL
        """
    )

    op.drop_constraint(
        "uq_behavioral_assignment_candidate_job_template",
        "behavioral_assessment_assignments",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_behavioral_assignment_pipeline_template",
        "behavioral_assessment_assignments",
        ["pipeline_id", "template_id"],
    )
    op.create_index(
        "idx_behavioral_assignments_pipeline",
        "behavioral_assessment_assignments",
        ["pipeline_id"],
    )

    op.drop_constraint(
        "uq_interview_scorecard_candidate_job_interview",
        "interview_scorecards",
        type_="unique",
    )
    op.drop_index(
        "uq_interview_scorecard_candidate_job_no_interview",
        table_name="interview_scorecards",
    )
    op.drop_index(
        "uq_interview_scorecard_candidate_job_with_interview",
        table_name="interview_scorecards",
    )
    op.create_index(
        "uq_interview_scorecard_pipeline_no_interview",
        "interview_scorecards",
        ["pipeline_id", "candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("interview_id IS NULL AND pipeline_id IS NOT NULL"),
        sqlite_where=sa.text("interview_id IS NULL AND pipeline_id IS NOT NULL"),
    )
    op.create_index(
        "uq_interview_scorecard_pipeline_with_interview",
        "interview_scorecards",
        ["pipeline_id", "candidate_id", "job_id", "interview_id"],
        unique=True,
        postgresql_where=sa.text("interview_id IS NOT NULL AND pipeline_id IS NOT NULL"),
        sqlite_where=sa.text("interview_id IS NOT NULL AND pipeline_id IS NOT NULL"),
    )
    op.create_index(
        "idx_interview_scorecards_pipeline",
        "interview_scorecards",
        ["pipeline_id"],
    )
    op.drop_index(
        "uq_candidate_job_hiring_decision_current",
        table_name="candidate_job_hiring_decisions",
    )
    op.create_index(
        "uq_candidate_job_hiring_decision_current_pipeline",
        "candidate_job_hiring_decisions",
        ["pipeline_id", "candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("decision_status <> 'superseded' AND pipeline_id IS NOT NULL"),
        sqlite_where=sa.text("decision_status <> 'superseded' AND pipeline_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_candidate_job_hiring_decision_current_pipeline",
        table_name="candidate_job_hiring_decisions",
    )
    op.create_index(
        "uq_candidate_job_hiring_decision_current",
        "candidate_job_hiring_decisions",
        ["candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("decision_status <> 'superseded'"),
        sqlite_where=sa.text("decision_status <> 'superseded'"),
    )
    op.drop_index("idx_interview_scorecards_pipeline", table_name="interview_scorecards")
    op.drop_index("uq_interview_scorecard_pipeline_with_interview", table_name="interview_scorecards")
    op.drop_index("uq_interview_scorecard_pipeline_no_interview", table_name="interview_scorecards")
    op.create_index(
        "uq_interview_scorecard_candidate_job_with_interview",
        "interview_scorecards",
        ["candidate_id", "job_id", "interview_id"],
        unique=True,
        postgresql_where=sa.text("interview_id IS NOT NULL"),
        sqlite_where=sa.text("interview_id IS NOT NULL"),
    )
    op.create_index(
        "uq_interview_scorecard_candidate_job_no_interview",
        "interview_scorecards",
        ["candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("interview_id IS NULL"),
        sqlite_where=sa.text("interview_id IS NULL"),
    )
    op.create_unique_constraint(
        "uq_interview_scorecard_candidate_job_interview",
        "interview_scorecards",
        ["candidate_id", "job_id", "interview_id"],
    )

    op.drop_index("idx_behavioral_assignments_pipeline", table_name="behavioral_assessment_assignments")
    op.drop_constraint(
        "uq_behavioral_assignment_pipeline_template",
        "behavioral_assessment_assignments",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_behavioral_assignment_candidate_job_template",
        "behavioral_assessment_assignments",
        ["candidate_id", "job_id", "template_id"],
    )

    op.create_foreign_key(
        "candidate_job_hiring_decisions_pipeline_id_fkey",
        "candidate_job_hiring_decisions",
        "candidate_job_pipeline",
        ["pipeline_id"],
        ["candidate_job_pipeline_id"],
        ondelete="SET NULL",
    )
    op.drop_column("interview_scorecards", "pipeline_id")
    op.drop_column("behavioral_assessment_assignments", "pipeline_id")
