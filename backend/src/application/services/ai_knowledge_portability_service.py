from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.ai_knowledge_admin_service import _BLOCKED_PATTERNS
from src.infrastructure.database.models.ai_knowledge_models import (
    AIKnowledgeChunkModel,
    AIKnowledgeDocumentModel,
    AIKnowledgeEmbeddingModel,
)

PORTABLE_KNOWLEDGE_SCHEMA_VERSION = "2026-06-07"
_EXPORT_ORDER_BY = (
    AIKnowledgeDocumentModel.domain.asc(),
    AIKnowledgeDocumentModel.source_type.asc(),
    AIKnowledgeDocumentModel.title.asc(),
)
_ALLOWED_STATUSES = {"draft", "published", "archived"}


class AIKnowledgePortabilityError(Exception):
    pass


class AIKnowledgePortabilityValidationError(AIKnowledgePortabilityError):
    pass


@dataclass(slots=True)
class KnowledgeImportResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    archived: int = 0


def build_portable_document_key(payload: dict[str, Any]) -> str:
    source_uri = str(payload.get("source_uri") or "").strip().lower()
    if source_uri:
        return f"source_uri:{source_uri}"

    title = _slugify(str(payload.get("title") or ""))
    domain = _slugify(str(payload.get("domain") or "general"))
    source_type = _slugify(str(payload.get("source_type") or "general"))
    return f"title:{title}|domain:{domain}|source_type:{source_type}"


def sanitize_portable_document(payload: dict[str, Any]) -> dict[str, Any]:
    reviewed_at = payload.get("reviewed_at")
    if isinstance(reviewed_at, datetime):
        reviewed_at_value = reviewed_at.astimezone(UTC).isoformat()
    elif isinstance(reviewed_at, str) and reviewed_at.strip():
        reviewed_at_value = reviewed_at.strip()
    else:
        reviewed_at_value = None

    safe_payload = {
        "document_key": build_portable_document_key(payload),
        "title": str(payload.get("title") or "").strip(),
        "source_type": str(payload.get("source_type") or "").strip().lower(),
        "domain": str(payload.get("domain") or "").strip().lower(),
        "content": str(payload.get("content") or "").strip(),
        "visibility": str(payload.get("visibility") or "internal").strip().lower(),
        "allowed_roles": [
            str(role).strip().upper()
            for role in list(payload.get("allowed_roles") or [])
            if str(role).strip()
        ],
        "sensitivity_level": str(payload.get("sensitivity_level") or "low").strip().lower(),
        "tags": [
            str(tag).strip().lower()
            for tag in list(payload.get("tags") or [])
            if str(tag).strip()
        ],
        "status": str(payload.get("status") or "draft").strip().lower(),
        "reviewed_by": str(payload.get("reviewed_by") or "").strip() or None,
        "reviewed_at": reviewed_at_value,
        "source_uri": str(payload.get("source_uri") or "").strip() or None,
    }
    validate_portable_document(safe_payload)
    return safe_payload


def validate_portable_document(payload: dict[str, Any]) -> None:
    if not payload.get("title"):
        raise AIKnowledgePortabilityValidationError("Documento sem título.")
    if not payload.get("source_type"):
        raise AIKnowledgePortabilityValidationError("Documento sem source_type.")
    if not payload.get("domain"):
        raise AIKnowledgePortabilityValidationError("Documento sem domain.")
    if not payload.get("content"):
        raise AIKnowledgePortabilityValidationError("Documento sem content.")

    status = str(payload.get("status") or "").strip().lower()
    if status not in _ALLOWED_STATUSES:
        raise AIKnowledgePortabilityValidationError(f"Status inválido para portabilidade: {status}.")

    content = str(payload.get("content") or "")
    for pattern, label in _BLOCKED_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            raise AIKnowledgePortabilityValidationError(
                f"Conteúdo bloqueado no bundle: padrão sensível detectado ({label})."
            )

    if payload.get("sensitivity_level") == "restricted" and status == "published":
        raise AIKnowledgePortabilityValidationError(
            "Documentos restricted não podem ser publicados pelo bundle portátil."
        )


def build_portable_bundle(documents: list[dict[str, Any]]) -> dict[str, Any]:
    safe_documents = [sanitize_portable_document(document) for document in documents]
    return {
        "schema_version": PORTABLE_KNOWLEDGE_SCHEMA_VERSION,
        "exported_at": datetime.now(UTC).isoformat(),
        "document_count": len(safe_documents),
        "documents": safe_documents,
    }


