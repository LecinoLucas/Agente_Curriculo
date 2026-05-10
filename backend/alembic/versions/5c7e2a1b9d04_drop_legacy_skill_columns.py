"""drop_legacy_skill_columns

Revision ID: 5c7e2a1b9d04
Revises: 4b6f1d2a9c03
Create Date: 2026-05-09 00:10:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "5c7e2a1b9d04"
down_revision: Union[str, Sequence[str], None] = "4b6f1d2a9c03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_tables = set(inspector.get_table_names())
    for table_name in (
        "skill_alias",
        "skill_equivalence",
        "resume_job_matches",
        "candidate_job_pipeline_migration_conflicts",
        "idempotency_schema_sanitation_log",
        "audit_logs_default",
    ):
        if table_name in existing_tables:
            op.drop_table(table_name)

    if "skills" not in existing_tables:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("skills")}
    for column_name in ("aliases", "category", "is_verified"):
        if column_name in existing_columns:
            op.drop_column("skills", column_name)


def downgrade() -> None:
    pass
