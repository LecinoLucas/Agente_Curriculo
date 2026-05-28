"""Add dismissed status and fields to pre-admission cases.

Revision ID: e5f6a7b8c9d0
Revises: f3d1a8c9b2e4
Create Date: 2026-05-27 14:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: str | None = "f3d1a8c9b2e4"
branch_labels = None
depends_on = None


_OLD_STATUSES = (
    "'draft', 'offer_preparing', 'offer_sent', 'offer_accepted', 'offer_declined', "
    "'documents_pending', 'documents_received', 'ready_for_admission', 'admitted', 'cancelled'"
)
_NEW_STATUSES = (
    "'draft', 'offer_preparing', 'offer_sent', 'offer_accepted', 'offer_declined', "
    "'documents_pending', 'documents_received', 'ready_for_admission', 'admitted', 'dismissed', 'cancelled'"
)


def upgrade() -> None:
    op.add_column("pre_admission_cases", sa.Column("dismissed_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("pre_admission_cases", sa.Column("dismissal_reason", sa.Text(), nullable=True))

    with op.batch_alter_table("pre_admission_cases") as batch_op:
        batch_op.drop_constraint("ck_pre_admission_cases_status", type_="check")
        batch_op.create_check_constraint(
            "ck_pre_admission_cases_status",
            f"status IN ({_NEW_STATUSES})",
        )

    op.drop_index(
        "uq_pre_admission_active_candidate_job",
        table_name="pre_admission_cases",
        postgresql_where=sa.text("status NOT IN ('admitted', 'cancelled', 'offer_declined')"),
        sqlite_where=sa.text("status NOT IN ('admitted', 'cancelled', 'offer_declined')"),
    )
    op.create_index(
        "uq_pre_admission_active_candidate_job",
        "pre_admission_cases",
        ["candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("status NOT IN ('admitted', 'dismissed', 'cancelled', 'offer_declined')"),
        sqlite_where=sa.text("status NOT IN ('admitted', 'dismissed', 'cancelled', 'offer_declined')"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_pre_admission_active_candidate_job",
        table_name="pre_admission_cases",
        postgresql_where=sa.text("status NOT IN ('admitted', 'dismissed', 'cancelled', 'offer_declined')"),
        sqlite_where=sa.text("status NOT IN ('admitted', 'dismissed', 'cancelled', 'offer_declined')"),
    )
    op.create_index(
        "uq_pre_admission_active_candidate_job",
        "pre_admission_cases",
        ["candidate_id", "job_id"],
        unique=True,
        postgresql_where=sa.text("status NOT IN ('admitted', 'cancelled', 'offer_declined')"),
        sqlite_where=sa.text("status NOT IN ('admitted', 'cancelled', 'offer_declined')"),
    )

    with op.batch_alter_table("pre_admission_cases") as batch_op:
        batch_op.drop_constraint("ck_pre_admission_cases_status", type_="check")
        batch_op.create_check_constraint(
            "ck_pre_admission_cases_status",
            f"status IN ({_OLD_STATUSES})",
        )

    op.drop_column("pre_admission_cases", "dismissal_reason")
    op.drop_column("pre_admission_cases", "dismissed_at")
