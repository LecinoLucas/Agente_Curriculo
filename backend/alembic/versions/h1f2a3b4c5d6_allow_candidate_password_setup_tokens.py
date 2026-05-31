"""Allow candidate password setup tokens.

Revision ID: h1f2a3b4c5d6
Revises: g4e2b9d7c1a3
Create Date: 2026-05-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "h1f2a3b4c5d6"
down_revision = "g4e2b9d7c1a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_candidate_auth_tokens_purpose",
        "candidate_auth_tokens",
        type_="check",
    )
    op.create_check_constraint(
        "ck_candidate_auth_tokens_purpose",
        "candidate_auth_tokens",
        sa.text("purpose IN ('login_code', 'portal_session', 'password_setup')"),
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_candidate_auth_tokens_purpose",
        "candidate_auth_tokens",
        type_="check",
    )
    op.create_check_constraint(
        "ck_candidate_auth_tokens_purpose",
        "candidate_auth_tokens",
        sa.text("purpose IN ('login_code', 'portal_session')"),
    )
