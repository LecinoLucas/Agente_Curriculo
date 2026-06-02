"""Add lead collection states to conversation_sessions.current_state CHECK.

OP-6F.5: COLLECT_LEAD_NAME, COLLECT_LEAD_WHATSAPP, COLLECT_LGPD_CONSENT are new
transient states used to gather minimum lead data before creating a Candidate.
The CHECK constraint must be expanded before the service can write these values.

Migration only touches the CHECK constraint — no table or column changes.
SQLite does not support ALTER CONSTRAINT; the constraint is Python-enforced there.

Revision ID: i5g3h2j1k0l9
Revises: f4c8a9b2d1e0
Create Date: 2026-06-02
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "i5g3h2j1k0l9"
down_revision: str | Sequence[str] | None = "f4c8a9b2d1e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "conversation_sessions"
_CONSTRAINT = "ck_conversation_sessions_current_state"

_OLD_CHECK = (
    "current_state IN ("
    "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'CONFIRM_APPLICATION', 'DONE'"
    ")"
)

_NEW_CHECK = (
    "current_state IN ("
    "'IDENTIFY', 'VERIFY_OTP', 'CHOOSE_LOCATION', "
    "'CHOOSE_UNIT_OR_ANY', 'CHOOSE_FUNCTION', 'CHOOSE_SHIFT', 'SHOW_JOBS', "
    "'COLLECT_RESUME', 'COLLECT_LEAD_NAME', 'COLLECT_LEAD_WHATSAPP', "
    "'COLLECT_LGPD_CONSENT', 'CONFIRM_APPLICATION', 'DONE'"
    ")"
)


def upgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        return  # SQLite cannot ALTER constraints; Python-side validation covers this.
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, _NEW_CHECK)


def downgrade() -> None:
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        return
    op.drop_constraint(_CONSTRAINT, _TABLE, type_="check")
    op.create_check_constraint(_CONSTRAINT, _TABLE, _OLD_CHECK)
