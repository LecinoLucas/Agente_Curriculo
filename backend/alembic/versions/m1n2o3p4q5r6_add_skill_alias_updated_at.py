"""Add updated_at to skill aliases

Revision ID: m1n2o3p4q5r6
Revises: 20260607_ai_knowledge_admin
Create Date: 2026-06-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "m1n2o3p4q5r6"
down_revision = "20260607_ai_knowledge_admin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "skill_aliases",
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    op.drop_column("skill_aliases", "updated_at")
