"""Repository for communication templates, messages, and delivery attempts."""

from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models import (
    CandidateCommunicationModel,
    CommunicationDeliveryAttemptModel,
    CommunicationTemplateModel,
)


class SQLAlchemyCommunicationRepository:
    """Repository for communication operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ============== CommunicationTemplate methods ==============

    async def get_template_by_key(self, key: str) -> CommunicationTemplateModel | None:
        """Get template by unique key."""
        stmt = sa.select(CommunicationTemplateModel).where(
            CommunicationTemplateModel.key == key
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_template_by_id(self, template_id: UUID) -> CommunicationTemplateModel | None:
        """Get template by ID."""
        return await self.session.get(CommunicationTemplateModel, template_id)

    async def list_templates(
        self, status: str | None = None
    ) -> list[CommunicationTemplateModel]:
        """List templates, optionally filtered by status."""
        stmt = sa.select(CommunicationTemplateModel).order_by(
            CommunicationTemplateModel.created_at
        )
        if status:
            stmt = stmt.where(CommunicationTemplateModel.status == status)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create_template(
        self,
        key: str,
        channel: str,
        audience: str,
        body_template: str,
        subject_template: str | None = None,
        status: str = "active",
    ) -> CommunicationTemplateModel:
        """Create a communication template."""
        template = CommunicationTemplateModel(
            key=key,
            channel=channel,
            audience=audience,
            body_template=body_template,
            subject_template=subject_template,
            status=status,
        )
        self.session.add(template)
        await self.session.flush()
        return template

    async def update_template(
        self,
        template_id: UUID,
        key: str | None = None,
        channel: str | None = None,
        audience: str | None = None,
        body_template: str | None = None,
        subject_template: str | None = None,
        status: str | None = None,
    ) -> CommunicationTemplateModel:
        """Update a communication template."""
        template = await self.get_template_by_id(template_id)
        if not template:
            raise ValueError(f"Template {template_id} not found")

        if key is not None:
            template.key = key
        if channel is not None:
            template.channel = channel
        if audience is not None:
            template.audience = audience
        if body_template is not None:
            template.body_template = body_template
        if subject_template is not None:
            template.subject_template = subject_template
        if status is not None:
            template.status = status

        template.updated_at = datetime.now(UTC)
        await self.session.flush()
        return template

    # ============== CandidateCommunication methods ==============

    async def get_communication_by_id(
        self, communication_id: UUID
    ) -> CandidateCommunicationModel | None:
        """Get communication by ID."""
        return await self.session.get(CandidateCommunicationModel, communication_id)

    async def find_existing_communication(
        self,
        candidate_id: UUID,
        related_entity_type: str | None,
        related_entity_id: UUID | None,
        template_key: str | None,
    ) -> CandidateCommunicationModel | None:
        """Check if communication already exists (deduplication).

        Returns the first communication matching all criteria, or None if not found.
        """
        stmt = sa.select(CandidateCommunicationModel).where(
            CandidateCommunicationModel.candidate_id == candidate_id,
            CandidateCommunicationModel.related_entity_type == related_entity_type,
            CandidateCommunicationModel.related_entity_id == related_entity_id,
            CandidateCommunicationModel.template_key == template_key,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_communication(
        self,
        candidate_id: UUID,
        channel: str,
        audience: str,
        body: str,
        job_id: UUID | None = None,
        related_entity_type: str | None = None,
        related_entity_id: UUID | None = None,
        template_key: str | None = None,
        subject: str | None = None,
        status: str = "draft",
        created_by: UUID | None = None,
    ) -> CandidateCommunicationModel:
        """Create a communication message."""
        comm = CandidateCommunicationModel(
            candidate_id=candidate_id,
            job_id=job_id,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            template_key=template_key,
            channel=channel,
            audience=audience,
            subject=subject,
            body=body,
            status=status,
            created_by=created_by,
        )
        self.session.add(comm)
        await self.session.flush()
        return comm

    async def list_for_candidate_audience(
        self, candidate_id: UUID, audience: str = "candidate"
    ) -> list[CandidateCommunicationModel]:
        """List communications for a candidate filtered by audience."""
        stmt = (
            sa.select(CandidateCommunicationModel)
            .where(
                CandidateCommunicationModel.candidate_id == candidate_id,
                CandidateCommunicationModel.audience == audience,
            )
            .order_by(CandidateCommunicationModel.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def list_for_recruiter(
        self, candidate_id: UUID, job_id: UUID | None = None
    ) -> list[CandidateCommunicationModel]:
        """List communications for a candidate (recruiter view, all audiences except candidate)."""
        stmt = sa.select(CandidateCommunicationModel).where(
            CandidateCommunicationModel.candidate_id == candidate_id,
        )
        if job_id:
            stmt = stmt.where(CandidateCommunicationModel.job_id == job_id)
        stmt = stmt.order_by(CandidateCommunicationModel.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def mark_sent(
        self, communication_id: UUID
    ) -> CandidateCommunicationModel:
        """Mark communication as sent."""
        comm = await self.get_communication_by_id(communication_id)
        if not comm:
            raise ValueError(f"Communication {communication_id} not found")

        comm.status = "sent"
        comm.sent_at = datetime.now(UTC)
        comm.queued_at = comm.queued_at or datetime.now(UTC)
        await self.session.flush()
        return comm

    async def mark_failed(
        self, communication_id: UUID, error_message: str | None = None
    ) -> CandidateCommunicationModel:
        """Mark communication as failed."""
        comm = await self.get_communication_by_id(communication_id)
        if not comm:
            raise ValueError(f"Communication {communication_id} not found")

        comm.status = "failed"
        comm.error_message = error_message
        await self.session.flush()
        return comm

    async def mark_read(
        self, communication_id: UUID
    ) -> CandidateCommunicationModel:
        """Mark communication as read."""
        comm = await self.get_communication_by_id(communication_id)
        if not comm:
            raise ValueError(f"Communication {communication_id} not found")

        comm.status = "read"
        comm.read_at = datetime.now(UTC)
        await self.session.flush()
        return comm

    # ============== CommunicationDeliveryAttempt methods ==============

    async def get_delivery_attempt_by_id(
        self, attempt_id: UUID
    ) -> CommunicationDeliveryAttemptModel | None:
        """Get delivery attempt by ID."""
        return await self.session.get(CommunicationDeliveryAttemptModel, attempt_id)

    async def create_delivery_attempt(
        self,
        communication_id: UUID,
        provider: str | None = None,
        status: str = "pending",
        request_payload_json: dict | None = None,
        response_payload_json: dict | None = None,
        error_message: str | None = None,
    ) -> CommunicationDeliveryAttemptModel:
        """Create a delivery attempt log."""
        attempt = CommunicationDeliveryAttemptModel(
            communication_id=communication_id,
            provider=provider,
            status=status,
            request_payload_json=request_payload_json,
            response_payload_json=response_payload_json,
            error_message=error_message,
        )
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def mark_delivery_completed(
        self,
        attempt_id: UUID,
        status: str,
        response_payload_json: dict | None = None,
        error_message: str | None = None,
    ) -> CommunicationDeliveryAttemptModel:
        """Mark delivery attempt as completed."""
        attempt = await self.get_delivery_attempt_by_id(attempt_id)
        if not attempt:
            raise ValueError(f"Delivery attempt {attempt_id} not found")

        attempt.status = status
        attempt.response_payload_json = response_payload_json
        attempt.error_message = error_message
        attempt.completed_at = datetime.now(UTC)
        await self.session.flush()
        return attempt
