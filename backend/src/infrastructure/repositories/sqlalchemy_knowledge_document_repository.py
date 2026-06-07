"""Postgres implementation of KnowledgeDocumentRepositoryContract.

Persists KnowledgeDocument to ai_knowledge_documents via SQLAlchemy async session.
No LLM, no embeddings, no provider external calls.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.document_repository_contract import (
    DocumentFilter,
    KnowledgeDocumentRepositoryContract,
)
from src.ai_orchestration.rag.schemas import KnowledgeDocument
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeDocumentModel,
)


def _compute_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _to_domain(row: AIKnowledgeDocumentModel) -> KnowledgeDocument:
    metadata = dict(row.metadata_json or {})
    metadata.setdefault("source_uri", row.source_uri)
    metadata.setdefault("domain", row.domain)
    metadata.setdefault("visibility", row.visibility)
    metadata.setdefault("allowed_roles", list(row.allowed_roles_json or []))
    metadata.setdefault("sensitivity_level", row.sensitivity_level)
    metadata.setdefault("tags", list(row.tags_json or []))
    metadata.setdefault("status", "published" if row.status == "active" else row.status)
    metadata.setdefault("reviewed_by", row.reviewed_by)
    metadata.setdefault("reviewed_at", row.reviewed_at.isoformat() if row.reviewed_at else None)
    metadata.setdefault("indexing_status", row.indexing_status)
    metadata.setdefault("last_indexed_at", row.last_indexed_at.isoformat() if row.last_indexed_at else None)
    metadata.setdefault("last_index_error", row.last_index_error)
    return KnowledgeDocument(
        id=str(row.id),
        title=row.title,
        source_type=row.source_type,
        content=row.content,
        metadata=metadata,
        created_at=row.created_at,
    )


class SQLAlchemyKnowledgeDocumentRepository(KnowledgeDocumentRepositoryContract):
    """Postgres-backed repository for KnowledgeDocument.

    Receives AsyncSession explicitly — no FastAPI dependency, no LLM.
    Arquivamento é soft-delete via status='archived' + archived_at.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create_document(self, document: KnowledgeDocument) -> KnowledgeDocument:
        content_hash = _compute_hash(document.content)
        now = datetime.now(UTC)
        row = AIKnowledgeDocumentModel(
            id=UUID(document.id) if _is_valid_uuid(document.id) else uuid4(),
            title=document.title,
            source_type=document.source_type,
            source_uri=document.metadata.get("source_uri"),
            domain=document.metadata.get("domain") or "general",
            content=document.content,
            content_hash=content_hash,
            metadata_json=dict(document.metadata),
            visibility=document.metadata.get("visibility") or "internal",
            allowed_roles_json=list(document.metadata.get("allowed_roles") or []),
            sensitivity_level=document.metadata.get("sensitivity_level") or "low",
            tags_json=list(document.metadata.get("tags") or []),
            status=document.metadata.get("status") or "published",
            reviewed_by=document.metadata.get("reviewed_by"),
            reviewed_at=_parse_datetime(document.metadata.get("reviewed_at")),
            indexing_status=document.metadata.get("indexing_status") or "indexed",
            last_indexed_at=_parse_datetime(document.metadata.get("last_indexed_at")) or now,
            last_index_error=document.metadata.get("last_index_error"),
            created_at=now,
            updated_at=now,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return _to_domain(row)

    async def get_document(self, document_id: str) -> KnowledgeDocument | None:
        try:
            uid = UUID(document_id)
        except (ValueError, AttributeError):
            return None
        stmt = sa.select(AIKnowledgeDocumentModel).where(
            AIKnowledgeDocumentModel.id == uid
        )
        row = await self._session.scalar(stmt)
        return _to_domain(row) if row is not None else None

    async def list_documents(
        self, filters: DocumentFilter | None = None
    ) -> list[KnowledgeDocument]:
        stmt = sa.select(AIKnowledgeDocumentModel)

        if filters:
            if filters.source_type:
                stmt = stmt.where(
                    AIKnowledgeDocumentModel.source_type == filters.source_type
                )
            if filters.status:
                stmt = stmt.where(
                    AIKnowledgeDocumentModel.status == filters.status
                )
            else:
                stmt = stmt.where(AIKnowledgeDocumentModel.archived_at.is_(None))
            stmt = (
                stmt.order_by(AIKnowledgeDocumentModel.created_at.desc())
                .offset(filters.offset)
                .limit(filters.limit)
            )
        else:
            stmt = stmt.where(AIKnowledgeDocumentModel.archived_at.is_(None)).order_by(
                AIKnowledgeDocumentModel.created_at.desc()
            )

        rows = (await self._session.scalars(stmt)).all()
        return [_to_domain(r) for r in rows]

    async def mark_document_archived(self, document_id: str) -> bool:
        try:
            uid = UUID(document_id)
        except (ValueError, AttributeError):
            return False

        stmt = (
            sa.update(AIKnowledgeDocumentModel)
            .where(AIKnowledgeDocumentModel.id == uid)
            .values(
                status="archived",
                archived_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        result = await self._session.execute(stmt)
        return result.rowcount > 0

    async def find_by_content_hash(
        self, content_hash: str
    ) -> KnowledgeDocument | None:
        stmt = sa.select(AIKnowledgeDocumentModel).where(
            AIKnowledgeDocumentModel.content_hash == content_hash,
            AIKnowledgeDocumentModel.archived_at.is_(None),
        )
        row = await self._session.scalar(stmt)
        return _to_domain(row) if row is not None else None


def _is_valid_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None
