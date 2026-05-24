"""add user preferred theme

Revision ID: s7t8u9v0w1x2
Revises: r6s7t8u9v0w1
Create Date: 2026-05-17 13:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "s7t8u9v0w1x2"
down_revision = "5f6e7g8h9i0j"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("preferred_theme", sa.String(length=20), nullable=True, server_default="theme_4"),
    )
    op.create_check_constraint(
        "ck_users_preferred_theme",
        "users",
        "preferred_theme IS NULL OR preferred_theme IN ('theme_1', 'theme_2', 'theme_3', 'theme_4')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_preferred_theme", "users", type_="check")
    op.drop_column("users", "preferred_theme")
