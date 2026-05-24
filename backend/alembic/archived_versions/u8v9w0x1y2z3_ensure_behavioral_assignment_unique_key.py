"""ensure unique key for behavioral assignment candidate+job+template

Revision ID: u8v9w0x1y2z3
Revises: s7t8u9v0w1x2
Create Date: 2026-05-18 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "u8v9w0x1y2z3"
down_revision: str | Sequence[str] | None = "s7t8u9v0w1x2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TABLE = "behavioral_assessment_assignments"
_UNIQUE_KEY_NAME = "uq_behavioral_assignment_candidate_job_template"
_COLUMNS = ["candidate_id", "job_id", "template_id"]


def _has_unique_constraint(bind: sa.engine.Connection) -> bool:
    inspector = sa.inspect(bind)
    return any(uc.get("name") == _UNIQUE_KEY_NAME for uc in inspector.get_unique_constraints(_TABLE))


def _has_unique_index(bind: sa.engine.Connection) -> bool:
    inspector = sa.inspect(bind)
    for idx in inspector.get_indexes(_TABLE):
        if idx.get("name") != _UNIQUE_KEY_NAME:
            continue
        if idx.get("unique"):
            return True
    return False


def upgrade() -> None:
    bind = op.get_bind()

    # Defensive cleanup in case old environments accepted duplicates.
    bind.execute(
        sa.text(
            """
            DELETE FROM behavioral_assessment_assignments
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY candidate_id, job_id, template_id
                            ORDER BY
                                COALESCE(submitted_at, created_at) DESC,
                                updated_at DESC,
                                created_at DESC,
                                id DESC
                        ) AS rn
                    FROM behavioral_assessment_assignments
                ) dedup
                WHERE dedup.rn > 1
            )
            """
        )
    )

    if not _has_unique_constraint(bind) and not _has_unique_index(bind):
        op.create_index(
            _UNIQUE_KEY_NAME,
            _TABLE,
            _COLUMNS,
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_unique_constraint(bind):
        return
    if _has_unique_index(bind):
        op.drop_index(_UNIQUE_KEY_NAME, table_name=_TABLE)
