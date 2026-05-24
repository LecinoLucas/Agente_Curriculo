"""harden_ai_provider_credentials_indexes

Revision ID: 3c9a7f5d2e11
Revises: 98d7c1a4b2e9
Create Date: 2026-05-24 20:20:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "3c9a7f5d2e11"
down_revision: Union[str, None] = "98d7c1a4b2e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_ai_provider_credentials_status_cooldown",
        "ai_provider_credentials",
        ["status", "cooldown_until"],
        unique=False,
    )
    op.create_index(
        "idx_ai_provider_credentials_provider_model_priority",
        "ai_provider_credentials",
        ["provider", "model_id", "priority"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_ai_provider_credentials_provider_model_priority", table_name="ai_provider_credentials")
    op.drop_index("idx_ai_provider_credentials_status_cooldown", table_name="ai_provider_credentials")
