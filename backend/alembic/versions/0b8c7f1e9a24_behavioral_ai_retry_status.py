"""Add retry state fields for behavioral AI evaluations.

Revision ID: 0b8c7f1e9a24
Revises: 3c9a7f5d2e11
Create Date: 2026-05-24 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0b8c7f1e9a24"
down_revision: str | None = "3c9a7f5d2e11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "behavioral_assessment_ai_evaluations",
        sa.Column("next_retry_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column(
        "behavioral_assessment_ai_evaluations",
        sa.Column("provider_error_type", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "behavioral_assessment_ai_evaluations",
        sa.Column("provider_status_code", sa.Integer(), nullable=True),
    )
    op.drop_constraint(
        "ck_behavioral_ai_evaluation_status",
        "behavioral_assessment_ai_evaluations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_behavioral_ai_evaluation_status",
        "behavioral_assessment_ai_evaluations",
        "status IN ('pending', 'processing', 'retry_scheduled', 'completed', 'failed')",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE behavioral_assessment_ai_evaluations "
        "SET status = 'pending' WHERE status = 'retry_scheduled'"
    )
    op.drop_constraint(
        "ck_behavioral_ai_evaluation_status",
        "behavioral_assessment_ai_evaluations",
        type_="check",
    )
    op.create_check_constraint(
        "ck_behavioral_ai_evaluation_status",
        "behavioral_assessment_ai_evaluations",
        "status IN ('pending', 'processing', 'completed', 'failed')",
    )
    op.drop_column("behavioral_assessment_ai_evaluations", "provider_status_code")
    op.drop_column("behavioral_assessment_ai_evaluations", "provider_error_type")
    op.drop_column("behavioral_assessment_ai_evaluations", "next_retry_at")
