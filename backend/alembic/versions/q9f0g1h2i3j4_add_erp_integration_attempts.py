"""add_erp_integration_attempts

Revision ID: q9f0g1h2i3j4
Revises: p8e9f0g1h2i3
Create Date: 2026-05-14 13:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "q9f0g1h2i3j4"
down_revision: Union[str, None] = "p8e9f0g1h2i3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "erp_integration_attempts",
        sa.Column("id", sa.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("package_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("case_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=False, server_default="protheus"),
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="dry_run"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="draft"),
        sa.Column(
            "request_payload_json",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=False,
        ),
        sa.Column(
            "response_payload_json",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column(
            "validation_errors_json",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("attempted_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint("provider IN ('protheus')", name="ck_erp_attempt_provider"),
        sa.CheckConstraint("mode IN ('dry_run', 'real')", name="ck_erp_attempt_mode"),
        sa.CheckConstraint(
            "status IN ('draft', 'validation_failed', 'ready', 'simulated', 'failed', 'sent')",
            name="ck_erp_attempt_status",
        ),
        sa.ForeignKeyConstraint(
            ["package_id"],
            ["admission_export_packages.id"],
            name="fk_erp_attempt_package",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["case_id"],
            ["pre_admission_cases.id"],
            name="fk_erp_attempt_case",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["candidate_id"],
            ["candidates.id"],
            name="fk_erp_attempt_candidate",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["jobs.id"],
            name="fk_erp_attempt_job",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["attempted_by"],
            ["users.id"],
            name="fk_erp_attempt_user",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_erp_integration_attempts")),
    )
    op.create_index(
        "idx_erp_attempt_package_created",
        "erp_integration_attempts",
        ["package_id", "created_at"],
    )
    op.create_index(
        "idx_erp_attempt_case_created",
        "erp_integration_attempts",
        ["case_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_erp_attempt_case_created", table_name="erp_integration_attempts")
    op.drop_index("idx_erp_attempt_package_created", table_name="erp_integration_attempts")
    op.drop_table("erp_integration_attempts")
