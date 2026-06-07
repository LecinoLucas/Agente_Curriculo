from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.infrastructure.database.base import Base

JSONB_COMPAT = JSONB().with_variant(sa.JSON(), "sqlite")


class AIKnowledgeDocumentModel(Base):
    __tablename__ = "ai_knowledge_documents"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    title: Mapped[str] = mapped_column(sa.Text, nullable=False)
    source_type: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    source_uri: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    domain: Mapped[str] = mapped_column(
        sa.String(100), nullable=False, server_default=sa.text("'general'")
    )
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default=sa.text("'{}'")
    )
    visibility: Mapped[str] = mapped_column(
        sa.String(30), nullable=False, server_default=sa.text("'internal'")
    )
    allowed_roles_json: Mapped[list[str]] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default=sa.text("'[]'")
    )
    sensitivity_level: Mapped[str] = mapped_column(
        sa.String(30), nullable=False, server_default=sa.text("'low'")
    )
    tags_json: Mapped[list[str]] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default=sa.text("'[]'")
    )
    status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default=sa.text("'active'")
    )
    reviewed_by: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    indexing_status: Mapped[str] = mapped_column(
        sa.String(30), nullable=False, server_default=sa.text("'indexed'")
    )
    last_indexed_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )
    last_index_error: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(
        sa.UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        sa.TIMESTAMP(timezone=True), nullable=True
    )

    chunks: Mapped[list[AIKnowledgeChunkModel]] = relationship(
        "AIKnowledgeChunkModel",
        back_populates="document",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "content_hash", name="uq_ai_knowledge_documents_content_hash"
        ),
        sa.Index("idx_ai_knowledge_documents_status", "status"),
        sa.Index("idx_ai_knowledge_documents_source_type", "source_type"),
        sa.Index("idx_ai_knowledge_documents_created_at", "created_at"),
    )


class AIKnowledgeChunkModel(Base):
    __tablename__ = "ai_knowledge_chunks"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    document_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("ai_knowledge_documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_index: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    token_count: Mapped[int | None] = mapped_column(sa.Integer, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default=sa.text("'{}'")
    )
    source_title: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    document: Mapped[AIKnowledgeDocumentModel] = relationship(
        "AIKnowledgeDocumentModel",
        back_populates="chunks",
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "document_id",
            "chunk_index",
            name="uq_ai_knowledge_chunks_doc_idx",
        ),
        sa.Index("idx_ai_knowledge_chunks_document_id", "document_id"),
        sa.Index("idx_ai_knowledge_chunks_content_hash", "content_hash"),
    )


class AIKnowledgeEmbeddingModel(Base):
    __tablename__ = "ai_knowledge_embeddings"

    id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sa.text("uuid_generate_v4()"),
    )
    chunk_id: Mapped[UUID] = mapped_column(
        sa.UUID(as_uuid=True),
        sa.ForeignKey("ai_knowledge_chunks.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    model: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    dimensions: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    # Fallback JSON para o vetor enquanto pgvector não é adicionado
    vector_json: Mapped[list[float]] = mapped_column(
        JSONB_COMPAT, nullable=False
    )
    content_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        sa.TIMESTAMP(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        server_default=sa.text("NOW()"),
    )

    __table_args__ = (
        sa.UniqueConstraint(
            "chunk_id",
            "provider",
            "model",
            name="uq_ai_knowledge_embeddings_chunk_prov_mod",
        ),
        sa.Index("idx_ai_knowledge_embeddings_chunk_id", "chunk_id"),
        sa.Index("idx_ai_knowledge_embeddings_prov_mod", "provider", "model"),
        sa.Index("idx_ai_knowledge_embeddings_hash", "content_hash"),
    )
