"""Add pipeline performance indexes for board lookup and event dedup.

Revision ID: c2e3a4b5f691
Revises: b7e2c9d4a6f1
Create Date: 2026-05-26 00:00:00.000000

Production deployment note:
  These indexes are created inside an Alembic transaction (without CONCURRENTLY).
  On a large production table this will take an ACCESS SHARE lock briefly.
  To avoid any downtime, create them manually on production BEFORE running
  ``alembic upgrade head``:

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidate_job_pipeline_board_lookup
        ON candidate_job_pipeline (job_id, relationship_status, pipeline_status, is_terminal)
        WHERE terminated_at IS NULL;

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidate_job_pipeline_candidate_active
        ON candidate_job_pipeline (candidate_id, relationship_status, is_terminal)
        WHERE terminated_at IS NULL;

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidate_job_pipeline_events_dedup
        ON candidate_job_pipeline_events (candidate_id, job_id, event_type, from_stage, to_stage);

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_behavioral_assignments_board_lookup
        ON behavioral_assessment_assignments (candidate_id, job_id, pipeline_id, created_at);

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_schedules_board_lookup
        ON interview_schedules (candidate_id, job_id, pipeline_id, scheduled_start);

    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_scorecards_board_lookup
        ON interview_scorecards (candidate_id, job_id, pipeline_id);

  Alembic's ``IF NOT EXISTS`` check (``create_index(...)``) will skip them
  gracefully if they already exist when the migration runs.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2e3a4b5f691"
down_revision: str | None = "b7e2c9d4a6f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. candidate_job_pipeline — composite board lookup
    #    list_job_matches WHERE job_id = X AND (relationship_status + pipeline_status +
    #    is_terminal filter) benefits from this covering partial index.
    op.create_index(
        "idx_candidate_job_pipeline_board_lookup",
        "candidate_job_pipeline",
        ["job_id", "relationship_status", "pipeline_status", "is_terminal"],
        unique=False,
        postgresql_where=sa.text("terminated_at IS NULL"),
        sqlite_where=sa.text("terminated_at IS NULL"),
    )

    # 2. candidate_job_pipeline — candidate-level active entry lookup
    #    find_active_entry / find_active_entry_by_candidate / find_active_pipeline_id
    #    all filter on (candidate_id, relationship_status, is_terminal, terminated_at IS NULL).
    op.create_index(
        "idx_candidate_job_pipeline_candidate_active",
        "candidate_job_pipeline",
        ["candidate_id", "relationship_status", "is_terminal"],
        unique=False,
        postgresql_where=sa.text("terminated_at IS NULL"),
        sqlite_where=sa.text("terminated_at IS NULL"),
    )

    # 3. candidate_job_pipeline_events — deduplication COUNT query
    #    count_pipeline_events_matching runs on every stage move with a 5-column
    #    equality filter; existing (candidate_id, job_id, created_at) index
    #    lacks event_type / from_stage / to_stage selectivity.
    op.create_index(
        "idx_candidate_job_pipeline_events_dedup",
        "candidate_job_pipeline_events",
        ["candidate_id", "job_id", "event_type", "from_stage", "to_stage"],
        unique=False,
    )

    # 4. behavioral_assessment_assignments — board correlated subquery
    #    latest_behavioral_assignment_id subquery: candidate_id + job_id + pipeline_id
    #    ORDER BY created_at DESC LIMIT 1.  Existing indexes cover individual
    #    columns but not this composite.
    op.create_index(
        "idx_behavioral_assignments_board_lookup",
        "behavioral_assessment_assignments",
        ["candidate_id", "job_id", "pipeline_id", "created_at"],
        unique=False,
    )

    # 5. interview_schedules — board correlated subqueries
    #    latest_interview_status and latest_interview_start: candidate_id + job_id
    #    + pipeline_id ORDER BY scheduled_start.  Individual single-column indexes
    #    exist but not this composite.
    op.create_index(
        "idx_interview_schedules_board_lookup",
        "interview_schedules",
        ["candidate_id", "job_id", "pipeline_id", "scheduled_start"],
        unique=False,
    )

    # 6. interview_scorecards — board correlated subquery
    #    latest_scorecard_status: candidate_id + job_id + pipeline_id.  Existing
    #    (job_id, candidate_id) index does not include pipeline_id.
    op.create_index(
        "idx_interview_scorecards_board_lookup",
        "interview_scorecards",
        ["candidate_id", "job_id", "pipeline_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_interview_scorecards_board_lookup", table_name="interview_scorecards")
    op.drop_index("idx_interview_schedules_board_lookup", table_name="interview_schedules")
    op.drop_index("idx_behavioral_assignments_board_lookup", table_name="behavioral_assessment_assignments")
    op.drop_index("idx_candidate_job_pipeline_events_dedup", table_name="candidate_job_pipeline_events")
    op.drop_index("idx_candidate_job_pipeline_candidate_active", table_name="candidate_job_pipeline")
    op.drop_index("idx_candidate_job_pipeline_board_lookup", table_name="candidate_job_pipeline")
