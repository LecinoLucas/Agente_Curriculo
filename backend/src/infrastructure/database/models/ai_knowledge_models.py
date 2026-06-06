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
    content: Mapped[str] = mapped_column(sa.Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(
        JSONB_COMPAT, nullable=False, server_default=sa.text("'{}'")
    )
    status: Mapped[str] = mapped_column(
        sa.String(20), nullable=False, server_default=sa.text("'active'")
    )
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
