"""Postgres implementation of KnowledgeChunkRepositoryContract.

Persists KnowledgeChunk to ai_knowledge_chunks via SQLAlchemy async session.
No LLM, no embeddings, no provider external calls.
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.document_repository_contract import (
    ChunkFilter,
    KnowledgeChunkRepositoryContract,
)
from src.ai_orchestration.rag.schemas import KnowledgeChunk
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeChunkModel,
)


def _compute_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _to_domain(row: AIKnowledgeChunkModel) -> KnowledgeChunk:
    return KnowledgeChunk(
        id=str(row.id),
        document_id=str(row.document_id),
        chunk_index=row.chunk_index,
        content=row.content,
        metadata=dict(row.metadata_json or {}),
        source_title=row.source_title,
    )


class SQLAlchemyKnowledgeChunkRepository(KnowledgeChunkRepositoryContract):
    """Postgres-backed repository for KnowledgeChunk.

    Recebe AsyncSession explicitamente — sem FastAPI, sem LLM.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save_chunks(self, chunks: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        if not chunks:
            return []
        now = datetime.now(UTC)
        rows: list[AIKnowledgeChunkModel] = []
        for chunk in chunks:
            try:
                chunk_uuid = UUID(chunk.id)
            except (ValueError, AttributeError):
                chunk_uuid = uuid4()
            try:
                doc_uuid = UUID(chunk.document_id)
            except (ValueError, AttributeError):
                doc_uuid = UUID(chunk.document_id)

            row = AIKnowledgeChunkModel(
                id=chunk_uuid,
                document_id=doc_uuid,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                token_count=chunk.metadata.get("token_count"),
                metadata_json=dict(chunk.metadata),
                source_title=chunk.source_title,
                content_hash=_compute_hash(chunk.content),
                created_at=now,
            )
            rows.append(row)
            self._session.add(row)

        await self._session.flush()
        for row in rows:
            await self._session.refresh(row)
        return [_to_domain(r) for r in rows]

    async def get_chunks_by_document(self, document_id: str) -> list[KnowledgeChunk]:
        try:
            uid = UUID(document_id)
        except (ValueError, AttributeError):
            return []
        stmt = (
            sa.select(AIKnowledgeChunkModel)
            .where(AIKnowledgeChunkModel.document_id == uid)
            .order_by(AIKnowledgeChunkModel.chunk_index)
        )
        rows = (await self._session.scalars(stmt)).all()
        return [_to_domain(r) for r in rows]

    async def delete_chunks_by_document(self, document_id: str) -> int:
        try:
            uid = UUID(document_id)
        except (ValueError, AttributeError):
            return 0
        stmt = sa.delete(AIKnowledgeChunkModel).where(
            AIKnowledgeChunkModel.document_id == uid
        )
        result = await self._session.execute(stmt)
        return result.rowcount

    async def list_chunks(
        self, filters: ChunkFilter | None = None
    ) -> list[KnowledgeChunk]:
        stmt = sa.select(AIKnowledgeChunkModel)

        if filters:
            if filters.document_id:
                try:
                    uid = UUID(filters.document_id)
                    stmt = stmt.where(AIKnowledgeChunkModel.document_id == uid)
                except (ValueError, AttributeError):
                    return []
            stmt = (
                stmt.order_by(
                    AIKnowledgeChunkModel.document_id,
                    AIKnowledgeChunkModel.chunk_index,
                )
                .offset(filters.offset)
                .limit(filters.limit)
            )
        else:
            stmt = stmt.order_by(
                AIKnowledgeChunkModel.document_id,
                AIKnowledgeChunkModel.chunk_index,
            )

        rows = (await self._session.scalars(stmt)).all()
        return [_to_domain(r) for r in rows]
