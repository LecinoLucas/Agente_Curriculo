"""drop_skill_alias_and_equivalence_tables

Revision ID: 4b6f1d2a9c03
Revises: 3aaed91ac089
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "4b6f1d2a9c03"
down_revision: Union[str, Sequence[str], None] = "3aaed91ac089"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())
    if "skill_equivalence" in existing_tables:
        op.drop_table("skill_equivalence")
    if "skill_alias" in existing_tables:
        op.drop_table("skill_alias")


def downgrade() -> None:
    pass
