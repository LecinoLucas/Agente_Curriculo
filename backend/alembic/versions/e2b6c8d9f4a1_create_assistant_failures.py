"""Create assistant_failures table.

Revision ID: e2b6c8d9f4a1
Revises: f3a1c7e5d2b9
Create Date: 2026-06-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e2b6c8d9f4a1"
down_revision: str | Sequence[str] | None = "f3a1c7e5d2b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_failures",
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
            "message_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("conversation_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "candidate_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("candidates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "application_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("candidate_applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("state", sa.String(50), nullable=False),
        sa.Column("raw_message", sa.Text(), nullable=False),
        sa.Column("sanitized_message", sa.Text(), nullable=False),
        sa.Column("reason", sa.String(100), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="open"),
        sa.Column("classification", sa.String(30), nullable=True),
        sa.Column("attempts_count", sa.Integer(), nullable=True),
        sa.Column(
            "reviewed_by",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'reviewed', 'resolved', 'ignored')",
            name="ck_assistant_failures_status",
        ),
        sa.CheckConstraint(
            "classification IS NULL OR classification IN ("
            "'location', 'unit', 'function', 'shift', 'identity', "
            "'spam', 'talk_to_hr', 'other'"
            ")",
            name="ck_assistant_failures_classification",
        ),
        sa.CheckConstraint(
            "attempts_count IS NULL OR attempts_count >= 0",
            name="ck_assistant_failures_attempts_count",
        ),
    )
    op.create_index("ix_assistant_failures_session_id", "assistant_failures", ["session_id"])
    op.create_index("ix_assistant_failures_message_id", "assistant_failures", ["message_id"])
    op.create_index("ix_assistant_failures_candidate_id", "assistant_failures", ["candidate_id"])
    op.create_index(
        "ix_assistant_failures_application_id",
        "assistant_failures",
        ["application_id"],
    )
    op.create_index("ix_assistant_failures_status", "assistant_failures", ["status"])
    op.create_index("ix_assistant_failures_reason", "assistant_failures", ["reason"])
    op.create_index(
        "ix_assistant_failures_classification",
        "assistant_failures",
        ["classification"],
    )
    op.create_index("ix_assistant_failures_state", "assistant_failures", ["state"])
    op.create_index("ix_assistant_failures_created_at", "assistant_failures", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_assistant_failures_created_at", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_state", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_classification", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_reason", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_status", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_application_id", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_candidate_id", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_message_id", table_name="assistant_failures")
    op.drop_index("ix_assistant_failures_session_id", table_name="assistant_failures")
    op.drop_table("assistant_failures")
