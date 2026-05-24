"""add_ai_provider_credentials

Revision ID: 98d7c1a4b2e9
Revises: 6f1c2d9b7a31
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "98d7c1a4b2e9"
down_revision: Union[str, None] = "6f1c2d9b7a31"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_provider_credentials",
        sa.Column("id", sa.UUID(), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("provider", sa.String(length=100), nullable=False),
        sa.Column("model_id", sa.String(length=255), nullable=True),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
        sa.Column("key_last4", sa.String(length=4), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("priority", sa.Integer(), server_default="100", nullable=False),
        sa.Column("cooldown_until", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_error_type", sa.String(length=100), nullable=True),
        sa.Column("consecutive_rate_limit_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("disabled_by_user_id", sa.UUID(), nullable=True),
        sa.Column("disabled_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'rate_limited', 'invalid')",
            name="ck_ai_provider_credentials_status",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["disabled_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "label", name="uq_ai_provider_credentials_provider_label"),
    )
    op.create_index(
        "idx_ai_provider_credentials_provider_model_status",
        "ai_provider_credentials",
        ["provider", "model_id", "status"],
        unique=False,
    )
    op.create_index(
        "idx_ai_provider_credentials_cooldown_until",
        "ai_provider_credentials",
        ["cooldown_until"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_ai_provider_credentials_cooldown_until", table_name="ai_provider_credentials")
    op.drop_index("idx_ai_provider_credentials_provider_model_status", table_name="ai_provider_credentials")
    op.drop_table("ai_provider_credentials")
