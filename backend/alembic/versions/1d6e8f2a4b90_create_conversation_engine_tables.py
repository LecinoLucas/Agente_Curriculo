"""Create conversation engine tables.

Revision ID: 1d6e8f2a4b90
Revises: 8c2d4e6f0a13
Create Date: 2026-06-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "1d6e8f2a4b90"
down_revision: str | Sequence[str] | None = "8c2d4e6f0a13"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONB_COMPAT = postgresql.JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "conversation_sessions",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("candidate_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("application_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("channel", sa.String(length=30), server_default="web", nullable=False),
        sa.Column("current_state", sa.String(length=50), server_default="START", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("context_json", JSONB_COMPAT, server_default=sa.text("'{}'"), nullable=False),
        sa.Column(
            "last_message_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.CheckConstraint(
            "channel IN ('web', 'whatsapp')",
            name="ck_conversation_sessions_channel",
        ),
        sa.CheckConstraint(
            "current_state IN ("
            "'START', 'IDENTIFY', 'RESUME_OR_NEW', 'CHOOSE_LOCATION', "
            "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
            "'COLLECT_BASIC_DATA', 'COLLECT_RESUME', 'CONFIRM_APPLICATION', "
            "'SUBMITTED', 'FOLLOW_UP'"
            ")",
            name="ck_conversation_sessions_current_state",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'completed', 'abandoned', 'expired')",
            name="ck_conversation_sessions_status",
        ),
        sa.ForeignKeyConstraint(["candidate_id"], ["candidates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["application_id"],
            ["candidate_applications.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_sessions_candidate_id",
        "conversation_sessions",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        "ix_conversation_sessions_application_id",
        "conversation_sessions",
        ["application_id"],
        unique=False,
    )
    op.create_index(
        "ix_conversation_sessions_status",
        "conversation_sessions",
        ["status"],
        unique=False,
    )
    op.create_index(
        "ix_conversation_sessions_current_state",
        "conversation_sessions",
        ["current_state"],
        unique=False,
    )
    op.create_index(
        "ix_conversation_sessions_last_message_at",
        "conversation_sessions",
        ["last_message_at"],
        unique=False,
    )

    op.create_table(
        "conversation_messages",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column("session_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("message_type", sa.String(length=30), server_default="text", nullable=False),
        sa.Column("interpreted_intent", sa.String(length=100), nullable=True),
        sa.Column("metadata_json", JSONB_COMPAT, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "direction IN ('inbound', 'outbound', 'system')",
            name="ck_conversation_messages_direction",
        ),
        sa.CheckConstraint(
            "message_type IN ('text', 'quick_reply', 'system')",
            name="ck_conversation_messages_message_type",
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["conversation_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversation_messages_session_id",
        "conversation_messages",
        ["session_id"],
        unique=False,
    )
    op.create_index(
        "ix_conversation_messages_created_at",
        "conversation_messages",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_conversation_messages_created_at", table_name="conversation_messages")
    op.drop_index("ix_conversation_messages_session_id", table_name="conversation_messages")
    op.drop_table("conversation_messages")

    op.drop_index("ix_conversation_sessions_last_message_at", table_name="conversation_sessions")
    op.drop_index("ix_conversation_sessions_current_state", table_name="conversation_sessions")
    op.drop_index("ix_conversation_sessions_status", table_name="conversation_sessions")
    op.drop_index("ix_conversation_sessions_application_id", table_name="conversation_sessions")
    op.drop_index("ix_conversation_sessions_candidate_id", table_name="conversation_sessions")
    op.drop_table("conversation_sessions")
