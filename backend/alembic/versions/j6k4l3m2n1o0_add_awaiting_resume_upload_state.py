"""Add awaiting resume upload state to conversation_sessions.current_state CHECK.

The conversation service moves COLLECT_RESUME to AWAITING_RESUME_UPLOAD while the
Portal 2 upload component sends the resume_uploaded event. PostgreSQL must accept
that transient state before the service can persist the session.

Revision ID: j6k4l3m2n1o0
Revises: i5g3h2j1k0l9
Create Date: 2026-06-02
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "j6k4l3m2n1o0"
down_revision: str | Sequence[str] | None = "i5g3h2j1k0l9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "conversation_sessions"
_CONSTRAINT = "ck_conversation_sessions_current_state"

_OLD_CHECK = (
    "current_state IN ("
    "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'COLLECT_LEAD_NAME', 'COLLECT_LEAD_WHATSAPP', "
    "'COLLECT_LGPD_CONSENT', 'CONFIRM_APPLICATION', 'DONE'"
    ")"
)

_NEW_CHECK = (
    "current_state IN ("
    "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'AWAITING_RESUME_UPLOAD', 'COLLECT_LEAD_NAME', "
    "'COLLECT_LEAD_WHATSAPP', 'COLLECT_LGPD_CONSENT', 'CONFIRM_APPLICATION', "
    "'DONE'"
    ")"
)


def upgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        return
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, _NEW_CHECK)


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        return
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, _OLD_CHECK)
