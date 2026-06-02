"""Backfill candidate CPF hash identity fields.

Revision ID: c7e4d9f2a681
Revises: 6b3c9d0e1f42
Create Date: 2026-06-02 00:00:00.000000
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from hashlib import sha256

import sqlalchemy as sa

from alembic import op

revision: str = "c7e4d9f2a681"
down_revision: str | Sequence[str] | None = "6b3c9d0e1f42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _digits(cpf: str | None) -> str | None:
    if cpf is None:
        return None
    value = re.sub(r"\D", "", cpf)
    return value if len(value) == 11 else None


def _backfill_sqlite() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, cpf
            FROM candidates
            WHERE cpf IS NOT NULL
              AND (cpf_hash IS NULL OR cpf_last4 IS NULL)
            """
        )
    ).mappings()
    for row in rows:
        digits = _digits(row["cpf"])
        if digits is None:
            continue
        connection.execute(
            sa.text(
                """
                UPDATE candidates
                SET cpf_hash = :cpf_hash,
                    cpf_last4 = :cpf_last4
                WHERE id = :id
                """
            ),
            {
                "id": row["id"],
                "cpf_hash": sha256(digits.encode("utf-8")).hexdigest(),
                "cpf_last4": digits[-4:],
            },
        )


def _clear_sqlite() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            """
            SELECT id, cpf, cpf_hash
            FROM candidates
            WHERE cpf_hash IS NOT NULL OR cpf_last4 IS NOT NULL
            """
        )
    ).mappings()
    for row in rows:
        digits = _digits(row["cpf"])
        if digits is None:
            continue
        expected_hash = sha256(digits.encode("utf-8")).hexdigest()
        if row["cpf_hash"] != expected_hash:
            continue
        connection.execute(
            sa.text(
                """
                UPDATE candidates
                SET cpf_hash = NULL,
                    cpf_last4 = NULL
                WHERE id = :id
                """
            ),
            {"id": row["id"]},
        )


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        _backfill_sqlite()
        return

    op.execute(
        """
        UPDATE candidates
        SET cpf_hash = encode(
                digest(regexp_replace(cpf, '\\D', '', 'g'), 'sha256'),
                'hex'
            ),
            cpf_last4 = right(regexp_replace(cpf, '\\D', '', 'g'), 4)
        WHERE cpf IS NOT NULL
          AND length(regexp_replace(cpf, '\\D', '', 'g')) = 11
          AND (cpf_hash IS NULL OR cpf_last4 IS NULL)
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        _clear_sqlite()
        return

    op.execute(
        """
        UPDATE candidates
        SET cpf_hash = NULL,
            cpf_last4 = NULL
        WHERE cpf IS NOT NULL
          AND length(regexp_replace(cpf, '\\D', '', 'g')) = 11
          AND cpf_hash = encode(
                digest(regexp_replace(cpf, '\\D', '', 'g'), 'sha256'),
                'hex'
            )
        """
    )
