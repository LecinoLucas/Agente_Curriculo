"""enable pgvector extension

Revision ID: 23dbb452c78a
Revises: 399c41dd0e2c
"""

from typing import Sequence, Union

revision: str = "23dbb452c78a"
down_revision: Union[str, None] = "399c41dd0e2c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op.

    pgvector is optional in this phase. Some local/cloud Postgres
    environments do not allow CREATE EXTENSION from the application
    migration user. The application detects pgvector availability at
    runtime and falls back to json_fallback when it is unavailable.

    To enable pgvector manually, run as a DB admin:

        CREATE EXTENSION IF NOT EXISTS vector;
    """
    pass


def downgrade() -> None:
    """No-op.

    Do not drop the vector extension automatically. It may be shared by
    other schemas/apps in the same database.
    """
    pass
