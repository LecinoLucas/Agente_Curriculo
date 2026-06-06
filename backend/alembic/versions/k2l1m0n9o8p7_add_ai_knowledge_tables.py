"""Add AI knowledge base tables for RAG persistence.

Creates ai_knowledge_documents and ai_knowledge_chunks tables.
No embeddings or vector columns in this migration (AI-RAG-2).
Vector/pgvector tables are planned for AI-RAG-1b → AI-RAG-3.

Revision ID: k2l1m0n9o8p7
Revises: j6k4l3m2n1o0
Create Date: 2026-06-06
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "k2l1m0n9o8p7"
down_revision: str | Sequence[str] | None = "j6k4l3m2n1o0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


def upgrade() -> None:
    op.create_table(
        "ai_knowledge_documents",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("source_type", sa.String(100), nullable=False),
        sa.Column("source_uri", sa.Text, nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column(
            "metadata_json",
            JSONB_COMPAT,
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column("created_by", sa.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("archived_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "content_hash", name="uq_ai_knowledge_documents_content_hash"
        ),
    )
    op.create_index(
        "idx_ai_knowledge_documents_status",
        "ai_knowledge_documents",
        ["status"],
    )
    op.create_index(
        "idx_ai_knowledge_documents_source_type",
        "ai_knowledge_documents",
        ["source_type"],
    )
    op.create_index(
        "idx_ai_knowledge_documents_created_at",
        "ai_knowledge_documents",
        ["created_at"],
    )

    op.create_table(
        "ai_knowledge_chunks",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column(
            "document_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("ai_knowledge_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column(
            "metadata_json",
            JSONB_COMPAT,
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("source_title", sa.Text, nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.UniqueConstraint(
            "document_id",
            "chunk_index",
            name="uq_ai_knowledge_chunks_doc_idx",
        ),
    )
    op.create_index(
        "idx_ai_knowledge_chunks_document_id",
        "ai_knowledge_chunks",
        ["document_id"],
    )
    op.create_index(
        "idx_ai_knowledge_chunks_content_hash",
        "ai_knowledge_chunks",
        ["content_hash"],
    )


def downgrade() -> None:
    op.drop_index("idx_ai_knowledge_chunks_content_hash", "ai_knowledge_chunks")
    op.drop_index("idx_ai_knowledge_chunks_document_id", "ai_knowledge_chunks")
    op.drop_table("ai_knowledge_chunks")

    op.drop_index("idx_ai_knowledge_documents_created_at", "ai_knowledge_documents")
    op.drop_index("idx_ai_knowledge_documents_source_type", "ai_knowledge_documents")
    op.drop_index("idx_ai_knowledge_documents_status", "ai_knowledge_documents")
    op.drop_table("ai_knowledge_documents")
