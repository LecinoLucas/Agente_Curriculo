"""Add pre-admission ready-for-export fields.

Revision ID: b7e2c9d4a6f1
Revises: a4f2c8d9e1b0
Create Date: 2026-05-25 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7e2c9d4a6f1"
down_revision: str | None = "a4f2c8d9e1b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "pre_admission_cases",
        sa.Column(
            "ready_for_export",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "pre_admission_cases",
        sa.Column("ready_for_export_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "pre_admission_cases",
        sa.Column("ready_for_export_by", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_pre_admission_cases_ready_for_export_by_users",
        "pre_admission_cases",
        "users",
        ["ready_for_export_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_pre_admission_cases_ready_for_export",
        "pre_admission_cases",
        ["ready_for_export"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_pre_admission_cases_ready_for_export", table_name="pre_admission_cases")
    op.drop_constraint(
        "fk_pre_admission_cases_ready_for_export_by_users",
        "pre_admission_cases",
        type_="foreignkey",
    )
    op.drop_column("pre_admission_cases", "ready_for_export_by")
    op.drop_column("pre_admission_cases", "ready_for_export_at")
    op.drop_column("pre_admission_cases", "ready_for_export")
