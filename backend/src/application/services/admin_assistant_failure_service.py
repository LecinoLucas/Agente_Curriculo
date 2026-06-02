from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.admin_assistant_service import _mask_name
from src.application.services.audit_service import AuditService
from src.infrastructure.database.models.assistant_failure_model import (
    AssistantFailureModel,
)
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import ConversationSessionModel
from src.interface.api.schemas.admin_assistant_schemas import (
    AdminAssistantFailureApplicationInfo,
    AdminAssistantFailureDetail,
    AdminAssistantFailureListItem,
    AdminAssistantFailurePatch,
    AdminAssistantFailureSessionInfo,
)
from src.interface.api.schemas.common import PaginatedResponse


@dataclass(slots=True)
class FailureListQuery:
    page: int = 1
    page_size: int = 20
    status: str | None = None
    reason: str | None = None
    classification: str | None = None
    state: str | None = None
    from_date: date | None = None
    to_date: date | None = None
    session_id: UUID | None = None
    has_candidate: bool | None = None
    has_application: bool | None = None


class AssistantFailureRecorder:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def record_failure(
        self,
        *,
        session_id: UUID,
        message_id: UUID | None,
        candidate_id: UUID | None,
        application_id: UUID | None,
        state: str,
        raw_message: str,
        sanitized_message: str,
        reason: str,
        classification: str | None = None,
        attempts_count: int | None = None,
    ) -> AssistantFailureModel:
        failure = AssistantFailureModel(
            session_id=session_id,
            message_id=message_id,
            candidate_id=candidate_id,
            application_id=application_id,
            state=state,
            raw_message=raw_message,
            sanitized_message=sanitized_message,
            reason=reason,
            classification=classification,
            attempts_count=attempts_count,
            status="open",
        )
        self._db.add(failure)
        await self._db.flush()
        return failure


