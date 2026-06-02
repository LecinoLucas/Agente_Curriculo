"""Add conversation_otp_tokens table and VERIFY_OTP state.

Revision ID: d2f8e1a3b0c5
Revises: c7e4d9f2a681
Create Date: 2026-06-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2f8e1a3b0c5"
down_revision: str | Sequence[str] | None = "c7e4d9f2a681"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_STATE_CHECK = (
    "current_state IN ("
    "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'CONFIRM_APPLICATION', 'DONE'"
    ")"
)
_OLD_STATE_CHECK = (
    "current_state IN ("
    "'IDENTIFY', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'CONFIRM_APPLICATION', 'DONE'"
    ")"
)


def _is_postgresql() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    # 1. Expand the CHECK constraint on conversation_sessions.current_state.
    #    PostgreSQL supports DROP/ADD CONSTRAINT without touching the table body.
    #    SQLite requires batch_alter_table (in-memory copy).
    if _is_postgresql():
        op.drop_constraint(
            "ck_conversation_sessions_current_state",
            "conversation_sessions",
            type_="check",
        )
        op.create_check_constraint(
            "ck_conversation_sessions_current_state",
            "conversation_sessions",
            sa.text(_NEW_STATE_CHECK),
        )
    else:
        with op.batch_alter_table("conversation_sessions") as batch_op:
            try:
                batch_op.drop_constraint(
                    "ck_conversation_sessions_current_state",
                    type_="check",
                )
            except Exception:
                pass
            batch_op.create_check_constraint(
                "ck_conversation_sessions_current_state",
                sa.text(_NEW_STATE_CHECK),
            )

    # 2. Create the OTP table.
    op.create_table(
        "conversation_otp_tokens",
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
        sa.Column("identifier_type", sa.String(20), nullable=False),
        sa.Column("otp_hash", sa.String(128), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("attempts", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.SmallInteger, nullable=False, server_default="5"),
        sa.Column("consumed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint(
            "identifier_type IN ('cpf', 'whatsapp')",
            name="ck_conversation_otp_tokens_identifier_type",
        ),
    )
    op.create_index(
        "ix_conversation_otp_tokens_session_id",
        "conversation_otp_tokens",
        ["session_id"],
    )
    op.create_index(
        "ix_conversation_otp_tokens_expires_at",
        "conversation_otp_tokens",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_conversation_otp_tokens_expires_at", table_name="conversation_otp_tokens")
    op.drop_index("ix_conversation_otp_tokens_session_id", table_name="conversation_otp_tokens")
    op.drop_table("conversation_otp_tokens")

    if _is_postgresql():
        op.drop_constraint(
            "ck_conversation_sessions_current_state",
            "conversation_sessions",
            type_="check",
        )
        op.create_check_constraint(
            "ck_conversation_sessions_current_state",
            "conversation_sessions",
            sa.text(_OLD_STATE_CHECK),
        )
    else:
        with op.batch_alter_table("conversation_sessions") as batch_op:
            try:
                batch_op.drop_constraint(
                    "ck_conversation_sessions_current_state",
                    type_="check",
                )
            except Exception:
                pass
            batch_op.create_check_constraint(
                "ck_conversation_sessions_current_state",
                sa.text(_OLD_STATE_CHECK),
            )
