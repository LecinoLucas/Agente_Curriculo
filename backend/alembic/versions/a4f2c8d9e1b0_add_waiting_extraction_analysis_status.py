"""add waiting_extraction analysis status

Revision ID: a4f2c8d9e1b0
Revises: 9f4a6b2c1d33
Create Date: 2026-05-25 21:10:00.000000
"""

from alembic import op


revision = "a4f2c8d9e1b0"
down_revision = "9f4a6b2c1d33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE analysis_status ADD VALUE IF NOT EXISTS 'waiting_extraction'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without rebuilding the type.
    pass
