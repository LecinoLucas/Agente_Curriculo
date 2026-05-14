"""expand_erp_attempts_for_mock_adapter

Revision ID: r1a2b3c4d5e6
Revises: q9f0g1h2i3j4
Create Date: 2026-05-14 14:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "r1a2b3c4d5e6"
down_revision: Union[str, None] = "q9f0g1h2i3j4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "erp_integration_attempts",
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "erp_integration_attempts",
        sa.Column("external_reference", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "erp_integration_attempts",
        sa.Column("http_status", sa.Integer(), nullable=True),
    )
    op.add_column(
        "erp_integration_attempts",
        sa.Column(
            "request_headers_json",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
    )
    op.add_column(
        "erp_integration_attempts",
        sa.Column(
            "response_headers_json",
            postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"),
            nullable=True,
        ),
    )
    op.add_column(
        "erp_integration_attempts",
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
    )

    op.drop_constraint("ck_erp_attempt_mode", "erp_integration_attempts", type_="check")
    op.create_check_constraint(
        "ck_erp_attempt_mode",
        "erp_integration_attempts",
        "mode IN ('dry_run', 'mock', 'real')",
    )

    op.create_index(
        "idx_erp_attempt_idempotency_key",
        "erp_integration_attempts",
        ["idempotency_key"],
    )
    op.create_unique_constraint(
        "uq_erp_attempt_provider_mode_package_idempotency_attempt",
        "erp_integration_attempts",
        ["provider", "mode", "package_id", "idempotency_key", "attempt_number"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_erp_attempt_provider_mode_package_idempotency_attempt",
        "erp_integration_attempts",
        type_="unique",
    )
    op.drop_index("idx_erp_attempt_idempotency_key", table_name="erp_integration_attempts")

    op.drop_constraint("ck_erp_attempt_mode", "erp_integration_attempts", type_="check")
    op.create_check_constraint(
        "ck_erp_attempt_mode",
        "erp_integration_attempts",
        "mode IN ('dry_run', 'real')",
    )

    op.drop_column("erp_integration_attempts", "attempt_number")
    op.drop_column("erp_integration_attempts", "response_headers_json")
    op.drop_column("erp_integration_attempts", "request_headers_json")
    op.drop_column("erp_integration_attempts", "http_status")
    op.drop_column("erp_integration_attempts", "external_reference")
    op.drop_column("erp_integration_attempts", "idempotency_key")
