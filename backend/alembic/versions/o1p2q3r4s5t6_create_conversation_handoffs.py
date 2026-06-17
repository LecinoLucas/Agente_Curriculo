"""Create conversation_handoffs table for bot-to-HR handoff tracking.

When a candidate expresses intent 'talk_to_hr' during a bot session, a record
is created here so the HR team can identify sessions awaiting human attention.

Revision ID: o1p2q3r4s5t6
Revises: n1o2p3q4r5s6
Create Date: 2026-06-17
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "o1p2q3r4s5t6"
down_revision: str | Sequence[str] | None = "n1o2p3q4r5s6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversation_handoffs",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "session_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("conversation_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "candidate_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("candidates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "requested_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "assigned_to_user_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "metadata_json",
            sa.JSON(),
            nullable=True,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'assigned', 'resolved', 'cancelled')",
            name="ck_conversation_handoffs_status",
        ),
    )
    op.create_index(
        "ix_conversation_handoffs_session_id", "conversation_handoffs", ["session_id"]
    )
    op.create_index(
        "ix_conversation_handoffs_status", "conversation_handoffs", ["status"]
    )
    op.create_index(
        "ix_conversation_handoffs_candidate_id",
        "conversation_handoffs",
        ["candidate_id"],
    )
    op.create_index(
        "ix_conversation_handoffs_requested_at",
        "conversation_handoffs",
        ["requested_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversation_handoffs_requested_at", "conversation_handoffs")
    op.drop_index("ix_conversation_handoffs_candidate_id", "conversation_handoffs")
    op.drop_index("ix_conversation_handoffs_status", "conversation_handoffs")
    op.drop_index("ix_conversation_handoffs_session_id", "conversation_handoffs")
    op.drop_table("conversation_handoffs")
