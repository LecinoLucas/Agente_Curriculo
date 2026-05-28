"""Scope interview scorecard uniqueness per evaluator.

Revision ID: a91b3e7c4d52
Revises: e5f6a7b8c9d0, 9f4a6b2c1d33
Create Date: 2026-05-27 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "a91b3e7c4d52"
down_revision: str | Sequence[str] | None = ("e5f6a7b8c9d0", "9f4a6b2c1d33")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_interview_scorecard_pipeline_no_interview", table_name="interview_scorecards")
    op.drop_index("uq_interview_scorecard_pipeline_with_interview", table_name="interview_scorecards")

    op.create_index(
        "uq_interview_scorecard_pipe_eval_no_iv",
        "interview_scorecards",
        ["pipeline_id", "candidate_id", "job_id", "evaluator_id"],
        unique=True,
        postgresql_where=sa.text(
            "interview_id IS NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NOT NULL"
        ),
        sqlite_where=sa.text(
            "interview_id IS NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NOT NULL"
        ),
    )
    op.create_index(
        "uq_interview_scorecard_pipe_eval_with_iv",
        "interview_scorecards",
        ["pipeline_id", "candidate_id", "job_id", "interview_id", "evaluator_id"],
        unique=True,
        postgresql_where=sa.text(
            "interview_id IS NOT NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NOT NULL"
        ),
        sqlite_where=sa.text(
            "interview_id IS NOT NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NOT NULL"
        ),
    )
    op.create_index(
        "uq_interview_scorecard_pipe_anon_no_iv",
        "interview_scorecards",
        ["pipeline_id", "candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text(
            "interview_id IS NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NULL"
        ),
        sqlite_where=sa.text(
            "interview_id IS NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NULL"
        ),
    )
    op.create_index(
        "uq_interview_scorecard_pipe_anon_with_iv",
        "interview_scorecards",
        ["pipeline_id", "candidate_id", "job_id", "interview_id"],
        unique=True,
        postgresql_where=sa.text(
            "interview_id IS NOT NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NULL"
        ),
        sqlite_where=sa.text(
            "interview_id IS NOT NULL AND pipeline_id IS NOT NULL AND evaluator_id IS NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_interview_scorecard_pipe_anon_with_iv", table_name="interview_scorecards")
    op.drop_index("uq_interview_scorecard_pipe_anon_no_iv", table_name="interview_scorecards")
    op.drop_index("uq_interview_scorecard_pipe_eval_with_iv", table_name="interview_scorecards")
    op.drop_index("uq_interview_scorecard_pipe_eval_no_iv", table_name="interview_scorecards")

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
