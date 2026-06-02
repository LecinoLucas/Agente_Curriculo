"""Align conversation engine with Portal 2 contract.

Revision ID: 6b3c9d0e1f42
Revises: 1d6e8f2a4b90
Create Date: 2026-06-02 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "6b3c9d0e1f42"
down_revision: str | Sequence[str] | None = "1d6e8f2a4b90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_conversation_sessions_current_state",
        "conversation_sessions",
        type_="check",
    )
    op.drop_constraint(
        "ck_conversation_sessions_status",
        "conversation_sessions",
        type_="check",
    )
    op.execute(
        """
        UPDATE conversation_sessions
        SET current_state = CASE
            WHEN current_state IN ('START', 'RESUME_OR_NEW', 'COLLECT_BASIC_DATA')
                THEN 'CHOOSE_LOCATION'
            WHEN current_state IN ('SUBMITTED', 'FOLLOW_UP')
                THEN 'DONE'
            ELSE current_state
        END
        """
    )
    op.execute(
        """
        UPDATE conversation_sessions
        SET status = 'abandoned'
        WHERE status = 'expired'
        """
    )
    op.alter_column(
        "conversation_sessions",
        "current_state",
        server_default="IDENTIFY",
        existing_type=sa.String(length=50),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_conversation_sessions_current_state",
        "conversation_sessions",
        "current_state IN ("
        "'IDENTIFY', 'CHOOSE_LOCATION', 'CHOOSE_UNIT_OR_ANY', "
        "'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
        "'COLLECT_RESUME', 'CONFIRM_APPLICATION', 'DONE'"
        ")",
    )
    op.create_check_constraint(
        "ck_conversation_sessions_status",
        "conversation_sessions",
        "status IN ('active', 'completed', 'abandoned', 'cancelled')",
    )

    op.drop_constraint(
        "ck_conversation_messages_direction",
        "conversation_messages",
        type_="check",
    )
    op.add_column(
        "conversation_messages",
        sa.Column("role", sa.String(length=20), nullable=True),
    )
    op.execute(
        """
        UPDATE conversation_messages
        SET role = CASE
            WHEN direction = 'inbound' THEN 'candidate'
            WHEN direction = 'outbound' THEN 'assistant'
            ELSE 'system'
        END
        """
    )
    op.alter_column(
        "conversation_messages",
        "role",
        nullable=False,
        existing_type=sa.String(length=20),
    )
    op.drop_column("conversation_messages", "direction")
    op.create_check_constraint(
        "ck_conversation_messages_role",
        "conversation_messages",
        "role IN ('candidate', 'assistant', 'system')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_conversation_messages_role",
        "conversation_messages",
        type_="check",
    )
    op.add_column(
        "conversation_messages",
        sa.Column("direction", sa.String(length=20), nullable=True),
    )
    op.execute(
        """
        UPDATE conversation_messages
        SET direction = CASE
            WHEN role = 'candidate' THEN 'inbound'
            WHEN role = 'assistant' THEN 'outbound'
            ELSE 'system'
        END
        """
    )
    op.alter_column(
        "conversation_messages",
        "direction",
        nullable=False,
        existing_type=sa.String(length=20),
    )
    op.drop_column("conversation_messages", "role")
    op.create_check_constraint(
        "ck_conversation_messages_direction",
        "conversation_messages",
        "direction IN ('inbound', 'outbound', 'system')",
    )

    op.drop_constraint(
        "ck_conversation_sessions_current_state",
        "conversation_sessions",
        type_="check",
    )
    op.drop_constraint(
        "ck_conversation_sessions_status",
        "conversation_sessions",
        type_="check",
    )
    op.execute(
        """
        UPDATE conversation_sessions
        SET current_state = CASE
            WHEN current_state = 'DONE' THEN 'SUBMITTED'
            ELSE current_state
        END
        """
    )
    op.alter_column(
        "conversation_sessions",
        "current_state",
        server_default="START",
        existing_type=sa.String(length=50),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_conversation_sessions_current_state",
        "conversation_sessions",
        "current_state IN ("
        "'START', 'IDENTIFY', 'RESUME_OR_NEW', 'CHOOSE_LOCATION', "
        "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
        "'COLLECT_BASIC_DATA', 'COLLECT_RESUME', 'CONFIRM_APPLICATION', "
        "'SUBMITTED', 'FOLLOW_UP'"
        ")",
    )
    op.create_check_constraint(
        "ck_conversation_sessions_status",
        "conversation_sessions",
        "status IN ('active', 'completed', 'abandoned', 'expired')",
    )
