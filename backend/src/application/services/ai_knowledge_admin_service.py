from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai_orchestration.rag.embedding_contract import EmbeddingProviderContract
from src.ai_orchestration.rag.embedding_service import EmbeddingService
from src.ai_orchestration.rag.ingestion_plan import IngestionPipelineInput
from src.ai_orchestration.rag.ingestion_service import TextIngestionService
from src.ai_orchestration.rag.schemas import KnowledgeChunk
from src.core.settings import settings
from src.infrastructure.database.models.ai_knowledge_models import AIKnowledgeDocumentModel
from src.infrastructure.repositories.postgres_vector_store import PostgresVectorStore
from src.infrastructure.repositories.sqlalchemy_knowledge_chunk_repository import (
    SQLAlchemyKnowledgeChunkRepository,
)
from src.infrastructure.repositories.sqlalchemy_knowledge_document_repository import (
    SQLAlchemyKnowledgeDocumentRepository,
)

_BLOCKED_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "CPF"),
    (r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "e-mail"),
    (r"(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}", "telefone"),
    (r"\b(api[_-]?key|token|senha|password|secret)\b", "credencial sensível"),
    (r"\b(payload_json|vector_json|content_hash|embedding|embeddings)\b", "metadado interno"),
    (r"\b(curr[ií]culo bruto|laudo|exame|rg|documento pessoal)\b", "documento pessoal"),
)
_PUBLICABLE_STATUSES = {"published", "active"}


class AIKnowledgeAdminError(Exception):
    pass


class AIKnowledgeDocumentNotFoundError(AIKnowledgeAdminError):
    pass


class AIKnowledgeValidationError(AIKnowledgeAdminError):
    pass


@dataclass(slots=True)
class KnowledgeAdminReindexResult:
    document: AIKnowledgeDocumentModel
    chunks_created: int
    embeddings_created: int
    warnings: list[str]


