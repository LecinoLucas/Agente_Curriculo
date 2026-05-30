"""add job AI draft fields (mandatory_skills, nice_to_have_skills, screening_questions, benefits, working_hours)

Revision ID: g4e2b9d7c1a3
Revises: a91b3e7c4d52, f3d1a8c9b2e4
Create Date: 2026-05-29 22:00:00.000000

"""
from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
# Merges the two pre-existing heads of the project before adding the new columns.
revision: str = "g4e2b9d7c1a3"
down_revision: tuple[str, ...] = ("a91b3e7c4d52", "f3d1a8c9b2e4")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    """Add dedicated columns for AI-generated job draft fields.

    These columns store data that previously had no dedicated home:
      - mandatory_skills    : list of obligatory skill names (text)
      - nice_to_have_skills : list of optional/desired skill names (text)
      - screening_questions : list of screening questions (text)
      - benefits            : list of benefit descriptions (text)
      - working_hours       : free-text shift/schedule (e.g. "6x1", "12x36")

    All list columns default to empty list; working_hours is nullable.
    Compatible with old payloads — backend defaults treat missing fields as empty/null.
    """
    op.add_column(
        "jobs",
        sa.Column(
            "mandatory_skills",
            JSONB_COMPAT,
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "nice_to_have_skills",
            JSONB_COMPAT,
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "screening_questions",
            JSONB_COMPAT,
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "benefits",
            JSONB_COMPAT,
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "working_hours",
            sa.String(length=200),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "working_hours")
    op.drop_column("jobs", "benefits")
    op.drop_column("jobs", "screening_questions")
    op.drop_column("jobs", "nice_to_have_skills")
    op.drop_column("jobs", "mandatory_skills")