class AIKnowledgePortabilityService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def export_bundle(self, *, include_archived: bool = False) -> dict[str, Any]:
        stmt = sa.select(AIKnowledgeDocumentModel).order_by(*_EXPORT_ORDER_BY)
        if not include_archived:
            stmt = stmt.where(AIKnowledgeDocumentModel.archived_at.is_(None))
        rows = list((await self._db.scalars(stmt)).all())

        documents = [self._row_to_portable_payload(row) for row in rows]
        return build_portable_bundle(documents)

    async def import_bundle(self, bundle: dict[str, Any]) -> KnowledgeImportResult:
        schema_version = str(bundle.get("schema_version") or "").strip()
        if schema_version != PORTABLE_KNOWLEDGE_SCHEMA_VERSION:
            raise AIKnowledgePortabilityValidationError(
                f"schema_version incompatível: {schema_version or 'ausente'}."
            )

        raw_documents = bundle.get("documents")
        if not isinstance(raw_documents, list):
            raise AIKnowledgePortabilityValidationError("Bundle sem lista válida de documentos.")

        result = KnowledgeImportResult()
        for raw_document in raw_documents:
            if not isinstance(raw_document, dict):
                raise AIKnowledgePortabilityValidationError("Documento portátil inválido.")
            payload = sanitize_portable_document(raw_document)
            row = await self._find_existing_row(payload)
            if row is None:
                row = AIKnowledgeDocumentModel(
                    title=payload["title"],
                    source_type=payload["source_type"],
                    source_uri=payload["source_uri"],
                    domain=payload["domain"],
                    content=payload["content"],
                    content_hash=_hash_content(payload["content"]),
                    metadata_json={},
                    visibility=payload["visibility"],
                    allowed_roles_json=list(payload["allowed_roles"]),
                    sensitivity_level=payload["sensitivity_level"],
                    tags_json=list(payload["tags"]),
                    status="active" if payload["status"] == "published" else payload["status"],
                    reviewed_by=payload["reviewed_by"],
                    reviewed_at=_parse_datetime(payload["reviewed_at"]),
                )
                self._apply_portable_payload(row, payload, content_changed=True)
                self._db.add(row)
                result.created += 1
            else:
                content_changed = row.content != payload["content"]
                changed = self._apply_portable_payload(row, payload)
                if content_changed:
                    await self._clear_indexed_artifacts(row.id)
                if changed:
                    result.updated += 1
                else:
                    result.unchanged += 1

            if payload["status"] == "archived":
                result.archived += 1

        await self._db.commit()
        return result

    async def _clear_indexed_artifacts(self, document_id: Any) -> None:
        chunk_ids = list(
            (
                await self._db.scalars(
                    sa.select(AIKnowledgeChunkModel.id).where(
                        AIKnowledgeChunkModel.document_id == document_id
                    )
                )
            ).all()
        )
        if chunk_ids:
            await self._db.execute(
                sa.delete(AIKnowledgeEmbeddingModel).where(
                    AIKnowledgeEmbeddingModel.chunk_id.in_(chunk_ids)
                )
            )
        await self._db.execute(
            sa.delete(AIKnowledgeChunkModel).where(
                AIKnowledgeChunkModel.document_id == document_id
            )
        )

    async def _find_existing_row(self, payload: dict[str, Any]) -> AIKnowledgeDocumentModel | None:
        source_uri = payload.get("source_uri")
        if source_uri:
            return await self._db.scalar(
                sa.select(AIKnowledgeDocumentModel).where(
                    AIKnowledgeDocumentModel.source_uri == source_uri
                )
            )

        return await self._db.scalar(
            sa.select(AIKnowledgeDocumentModel).where(
                AIKnowledgeDocumentModel.title == payload["title"],
                AIKnowledgeDocumentModel.domain == payload["domain"],
                AIKnowledgeDocumentModel.source_type == payload["source_type"],
            )
        )

    def _row_to_portable_payload(self, row: AIKnowledgeDocumentModel) -> dict[str, Any]:
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

    def _apply_portable_payload(
        self,
        row: AIKnowledgeDocumentModel,
        payload: dict[str, Any],
        *,
        content_changed: bool | None = None,
    ) -> bool:
        if content_changed is None:
            content_changed = row.content != payload["content"]

        changed = False
        new_status = "active" if payload["status"] == "published" else payload["status"]
        new_reviewed_at = _parse_datetime(payload["reviewed_at"])
        new_archived_at = datetime.now(UTC) if payload["status"] == "archived" else None

        updates = {
            "title": payload["title"],
            "source_type": payload["source_type"],
            "source_uri": payload["source_uri"],
            "domain": payload["domain"],
            "content": payload["content"],
            "content_hash": _hash_content(payload["content"]),
            "visibility": payload["visibility"],
            "allowed_roles_json": list(payload["allowed_roles"]),
            "sensitivity_level": payload["sensitivity_level"],
            "tags_json": list(payload["tags"]),
            "status": new_status,
            "reviewed_by": payload["reviewed_by"],
            "reviewed_at": new_reviewed_at,
            "archived_at": new_archived_at,
        }

        for field, value in updates.items():
            if getattr(row, field) != value:
                setattr(row, field, value)
                changed = True

        metadata_json = {
            "domain": payload["domain"],
            "visibility": payload["visibility"],
            "allowed_roles": list(payload["allowed_roles"]),
            "sensitivity_level": payload["sensitivity_level"],
            "tags": list(payload["tags"]),
            "status": payload["status"],
            "reviewed_by": payload["reviewed_by"],
            "reviewed_at": payload["reviewed_at"],
            "source_uri": payload["source_uri"],
            "document_key": payload["document_key"],
        }
        if dict(row.metadata_json or {}) != metadata_json:
            row.metadata_json = metadata_json
            changed = True

        if payload["status"] == "archived":
            if row.indexing_status != "archived":
                row.indexing_status = "archived"
                changed = True
        elif content_changed or row.indexing_status == "archived":
            row.indexing_status = "pending"
            row.last_indexed_at = None
            row.last_index_error = None
            changed = True

        if content_changed:
            changed = True

        row.updated_at = datetime.now(UTC)
        self._db.add(row)
        return changed


def _slugify(value: str) -> str:
    clean = unicodedata.normalize("NFD", value.strip().lower())
    clean = "".join(char for char in clean if unicodedata.category(char) != "Mn")
    clean = re.sub(r"\s+", "-", clean)
    clean = re.sub(r"[^a-z0-9._:-]+", "-", clean)
    return clean.strip("-") or "unknown"


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AIKnowledgePortabilityValidationError("reviewed_at inválido no bundle.") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
