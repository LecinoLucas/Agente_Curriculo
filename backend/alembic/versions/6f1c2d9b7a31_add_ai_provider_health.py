"""add_ai_provider_health

Revision ID: 6f1c2d9b7a31
Revises: dad2597b8478
Create Date: 2026-05-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6f1c2d9b7a31"
down_revision: Union[str, None] = "dad2597b8478"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_provider_health",
        sa.Column("id", sa.UUID(), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("provider", sa.String(length=100), nullable=False),
        sa.Column("model_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="available", nullable=False),
        sa.Column("configured_key_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("available_key_count", sa.Integer(), nullable=True),
        sa.Column("cooldown_until", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_error_type", sa.String(length=100), nullable=True),
        sa.Column("last_status_code", sa.Integer(), nullable=True),
        sa.Column("last_error_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("consecutive_rate_limit_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_admin_notification_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('available', 'degraded', 'rate_limited', 'unavailable')",
            name="ck_ai_provider_health_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "model_id", name="uq_ai_provider_health_provider_model"),
    )
    op.create_index("idx_ai_provider_health_status", "ai_provider_health", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_ai_provider_health_status", table_name="ai_provider_health")
    op.drop_table("ai_provider_health")
