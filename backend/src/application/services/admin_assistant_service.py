"""OP-6H-1A — Admin read-only service for candidate assistant sessions.

Security guarantees enforced here (never in the router):
- CPF, phone, email are never projected into responses.
- context_json is never sent raw; only safe keys are projected.
- cpf_last4 is projected only when context_json.identity_verified = True.
- message content is sanitised: digit sequences of 10–11 chars and CPF-formatted
  strings are replaced with placeholder tokens before leaving this layer.
- Accessing a session detail writes an audit log (read of PII-adjacent data).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.audit_service import AuditService
from src.infrastructure.database.models.candidate_application_model import (
    CandidateApplicationModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.conversation_model import (
    ConversationMessageModel,
    ConversationSessionModel,
)
from src.interface.api.schemas.admin_assistant_schemas import (
    AdminContextSummary,
    AdminMessageItem,
    AdminSessionApplicationInfo,
    AdminSessionCandidateInfo,
    AdminSessionDetail,
    AdminSessionListItem,
    AdminSessionPipelineInfo,
)
from src.interface.api.schemas.common import PaginatedResponse

# Sanitisation patterns (applied to candidate-authored free text before returning).
# Replace 10-11 consecutive digit sequences (phone/WhatsApp).
_RE_PHONE = re.compile(r"\b\d{10,11}\b")
# Replace CPF in formatted notation (000.000.000-00).
_RE_CPF_FORMATTED = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")


def sanitise_assistant_text(text: str) -> str:
    text = _RE_CPF_FORMATTED.sub("[cpf omitido]", text)
    text = _RE_PHONE.sub("[número omitido]", text)
    return text


def _mask_name(full_name: str | None) -> str:
    if not full_name or not full_name.strip():
        return "Candidato anônimo"
    parts = full_name.strip().split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def _direction_for_role(role: str) -> str:
    if role == "candidate":
        return "inbound"
    if role == "assistant":
        return "outbound"
    return "system"


def _safe_context(ctx: dict[str, Any], identity_verified: bool) -> AdminContextSummary:
    return AdminContextSummary(
        identifier_type=ctx.get("identifier_type") or None,
        identity_verified=identity_verified,
        location_hint=ctx.get("location_hint") or None,
        desired_function=ctx.get("desired_function") or None,
        desired_shift=ctx.get("desired_shift") or None,
    )


@dataclass(slots=True)
class SessionListQuery:
    page: int = 1
    page_size: int = 20
    status: str | None = None
    current_state: str | None = None
    channel: str | None = None
    has_application: bool | None = None
    has_pipeline: bool | None = None
    from_date: date | None = None
    to_date: date | None = None


class AdminAssistantService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── List sessions ──────────────────────────────────────────────────────────

    async def list_sessions(
        self,
        query: SessionListQuery,
    ) -> PaginatedResponse[AdminSessionListItem]:
        # Base query: select only the columns we need (minimal data fetch).
        stmt = (
            sa.select(
                ConversationSessionModel.id,
                ConversationSessionModel.candidate_id,
                ConversationSessionModel.application_id,
                ConversationSessionModel.channel,
                ConversationSessionModel.current_state,
                ConversationSessionModel.status,
                ConversationSessionModel.context_json,
                ConversationSessionModel.last_message_at,
                ConversationSessionModel.created_at,
                # Candidate — minimal PII (no cpf, phone, email)
                CandidateModel.full_name,
                CandidateModel.cpf_last4,
                # Application
                CandidateApplicationModel.status.label("application_status"),
                CandidateApplicationModel.job_id.label("application_job_id"),
                # Pipeline
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.pipeline_stage,
            )
            .outerjoin(
                CandidateModel,
                (CandidateModel.id == ConversationSessionModel.candidate_id)
                & CandidateModel.deleted_at.is_(None),
            )
            .outerjoin(
                CandidateApplicationModel,
                CandidateApplicationModel.id == ConversationSessionModel.application_id,
            )
            .outerjoin(
                CandidateJobPipelineModel,
                (
                    CandidateJobPipelineModel.application_id
                    == ConversationSessionModel.application_id
                )
                & (CandidateJobPipelineModel.relationship_status == "active")
                & CandidateJobPipelineModel.is_terminal.is_(False),
            )
            .where(ConversationSessionModel.deleted_at.is_(None))
        )

        # Apply filters.
        if query.status:
            stmt = stmt.where(ConversationSessionModel.status == query.status)
        if query.current_state:
            stmt = stmt.where(ConversationSessionModel.current_state == query.current_state)
        if query.channel:
            stmt = stmt.where(ConversationSessionModel.channel == query.channel)
        if query.has_application is True:
            stmt = stmt.where(ConversationSessionModel.application_id.isnot(None))
        elif query.has_application is False:
            stmt = stmt.where(ConversationSessionModel.application_id.is_(None))
        if query.has_pipeline is True:
            stmt = stmt.where(
                CandidateJobPipelineModel.candidate_job_pipeline_id.isnot(None)
            )
        elif query.has_pipeline is False:
            stmt = stmt.where(
                CandidateJobPipelineModel.candidate_job_pipeline_id.is_(None)
            )
        if query.from_date:
            stmt = stmt.where(
                ConversationSessionModel.created_at >= datetime(
                    query.from_date.year, query.from_date.month, query.from_date.day
                )
            )
        if query.to_date:
            stmt = stmt.where(
                ConversationSessionModel.created_at
                < datetime(
                    query.to_date.year, query.to_date.month, query.to_date.day + 1
                )
            )

        # Count.
        count_stmt = sa.select(sa.func.count()).select_from(stmt.order_by(None).subquery())
        total = (await self._db.scalar(count_stmt)) or 0

        # Paginate.
        stmt = stmt.order_by(
            ConversationSessionModel.last_message_at.desc(),
            ConversationSessionModel.id.desc(),
        ).offset((query.page - 1) * query.page_size).limit(query.page_size)

        rows = (await self._db.execute(stmt)).mappings().all()
        items = [self._row_to_list_item(r) for r in rows]

        return PaginatedResponse(
            data=items,
            total=total,
            page=query.page,
            page_size=query.page_size,
            total_pages=max(1, (total + query.page_size - 1) // query.page_size),
        )

    # ── Session detail ─────────────────────────────────────────────────────────

    async def get_session(
        self,
        session_id: UUID,
        actor_id: UUID | None,
    ) -> AdminSessionDetail | None:
        stmt = (
            sa.select(
                ConversationSessionModel.id,
                ConversationSessionModel.candidate_id,
                ConversationSessionModel.application_id,
                ConversationSessionModel.channel,
                ConversationSessionModel.current_state,
                ConversationSessionModel.status,
                ConversationSessionModel.context_json,
                ConversationSessionModel.last_message_at,
                ConversationSessionModel.created_at,
                CandidateModel.full_name,
                CandidateModel.cpf_last4,
                CandidateApplicationModel.status.label("application_status"),
                CandidateApplicationModel.job_id.label("application_job_id"),
                CandidateJobPipelineModel.candidate_job_pipeline_id.label("pipeline_id"),
                CandidateJobPipelineModel.pipeline_stage,
            )
            .outerjoin(
                CandidateModel,
                (CandidateModel.id == ConversationSessionModel.candidate_id)
                & CandidateModel.deleted_at.is_(None),
            )
            .outerjoin(
                CandidateApplicationModel,
                CandidateApplicationModel.id == ConversationSessionModel.application_id,
            )
            .outerjoin(
                CandidateJobPipelineModel,
                (
                    CandidateJobPipelineModel.application_id
                    == ConversationSessionModel.application_id
                )
                & (CandidateJobPipelineModel.relationship_status == "active")
                & CandidateJobPipelineModel.is_terminal.is_(False),
            )
            .where(
                ConversationSessionModel.id == session_id,
                ConversationSessionModel.deleted_at.is_(None),
            )
        )
        row = (await self._db.execute(stmt)).mappings().first()
        if row is None:
            return None

        # Audit: accessing session detail involves PII-adjacent data.
        audit = AuditService(self._db)
        await audit.log_event(
            action="admin.assistant.session.read",
            resource_type="conversation_session",
            resource_id=session_id,
            user_id=actor_id,
            metadata={"channel": row["channel"], "status": row["status"]},
        )

        return self._row_to_detail(row)

    # ── Session messages ───────────────────────────────────────────────────────

    async def list_messages(self, session_id: UUID) -> list[AdminMessageItem]:
        rows = (
            await self._db.execute(
                sa.select(ConversationMessageModel)
                .where(ConversationMessageModel.session_id == session_id)
                .order_by(
                    ConversationMessageModel.created_at.asc(),
                    ConversationMessageModel.id.asc(),
                )
            )
        ).scalars().all()
        return [self._message_to_item(m) for m in rows]

    # ── Private helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_candidate(row: Any) -> AdminSessionCandidateInfo:
        ctx: dict[str, Any] = row["context_json"] or {}
        identity_verified = bool(ctx.get("identity_verified"))
        display_name = _mask_name(row["full_name"]) if row["full_name"] else "Candidato anônimo"
        # cpf_last4 only shown when the candidate completed OTP (identity_verified)
        cpf_last4: str | None = None
        if identity_verified and row["cpf_last4"]:
            cpf_last4 = str(row["cpf_last4"])
        return AdminSessionCandidateInfo(
            id=row["candidate_id"],
            display_name=display_name,
            cpf_last4=cpf_last4,
            identity_verified=identity_verified,
        )

    @staticmethod
    def _row_to_list_item(row: Any) -> AdminSessionListItem:
        ctx: dict[str, Any] = row["context_json"] or {}
        identity_verified = bool(ctx.get("identity_verified"))
        app = (
            AdminSessionApplicationInfo(
                id=row["application_id"],
                status=row["application_status"],
                job_id=row["application_job_id"],
            )
            if row["application_id"] is not None
            else None
        )
        pipeline = (
            AdminSessionPipelineInfo(
                id=row["pipeline_id"],
                stage=row["pipeline_stage"],
            )
            if row["pipeline_id"] is not None
            else None
        )
        return AdminSessionListItem(
            session_id=row["id"],
            candidate=AdminAssistantService._row_to_candidate(row),
            channel=row["channel"],
            current_state=row["current_state"],
            status=row["status"],
            last_message_at=row["last_message_at"],
            created_at=row["created_at"],
            application=app,
            pipeline=pipeline,
            context_summary=_safe_context(ctx, identity_verified),
        )

    @staticmethod
    def _row_to_detail(row: Any) -> AdminSessionDetail:
        ctx: dict[str, Any] = row["context_json"] or {}
        identity_verified = bool(ctx.get("identity_verified"))
        app = (
            AdminSessionApplicationInfo(
                id=row["application_id"],
                status=row["application_status"],
                job_id=row["application_job_id"],
            )
            if row["application_id"] is not None
            else None
        )
        pipeline = (
            AdminSessionPipelineInfo(
                id=row["pipeline_id"],
                stage=row["pipeline_stage"],
            )
            if row["pipeline_id"] is not None
            else None
        )
        return AdminSessionDetail(
            session_id=row["id"],
            candidate=AdminAssistantService._row_to_candidate(row),
            channel=row["channel"],
            current_state=row["current_state"],
            status=row["status"],
            last_message_at=row["last_message_at"],
            created_at=row["created_at"],
            application=app,
            pipeline=pipeline,
            context_summary=_safe_context(ctx, identity_verified),
        )

    @staticmethod
    def _message_to_item(msg: ConversationMessageModel) -> AdminMessageItem:
        meta: dict[str, Any] = msg.metadata_json or {}
        quick_replies: list[dict[str, str]] = []
        if msg.role == "assistant" and isinstance(meta.get("quick_replies"), list):
            quick_replies = [
                {"value": str(qr.get("value", "")), "label": str(qr.get("label", ""))}
                for qr in meta["quick_replies"]
                if isinstance(qr, dict)
            ]
        content = msg.content
        if msg.role == "candidate":
            content = sanitise_assistant_text(content)
        return AdminMessageItem(
            id=msg.id,
            role=msg.role,
            direction=_direction_for_role(msg.role),
            content=content,
            message_type=msg.message_type,
            quick_replies=quick_replies,
            state_at_message=meta.get("state") if isinstance(meta.get("state"), str) else None,
            created_at=msg.created_at,
        )
