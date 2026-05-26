"""Add rejection_reason_public to pre_admission_documents.

Revision ID: d8a1c4f7b6e2
Revises: c2e3a4b5f691
Create Date: 2026-05-26 00:00:00.000000

Separates the candidate-facing rejection message from the internal RH review
note (`review_notes`). The new column is nullable and is NOT backfilled from
the existing `review_notes` field, since historical review notes may contain
internal text that must not be exposed to candidates.
"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d8a1c4f7b6e2"
down_revision: str | None = "c2e3a4b5f691"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "pre_admission_documents",
        sa.Column("rejection_reason_public", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("pre_admission_documents", "rejection_reason_public")
