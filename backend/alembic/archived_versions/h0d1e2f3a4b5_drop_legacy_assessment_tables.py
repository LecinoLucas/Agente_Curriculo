"""drop legacy assessment tables

Revision ID: h0d1e2f3a4b5
Revises: c6f4dd3e76d4, g0a1b2c3d4e5
Create Date: 2026-05-14 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "h0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = ("c6f4dd3e76d4", "g0a1b2c3d4e5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _drop_constraint_if_exists(table_name: str, constraint_name: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f'ALTER TABLE "{table_name}" DROP CONSTRAINT IF EXISTS "{constraint_name}"')


def _drop_index_if_exists(index_name: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f'DROP INDEX IF EXISTS "{index_name}"')
        return

    inspector = sa.inspect(bind)
    if any(index["name"] == index_name for table in inspector.get_table_names() for index in inspector.get_indexes(table)):
        op.drop_index(index_name)


def _drop_table_if_exists(table_name: str) -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(f'DROP TABLE IF EXISTS "{table_name}" CASCADE')
        return

    if sa.inspect(bind).has_table(table_name):
        op.drop_table(table_name)


def upgrade() -> None:
    _drop_constraint_if_exists("candidate_assessment_answers", "candidate_assessment_answers_assignment_id_fkey")
    _drop_constraint_if_exists("candidate_assessment_answers", "candidate_assessment_answers_question_id_fkey")
    _drop_constraint_if_exists("candidate_assessment_answers", "candidate_assessment_answers_option_id_fkey")
    _drop_constraint_if_exists("candidate_assessment_assignments", "candidate_assessment_assignments_candidate_id_fkey")
    _drop_constraint_if_exists("candidate_assessment_assignments", "candidate_assessment_assignments_job_id_fkey")
    _drop_constraint_if_exists("candidate_assessment_assignments", "candidate_assessment_assignments_template_id_fkey")
    _drop_constraint_if_exists("job_assessments", "job_assessments_job_id_fkey")
    _drop_constraint_if_exists("job_assessments", "job_assessments_template_id_fkey")
    _drop_constraint_if_exists("assessment_options", "assessment_options_question_id_fkey")
    _drop_constraint_if_exists("assessment_questions", "assessment_questions_template_id_fkey")

    _drop_index_if_exists("idx_candidate_assessment_answers_assignment")
    _drop_index_if_exists("idx_candidate_assessment_pipeline")
    _drop_index_if_exists("idx_candidate_assessment_candidate_status")
    _drop_index_if_exists("idx_job_assessments_job_order")
    _drop_index_if_exists("idx_assessment_options_question_order")
    _drop_index_if_exists("idx_assessment_questions_template_order")

    _drop_table_if_exists("candidate_assessment_answers")
    _drop_table_if_exists("candidate_assessment_assignments")
    _drop_table_if_exists("job_assessments")
    _drop_table_if_exists("assessment_options")
    _drop_table_if_exists("assessment_questions")
    _drop_table_if_exists("assessment_templates")


def downgrade() -> None:
    pass