class AIKnowledgeAdminService:
    def __init__(
        self,
        db: AsyncSession,
        *,
        embedding_provider: EmbeddingProviderContract,
    ) -> None:
        self._db = db
        self._doc_repo = SQLAlchemyKnowledgeDocumentRepository(db)
        self._chunk_repo = SQLAlchemyKnowledgeChunkRepository(db)
        self._vector_store = PostgresVectorStore(db)
        self._embedding_provider = embedding_provider
        self._ingestion_service = TextIngestionService(self._doc_repo, self._chunk_repo)
        self._embedding_service = EmbeddingService(
            provider=embedding_provider,
            vector_store=self._vector_store,
        )

    async def list_documents(
        self,
        *,
        status: str | None = None,
        include_archived: bool = False,
    ) -> dict[str, Any]:
        stmt = sa.select(AIKnowledgeDocumentModel).order_by(
            AIKnowledgeDocumentModel.updated_at.desc(),
            AIKnowledgeDocumentModel.created_at.desc(),
        )
        if status:
            normalized = "active" if status == "published" else status
            stmt = stmt.where(AIKnowledgeDocumentModel.status == normalized)
        elif not include_archived:
            stmt = stmt.where(AIKnowledgeDocumentModel.archived_at.is_(None))

        rows = list((await self._db.scalars(stmt)).all())
        items = [await self._serialize_document(row, include_content=False) for row in rows]
        return {
            "items": items,
            "total": len(items),
            "embedding_provider_status": self._embedding_provider.provider_name,
            "embedding_provider_message": self._embedding_provider_message(),
        }

    async def get_document(self, document_id: str) -> dict[str, Any]:
        row = await self._get_row(document_id)
        return await self._serialize_document(row, include_content=True)

    async def create_document(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, partial=False)
        self._validate_payload(normalized)
        reindex_requested = normalized["status"] in _PUBLICABLE_STATUSES or normalized["status"] == "draft"
        normalized["indexing_status"] = "pending" if reindex_requested else "idle"
        normalized["last_index_error"] = None

        result = await self._ingestion_service.ingest(
            IngestionPipelineInput(
                title=normalized["title"],
                content=normalized["content"],
                source_type=normalized["source_type"],
                source_uri=normalized.get("source_uri"),
                metadata=normalized,
            )
        )
        if not result.ok or not result.document_id:
            raise AIKnowledgeAdminError(result.error or "Falha ao ingerir documento.")

        row = await self._get_row(result.document_id)
        if reindex_requested:
            await self._reindex_row(row)
        else:
            row.indexing_status = "idle"
        await self._db.commit()
        await self._db.refresh(row)
        return await self._serialize_document(row, include_content=True)

    async def update_document(self, document_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = await self._get_row(document_id)
        current = self._row_to_payload(row)
        updates = self._normalize_payload(payload, partial=True)
        merged = {**current, **updates}
        self._validate_payload(merged)

        content_changed = "content" in updates and updates["content"] != row.content
        for field, value in merged.items():
            if field == "allowed_roles":
                row.allowed_roles_json = value
            elif field == "tags":
                row.tags_json = value
            elif field == "status":
                row.status = "active" if value == "published" else value
            elif hasattr(row, field):
                setattr(row, field, value)

        row.metadata_json = {
            **dict(row.metadata_json or {}),
            "domain": merged["domain"],
            "visibility": merged["visibility"],
            "allowed_roles": merged["allowed_roles"],
            "sensitivity_level": merged["sensitivity_level"],
            "tags": merged["tags"],
            "status": merged["status"],
            "reviewed_by": merged.get("reviewed_by"),
            "reviewed_at": merged.get("reviewed_at").isoformat() if merged.get("reviewed_at") else None,
            "source_uri": merged.get("source_uri"),
        }
        row.updated_at = datetime.now(UTC)
        row.archived_at = None if merged["status"] != "archived" else (row.archived_at or datetime.now(UTC))
        row.last_index_error = None

        if merged["status"] == "archived":
            row.indexing_status = "archived"
            await self._db.commit()
            await self._db.refresh(row)
            return await self._serialize_document(row, include_content=True)

        if content_changed:
            row.indexing_status = "pending"
            await self._db.flush()
            await self._reindex_row(row)

        await self._db.commit()
        await self._db.refresh(row)
        return await self._serialize_document(row, include_content=True)

    async def archive_document(self, document_id: str) -> dict[str, Any]:
        row = await self._get_row(document_id)
        row.status = "archived"
        row.archived_at = datetime.now(UTC)
        row.indexing_status = "archived"
        row.updated_at = datetime.now(UTC)
        await self._db.commit()
        return {"ok": True, "document_id": row.id, "status": "archived"}

    async def reindex_document(self, document_id: str) -> KnowledgeAdminReindexResult:
        row = await self._get_row(document_id)
        result = await self._reindex_row(row)
        await self._db.commit()
        await self._db.refresh(row)
        return result

    async def _reindex_row(self, row: AIKnowledgeDocumentModel) -> KnowledgeAdminReindexResult:
        row.indexing_status = "indexing"
        row.last_index_error = None
        row.updated_at = datetime.now(UTC)
        await self._db.flush()

        await self._vector_store.delete_embeddings_by_document(str(row.id))
        ingest_result = await self._ingestion_service.reingest_by_document_id(str(row.id))
        if not ingest_result.ok:
            row.indexing_status = "failed"
            row.last_index_error = ingest_result.error
            await self._db.flush()
            raise AIKnowledgeAdminError(ingest_result.error or "Falha ao reprocessar chunks.")

        chunks = await self._chunk_repo.get_chunks_by_document(str(row.id))
        embedding_result = await self._embedding_service.generate_and_save_embeddings(chunks)
        if not embedding_result.ok:
            row.indexing_status = "failed"
            row.last_index_error = self._friendly_embedding_error()
            await self._db.flush()
            return KnowledgeAdminReindexResult(
                document=row,
                chunks_created=len(chunks),
                embeddings_created=0,
                warnings=[self._friendly_embedding_error()],
            )

        row.indexing_status = "indexed"
        row.last_indexed_at = datetime.now(UTC)
        row.last_index_error = None
        row.updated_at = datetime.now(UTC)
        await self._db.flush()
        return KnowledgeAdminReindexResult(
            document=row,
            chunks_created=ingest_result.chunks_created,
            embeddings_created=embedding_result.embeddings_created,
            warnings=list(embedding_result.warnings),
        )

    async def _serialize_document(
        self,
        row: AIKnowledgeDocumentModel,
        *,
        include_content: bool,
    ) -> dict[str, Any]:
        chunks = await self._chunk_repo.get_chunks_by_document(str(row.id))
        safe_chunks = [self._serialize_chunk_preview(chunk) for chunk in chunks[:8]]
        return {
            "id": row.id,
            "title": row.title,
            "source_type": row.source_type,
            "domain": row.domain,
            "content": row.content if include_content else self._content_preview(row.content),
            "visibility": row.visibility,
            "allowed_roles": list(row.allowed_roles_json or []),
            "sensitivity_level": row.sensitivity_level,
            "tags": list(row.tags_json or []),
            "status": "published" if row.status == "active" else row.status,
            "reviewed_by": row.reviewed_by,
            "reviewed_at": row.reviewed_at,
            "source_uri": row.source_uri,
            "indexing_status": row.indexing_status,
            "last_indexed_at": row.last_indexed_at,
            "last_index_error": row.last_index_error,
            "chunk_count": len(chunks),
            "chunks": safe_chunks,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "archived_at": row.archived_at,
        }

    def _serialize_chunk_preview(self, chunk: KnowledgeChunk) -> dict[str, Any]:
        return {
            "id": UUID(chunk.id),
            "chunk_index": chunk.chunk_index,
            "content_preview": self._content_preview(chunk.content, limit=180),
            "token_count": chunk.metadata.get("token_count"),
        }

    def _normalize_payload(self, payload: dict[str, Any], *, partial: bool) -> dict[str, Any]:
        normalized = dict(payload)
        if not partial or "title" in normalized:
            normalized["title"] = (normalized.get("title") or "").strip()
        if not partial or "source_type" in normalized:
            normalized["source_type"] = (normalized.get("source_type") or "").strip().lower()
        if not partial or "domain" in normalized:
            normalized["domain"] = (normalized.get("domain") or "").strip().lower()
        if not partial or "content" in normalized:
            normalized["content"] = (normalized.get("content") or "").strip()
        if "visibility" in normalized and normalized["visibility"] is not None:
            normalized["visibility"] = str(normalized["visibility"]).strip().lower()
        if "sensitivity_level" in normalized and normalized["sensitivity_level"] is not None:
            normalized["sensitivity_level"] = str(normalized["sensitivity_level"]).strip().lower()
        if "status" in normalized and normalized["status"] is not None:
            normalized["status"] = str(normalized["status"]).strip().lower()
        if "allowed_roles" in normalized and normalized["allowed_roles"] is not None:
            normalized["allowed_roles"] = [str(role).strip().upper() for role in normalized["allowed_roles"] if str(role).strip()]
        elif not partial:
            normalized["allowed_roles"] = []
        if "tags" in normalized and normalized["tags"] is not None:
            normalized["tags"] = [str(tag).strip().lower() for tag in normalized["tags"] if str(tag).strip()]
        elif not partial:
            normalized["tags"] = []
        if "reviewed_by" in normalized and normalized["reviewed_by"] is not None:
            normalized["reviewed_by"] = str(normalized["reviewed_by"]).strip() or None
        if "source_uri" in normalized and normalized["source_uri"] is not None:
            normalized["source_uri"] = str(normalized["source_uri"]).strip() or None
        return normalized

    def _validate_payload(self, payload: dict[str, Any]) -> None:
        content = payload.get("content", "")
        for pattern, label in _BLOCKED_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                raise AIKnowledgeValidationError(
                    f"Conteúdo bloqueado: padrão sensível detectado ({label})."
                )
        if payload.get("sensitivity_level") == "restricted" and payload.get("status") == "published":
            raise AIKnowledgeValidationError(
                "Documentos com sensitivity_level=restricted não podem ser publicados nesta fase."
            )

    async def _get_row(self, document_id: str) -> AIKnowledgeDocumentModel:
        try:
            uid = UUID(document_id)
        except (ValueError, TypeError) as exc:
            raise AIKnowledgeDocumentNotFoundError("Documento não encontrado.") from exc
        row = await self._db.scalar(
            sa.select(AIKnowledgeDocumentModel).where(AIKnowledgeDocumentModel.id == uid)
        )
        if row is None:
            raise AIKnowledgeDocumentNotFoundError("Documento não encontrado.")
        return row

    def _row_to_payload(self, row: AIKnowledgeDocumentModel) -> dict[str, Any]:
        return {
            "title": row.title,
            "source_type": row.source_type,
            "domain": row.domain,
            "content": row.content,
            "visibility": row.visibility,
            "allowed_roles": list(row.allowed_roles_json or []),
            "sensitivity_level": row.sensitivity_level,
            "tags": list(row.tags_json or []),
            "status": "published" if row.status == "active" else row.status,
            "reviewed_by": row.reviewed_by,
            "reviewed_at": row.reviewed_at,
            "source_uri": row.source_uri,
        }

    def _friendly_embedding_error(self) -> str:
        return (
            "Não foi possível gerar embedding da consulta. "
            "Verifique se Gemini está configurado ou use provider fake."
        )

    def _embedding_provider_message(self) -> str | None:
        if self._embedding_provider.provider_name == "gemini" and not settings.GOOGLE_API_KEY_1:
            return self._friendly_embedding_error()
        return None

    def _content_preview(self, content: str, *, limit: int = 220) -> str:
        clean = " ".join(content.split())
        if len(clean) <= limit:
            return clean
        return f"{clean[: limit - 1].rstrip()}…"
