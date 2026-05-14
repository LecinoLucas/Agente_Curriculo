"""Safe notification helpers for operational event integrations."""

from __future__ import annotations

import logging
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.communication_service import CommunicationService
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel

logger = logging.getLogger(__name__)


async def _candidate_job_context(
    db: AsyncSession,
    *,
    candidate_id: UUID,
    job_id: UUID | None,
) -> dict[str, str]:
    context: dict[str, str] = {}

    candidate_name = await db.scalar(
        sa.select(CandidateModel.full_name).where(CandidateModel.id == candidate_id)
    )
    if candidate_name:
        context["candidate_name"] = candidate_name

    if job_id:
        job_title = await db.scalar(sa.select(JobModel.title).where(JobModel.id == job_id))
        if job_title:
            context["job_title"] = job_title

    return context


async def notify_candidate_event_safely(
    db: AsyncSession,
    *,
    event_type: str,
    candidate_id: UUID,
    job_id: UUID | None = None,
    related_entity_type: str | None = None,
    related_entity_id: UUID | None = None,
    context: dict | None = None,
    actor_id: UUID | None = None,
) -> None:
    """Notify a candidate event without allowing communication failures to affect the main flow."""
    try:
        notification_context = await _candidate_job_context(
            db,
            candidate_id=candidate_id,
            job_id=job_id,
        )
        notification_context.update(context or {})

        await CommunicationService(db).notify_event(
            event_type=event_type,
            candidate_id=candidate_id,
            job_id=job_id,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            context=notification_context,
            actor_id=actor_id,
        )
        await db.commit()
    except Exception as exc:
        logger.warning(
            "notification_commit_failed event=%s candidate=%s: %s",
            event_type,
            candidate_id,
            exc,
        )
        await db.rollback()
