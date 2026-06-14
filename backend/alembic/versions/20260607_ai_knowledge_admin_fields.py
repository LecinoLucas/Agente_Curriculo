"""AI knowledge admin fields

Revision ID: 20260607_ai_knowledge
Revises: 23dbb452c78a
Create Date: 2026-06-07 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "20260607_ai_knowledge_admin_fields"
down_revision = "23dbb452c78a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("domain", sa.String(length=100), nullable=False, server_default="general"),
    )
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("visibility", sa.String(length=30), nullable=False, server_default="internal"),
    )
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("allowed_roles_json", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("sensitivity_level", sa.String(length=30), nullable=False, server_default="low"),
    )
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("tags_json", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column("ai_knowledge_documents", sa.Column("reviewed_by", sa.Text(), nullable=True))
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("indexing_status", sa.String(length=30), nullable=False, server_default="indexed"),
    )
    op.add_column(
        "ai_knowledge_documents",
        sa.Column("last_indexed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column("ai_knowledge_documents", sa.Column("last_index_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_knowledge_documents", "last_index_error")
    op.drop_column("ai_knowledge_documents", "last_indexed_at")
    op.drop_column("ai_knowledge_documents", "indexing_status")
    op.drop_column("ai_knowledge_documents", "reviewed_at")
    op.drop_column("ai_knowledge_documents", "reviewed_by")
    op.drop_column("ai_knowledge_documents", "tags_json")
    op.drop_column("ai_knowledge_documents", "sensitivity_level")
    op.drop_column("ai_knowledge_documents", "allowed_roles_json")
    op.drop_column("ai_knowledge_documents", "visibility")
    op.drop_column("ai_knowledge_documents", "domain")
