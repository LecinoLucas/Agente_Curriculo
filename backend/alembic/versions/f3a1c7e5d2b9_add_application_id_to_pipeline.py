"""Add application_id to candidate_job_pipeline.

Revision ID: f3a1c7e5d2b9
Revises: d2f8e1a3b0c5
Create Date: 2026-06-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f3a1c7e5d2b9"
down_revision: str | Sequence[str] | None = "d2f8e1a3b0c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "candidate_job_pipeline",
        sa.Column(
            "application_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("candidate_applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_candidate_job_pipeline_application_id",
        "candidate_job_pipeline",
        ["application_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_candidate_job_pipeline_application_id",
        table_name="candidate_job_pipeline",
    )
    op.drop_column("candidate_job_pipeline", "application_id")
