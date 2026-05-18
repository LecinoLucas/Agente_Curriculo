from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.audit_service import AuditService
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_note_model import CandidateNoteModel
from src.infrastructure.database.models.user_model import UserModel

logger = structlog.get_logger(__name__)

MAX_NOTE_LENGTH = 2000


class CandidateNoteCandidateNotFoundError(Exception):
    pass


class CandidateNoteNotFoundError(Exception):
    pass


class CandidateNoteValidationError(Exception):
    pass


class CandidateNoteForbiddenError(Exception):
    pass


class CandidateNoteService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._audit_service = AuditService(db)

    async def list_notes(self, *, candidate_id: UUID, current_user: User) -> list[dict]:
        await self._ensure_candidate_exists(candidate_id)

        result = await self._db.execute(
            sa.select(
                CandidateNoteModel.id,
                CandidateNoteModel.candidate_id,
                CandidateNoteModel.author_user_id,
                CandidateNoteModel.note_text,
                CandidateNoteModel.visibility,
                CandidateNoteModel.is_pinned,
                CandidateNoteModel.created_at,
                CandidateNoteModel.updated_at,
                UserModel.full_name.label("author_name"),
            )
            .select_from(CandidateNoteModel)
            .outerjoin(UserModel, UserModel.id == CandidateNoteModel.author_user_id)
            .where(
                CandidateNoteModel.candidate_id == candidate_id,
                CandidateNoteModel.deleted_at.is_(None),
            )
            .order_by(
                CandidateNoteModel.is_pinned.desc(),
                CandidateNoteModel.created_at.desc(),
                CandidateNoteModel.id.desc(),
            )
        )
        rows = result.mappings().all()
        return [self._serialize(row, current_user=current_user) for row in rows]

    async def create_note(
        self,
        *,
        candidate_id: UUID,
        current_user: User,
        note_text: str,
    ) -> dict:
        await self._ensure_candidate_exists(candidate_id)
        clean_note = self._normalize_text(note_text)

        model = CandidateNoteModel(
            candidate_id=candidate_id,
            author_user_id=current_user.id,
            note_text=clean_note,
            visibility="internal",
            is_pinned=False,
        )
        self._db.add(model)
        await self._db.flush()
        await self._db.refresh(model)

        await self._audit_service.log_event(
            action="candidate_note.created",
            resource_type="candidate_note",
            resource_id=model.id,
            user_id=current_user.id,
            metadata={
                "candidate_id": str(candidate_id),
                "visibility": "internal",
                "is_pinned": model.is_pinned,
            },
        )
        logger.info(
            "candidate_note.created",
            candidate_id=str(candidate_id),
            note_id=str(model.id),
            author_user_id=str(current_user.id),
            visibility=model.visibility,
            is_pinned=model.is_pinned,
        )
        return await self._load_note(note_id=model.id, candidate_id=candidate_id, current_user=current_user)

    async def update_note(
        self,
        *,
        candidate_id: UUID,
        note_id: UUID,
        current_user: User,
        note_text: str,
    ) -> dict:
        await self._ensure_candidate_exists(candidate_id)
        model = await self._get_note_model(candidate_id=candidate_id, note_id=note_id)
        self._assert_can_mutate(model, current_user)

        clean_note = self._normalize_text(note_text)
        changed_fields: list[str] = []
        if clean_note != model.note_text:
            model.note_text = clean_note
            model.updated_at = datetime.now(UTC)
            changed_fields.append("note_text")
        await self._db.flush()

        await self._audit_service.log_event(
            action="candidate_note.updated",
            resource_type="candidate_note",
            resource_id=model.id,
            user_id=current_user.id,
            metadata={
                "candidate_id": str(candidate_id),
                "changed_fields": changed_fields,
            },
        )
        logger.info(
            "candidate_note.updated",
            candidate_id=str(candidate_id),
            note_id=str(model.id),
            actor_user_id=str(current_user.id),
            changed_fields=changed_fields,
        )
        return await self._load_note(note_id=model.id, candidate_id=candidate_id, current_user=current_user)

    async def delete_note(
        self,
        *,
        candidate_id: UUID,
        note_id: UUID,
        current_user: User,
    ) -> None:
        await self._ensure_candidate_exists(candidate_id)
        model = await self._get_note_model(candidate_id=candidate_id, note_id=note_id)
        self._assert_can_mutate(model, current_user)

        model.deleted_at = datetime.now(UTC)
        model.updated_at = datetime.now(UTC)
        await self._db.flush()

        await self._audit_service.log_event(
            action="candidate_note.deleted",
            resource_type="candidate_note",
            resource_id=model.id,
            user_id=current_user.id,
            metadata={
                "candidate_id": str(candidate_id),
                "soft_delete": True,
            },
        )
        logger.info(
            "candidate_note.deleted",
            candidate_id=str(candidate_id),
            note_id=str(model.id),
            actor_user_id=str(current_user.id),
            soft_delete=True,
        )

    async def _ensure_candidate_exists(self, candidate_id: UUID) -> None:
        candidate = await self._db.scalar(
            sa.select(CandidateModel.id).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if candidate is None:
            raise CandidateNoteCandidateNotFoundError

    async def _get_note_model(self, *, candidate_id: UUID, note_id: UUID) -> CandidateNoteModel:
        model = await self._db.scalar(
            sa.select(CandidateNoteModel).where(
                CandidateNoteModel.id == note_id,
                CandidateNoteModel.candidate_id == candidate_id,
                CandidateNoteModel.deleted_at.is_(None),
            )
        )
        if model is None:
            raise CandidateNoteNotFoundError
        return model

    async def _load_note(self, *, candidate_id: UUID, note_id: UUID, current_user: User) -> dict:
        result = await self._db.execute(
            sa.select(
                CandidateNoteModel.id,
                CandidateNoteModel.candidate_id,
                CandidateNoteModel.author_user_id,
                CandidateNoteModel.note_text,
                CandidateNoteModel.visibility,
                CandidateNoteModel.is_pinned,
                CandidateNoteModel.created_at,
                CandidateNoteModel.updated_at,
                UserModel.full_name.label("author_name"),
            )
            .select_from(CandidateNoteModel)
            .outerjoin(UserModel, UserModel.id == CandidateNoteModel.author_user_id)
            .where(
                CandidateNoteModel.id == note_id,
                CandidateNoteModel.candidate_id == candidate_id,
                CandidateNoteModel.deleted_at.is_(None),
            )
        )
        row = result.mappings().first()
        if row is None:
            raise CandidateNoteNotFoundError
        return self._serialize(row, current_user=current_user)

    def _assert_can_mutate(self, model: CandidateNoteModel, current_user: User) -> None:
        is_admin = current_user.role == UserRole.ADMIN
        is_author = model.author_user_id == current_user.id
        if not (is_admin or is_author):
            raise CandidateNoteForbiddenError

    def _serialize(self, row: sa.RowMapping, *, current_user: User) -> dict:
        author_name = row.get("author_name") or "Usuário removido"
        author_id = row.get("author_user_id")
        can_mutate = current_user.role == UserRole.ADMIN or author_id == current_user.id
        return {
            "id": row["id"],
            "candidate_id": row["candidate_id"],
            "note_text": row["note_text"],
            "visibility": row["visibility"],
            "is_pinned": bool(row["is_pinned"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "is_edited": row["updated_at"] != row["created_at"],
            "can_edit": can_mutate,
            "can_delete": can_mutate,
            "author": {
                "id": author_id,
                "name": author_name,
            },
        }

    def _normalize_text(self, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise CandidateNoteValidationError("Observação não pode estar vazia.")
        if len(normalized) > MAX_NOTE_LENGTH:
            raise CandidateNoteValidationError(
                f"Observação deve ter no máximo {MAX_NOTE_LENGTH} caracteres.",
            )
        return normalized