class AdminAssistantFailureService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_failures(
        self,
        query: FailureListQuery,
    ) -> PaginatedResponse[AdminAssistantFailureListItem]:
        stmt = self._base_query()
        stmt = self._apply_filters(stmt, query)

        total = (await self._db.scalar(
            sa.select(sa.func.count()).select_from(stmt.order_by(None).subquery())
        )) or 0

        stmt = stmt.order_by(
            AssistantFailureModel.created_at.desc(),
            AssistantFailureModel.id.desc(),
        ).offset((query.page - 1) * query.page_size).limit(query.page_size)

        rows = (await self._db.execute(stmt)).mappings().all()
        return PaginatedResponse(
            data=[self._row_to_list_item(row) for row in rows],
            total=total,
            page=query.page,
            page_size=query.page_size,
            total_pages=max(1, (total + query.page_size - 1) // query.page_size),
        )

    async def get_failure(
        self,
        failure_id: UUID,
        actor_id: UUID | None,
    ) -> AdminAssistantFailureDetail | None:
        row = (
            await self._db.execute(
                self._base_query().where(AssistantFailureModel.id == failure_id)
            )
        ).mappings().first()
        if row is None:
            return None

        await AuditService(self._db).log_event(
            action="admin.assistant.failure.read",
            resource_type="assistant_failure",
            resource_id=failure_id,
            user_id=actor_id,
            metadata={
                "status": row["failure_status"],
                "reason": row["reason"],
                "state": row["state"],
            },
        )
        return self._row_to_detail(row)

    async def update_failure(
        self,
        failure_id: UUID,
        patch: AdminAssistantFailurePatch,
        actor_id: UUID | None,
    ) -> AdminAssistantFailureDetail | None:
        failure = await self._db.get(AssistantFailureModel, failure_id)
        if failure is None:
            return None

        before = self._snapshot(failure)
        changed = False
        if patch.status is not None and patch.status != failure.status:
            failure.status = patch.status
            changed = True
        if patch.classification is not None and patch.classification != failure.classification:
            failure.classification = patch.classification
            changed = True

        if changed:
            now = datetime.now(UTC)
            failure.reviewed_by = actor_id
            failure.reviewed_at = now
            failure.updated_at = now
            await self._db.flush()

        await AuditService(self._db).log_event(
            action="admin.assistant.failure.update",
            resource_type="assistant_failure",
            resource_id=failure.id,
            user_id=actor_id,
            before_state=before,
            after_state=self._snapshot(failure),
            metadata={"changed": changed},
        )

        row = (
            await self._db.execute(
                self._base_query().where(AssistantFailureModel.id == failure_id)
            )
        ).mappings().first()
        return self._row_to_detail(row) if row is not None else None

    def _base_query(self) -> sa.Select[Any]:
        return (
            sa.select(
                AssistantFailureModel.id,
                AssistantFailureModel.session_id,
                AssistantFailureModel.message_id,
                AssistantFailureModel.candidate_id,
                AssistantFailureModel.application_id,
                AssistantFailureModel.state,
                AssistantFailureModel.sanitized_message,
                AssistantFailureModel.reason,
                AssistantFailureModel.status.label("failure_status"),
                AssistantFailureModel.classification,
                AssistantFailureModel.attempts_count,
                AssistantFailureModel.reviewed_by,
                AssistantFailureModel.reviewed_at,
                AssistantFailureModel.created_at,
                AssistantFailureModel.updated_at,
                ConversationSessionModel.channel,
                ConversationSessionModel.current_state,
                ConversationSessionModel.status.label("session_status"),
                CandidateModel.full_name,
                CandidateApplicationModel.status.label("application_status"),
            )
            .join(
                ConversationSessionModel,
                ConversationSessionModel.id == AssistantFailureModel.session_id,
            )
            .outerjoin(
                CandidateModel,
                (CandidateModel.id == AssistantFailureModel.candidate_id)
                & CandidateModel.deleted_at.is_(None),
            )
            .outerjoin(
                CandidateApplicationModel,
                CandidateApplicationModel.id == AssistantFailureModel.application_id,
            )
        )

    @staticmethod
    def _apply_filters(
        stmt: sa.Select[Any],
        query: FailureListQuery,
    ) -> sa.Select[Any]:
        if query.status:
            stmt = stmt.where(AssistantFailureModel.status == query.status)
        if query.reason:
            stmt = stmt.where(AssistantFailureModel.reason == query.reason)
        if query.classification:
            stmt = stmt.where(AssistantFailureModel.classification == query.classification)
        if query.state:
            stmt = stmt.where(AssistantFailureModel.state == query.state)
        if query.session_id:
            stmt = stmt.where(AssistantFailureModel.session_id == query.session_id)
        if query.has_candidate is True:
            stmt = stmt.where(AssistantFailureModel.candidate_id.isnot(None))
        elif query.has_candidate is False:
            stmt = stmt.where(AssistantFailureModel.candidate_id.is_(None))
        if query.has_application is True:
            stmt = stmt.where(AssistantFailureModel.application_id.isnot(None))
        elif query.has_application is False:
            stmt = stmt.where(AssistantFailureModel.application_id.is_(None))
        if query.from_date:
            stmt = stmt.where(
                AssistantFailureModel.created_at
                >= datetime.combine(query.from_date, time.min)
            )
        if query.to_date:
            stmt = stmt.where(
                AssistantFailureModel.created_at
                <= datetime.combine(query.to_date, time.max)
            )
        return stmt

    @staticmethod
    def _row_to_list_item(row: Any) -> AdminAssistantFailureListItem:
        application = None
        if row["application_id"] is not None and row["application_status"] is not None:
            application = AdminAssistantFailureApplicationInfo(
                id=row["application_id"],
                status=row["application_status"],
            )
        return AdminAssistantFailureListItem(
            id=row["id"],
            session_id=row["session_id"],
            message_id=row["message_id"],
            candidate_id=row["candidate_id"],
            candidate_label=_mask_name(row["full_name"]),
            application=application,
            state=row["state"],
            sanitized_message=row["sanitized_message"],
            reason=row["reason"],
            status=row["failure_status"],
            classification=row["classification"],
            attempts_count=row["attempts_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @classmethod
    def _row_to_detail(cls, row: Any) -> AdminAssistantFailureDetail:
        item = cls._row_to_list_item(row)
        return AdminAssistantFailureDetail(
            **item.model_dump(),
            session=AdminAssistantFailureSessionInfo(
                id=row["session_id"],
                channel=row["channel"],
                current_state=row["current_state"],
                status=row["session_status"],
            ),
            reviewed_by=row["reviewed_by"],
            reviewed_at=row["reviewed_at"],
        )

    @staticmethod
    def _snapshot(failure: AssistantFailureModel) -> dict[str, Any]:
        return {
            "id": str(failure.id),
            "status": failure.status,
            "classification": failure.classification,
            "reviewed_by": str(failure.reviewed_by) if failure.reviewed_by else None,
            "reviewed_at": failure.reviewed_at.isoformat() if failure.reviewed_at else None,
        }
