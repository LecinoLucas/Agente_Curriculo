"""drop_candidate_job_legacy_tables

Revision ID: 7e0b4c9d2f21
Revises: 9f4c21a7d8b2
Create Date: 2026-05-04 09:45:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "7e0b4c9d2f21"
down_revision: Union[str, None] = "9f4c21a7d8b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS pipeline_stage_transitions")
    op.execute("DROP TABLE IF EXISTS candidate_pipeline")
    op.execute("DROP TABLE IF EXISTS candidate_job_links")


def downgrade() -> None:
    # Legacy tables are intentionally not recreated here.
    # If downgrade is required, restore from backup and re-run prior migrations.
    raise RuntimeError("Downgrade for legacy table drop is not supported. Restore from backup.")
