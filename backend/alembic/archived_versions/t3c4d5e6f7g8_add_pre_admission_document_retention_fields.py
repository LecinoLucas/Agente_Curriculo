"""Add retention metadata to pre-admission documents.

Revision ID: t3c4d5e6f7g8
Revises: s2b3c4d5e6f7
Create Date: 2026-05-14 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "t3c4d5e6f7g8"
down_revision: str | None = "s2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("pre_admission_documents", sa.Column("retention_until", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("pre_admission_documents", sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("pre_admission_documents", sa.Column("deleted_by", sa.UUID(as_uuid=True), nullable=True))
    op.add_column("pre_admission_documents", sa.Column("deletion_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_pre_admission_documents_deleted_by_users",
        "pre_admission_documents",
        "users",
        ["deleted_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_pre_admission_documents_deleted_by_users", "pre_admission_documents", type_="foreignkey")
    op.drop_column("pre_admission_documents", "deletion_reason")
    op.drop_column("pre_admission_documents", "deleted_by")
    op.drop_column("pre_admission_documents", "deleted_at")
    op.drop_column("pre_admission_documents", "retention_until")
