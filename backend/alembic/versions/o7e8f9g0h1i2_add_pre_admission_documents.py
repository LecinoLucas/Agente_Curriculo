"""add pre admission documents

Revision ID: o7e8f9g0h1i2
Revises: n6d7e8f9g0h1
Create Date: 2026-05-14 08:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o7e8f9g0h1i2"
down_revision: str | None = "n6d7e8f9g0h1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pre_admission_documents",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("case_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("checklist_item_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_key", sa.String(length=600), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="uploaded", nullable=False),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('uploaded', 'approved', 'rejected', 'replaced')",
            name="ck_pre_admission_documents_status",
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["case_id"], ["pre_admission_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["checklist_item_id"], ["pre_admission_checklist_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_pre_admission_documents_case", "pre_admission_documents", ["case_id"])
    op.create_index("idx_pre_admission_documents_item", "pre_admission_documents", ["checklist_item_id"])
    op.create_index("idx_pre_admission_documents_candidate", "pre_admission_documents", ["candidate_id"])


def downgrade() -> None:
    op.drop_index("idx_pre_admission_documents_candidate", table_name="pre_admission_documents")
    op.drop_index("idx_pre_admission_documents_item", table_name="pre_admission_documents")
    op.drop_index("idx_pre_admission_documents_case", table_name="pre_admission_documents")
    op.drop_table("pre_admission_documents")
