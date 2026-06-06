"""add_ai_knowledge_embeddings

Revision ID: 399c41dd0e2c
Revises: k2l1m0n9o8p7
Create Date: 2026-06-06 14:06:38.341383

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '399c41dd0e2c'
down_revision: Union[str, None] = 'k2l1m0n9o8p7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_knowledge_embeddings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("chunk_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False),
        sa.Column(
            "vector_json",
            sa.JSON().with_variant(postgresql.JSONB(), "postgresql"),
            nullable=False,
        ),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["chunk_id"], ["ai_knowledge_chunks.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "chunk_id",
            "provider",
            "model",
            name="uq_ai_knowledge_embeddings_chunk_prov_mod",
        ),
    )
    op.create_index(
        "idx_ai_knowledge_embeddings_chunk_id",
        "ai_knowledge_embeddings",
        ["chunk_id"],
        unique=False,
    )
    op.create_index(
        "idx_ai_knowledge_embeddings_prov_mod",
        "ai_knowledge_embeddings",
        ["provider", "model"],
        unique=False,
    )
    op.create_index(
        "idx_ai_knowledge_embeddings_hash",
        "ai_knowledge_embeddings",
        ["content_hash"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("ai_knowledge_embeddings")
