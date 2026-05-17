"""Service for communication templates, messages, and delivery."""

import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.repositories.sqlalchemy_communication_repository import (
    SQLAlchemyCommunicationRepository,
)

logger = logging.getLogger(__name__)


class SafeDict(dict):
    """Dict that returns '{key}' for missing keys instead of raising KeyError.

    Used for safe template rendering where missing placeholders should not crash.
    """

    def __missing__(self, key):
        return "{" + key + "}"


class CommunicationService:
    """Service for communication operations."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = SQLAlchemyCommunicationRepository(session)

    async def notify_event(
        self,
        event_type: str,
        candidate_id: UUID,
        job_id: UUID | None = None,
        related_entity_type: str | None = None,
        related_entity_id: UUID | None = None,
        context: dict | None = None,
        actor_id: UUID | None = None,
    ) -> None:
        """Notify about an event.

        Fire-and-forget: NEVER raises exceptions. Logs warnings if notification fails.

        Args:
            event_type: Template key (e.g., 'candidate_applied', 'interview_scheduled')
            candidate_id: Target candidate UUID
            job_id: Related job UUID (optional)
            related_entity_type: Entity type for deduplication (optional)
            related_entity_id: Entity ID for deduplication (optional)
            context: Dict of variables for template rendering (e.g., {'candidate_name': '...', 'job_title': '...'})
            actor_id: User who triggered the event (optional)
        """
        try:
            await self._notify_internal(
                event_type=event_type,
                candidate_id=candidate_id,
                job_id=job_id,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
                context=context or {},
                actor_id=actor_id,
            )
        except Exception as e:
            logger.warning(
                f"notification_failed event={event_type} candidate={candidate_id}: {e}"
            )

    async def _notify_internal(
        self,
        event_type: str,
        candidate_id: UUID,
        job_id: UUID | None,
        related_entity_type: str | None,
        related_entity_id: UUID | None,
        context: dict,
        actor_id: UUID | None,
    ) -> None:
        """Internal notification logic. Raises on error."""
        # Load template
        template = await self.repository.get_template_by_key(event_type)
        if not template:
            logger.debug(f"notification_no_template event={event_type}")
            return

        # Check deduplication
        existing = await self.repository.find_existing_communication(
            candidate_id=candidate_id,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            template_key=event_type,
        )
        if existing:
            logger.debug(
                f"notification_already_exists event={event_type} candidate={candidate_id}"
            )
            return

        # Render template
        subject = self._render(template.subject_template or "", context) if template.subject_template else None
        body = self._render(template.body_template, context)

        # Create communication
        comm = await self.repository.create_communication(
            candidate_id=candidate_id,
            job_id=job_id,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            template_key=event_type,
            channel=template.channel,
            audience=template.audience,
            subject=subject,
            body=body,
            status="draft",
            created_by=actor_id,
        )

        # Deliver
        await self._deliver(comm)

    def _render(self, template_str: str, context: dict) -> str:
        """Render template with context.

        Missing keys return '{key}' format, preventing KeyError.
        """
        safe_context = SafeDict(context)
        return template_str.format_map(safe_context)

    async def _deliver(self, comm) -> None:
        """Deliver communication using configured provider.

        Currently only supports mock provider (marks sent immediately).
        """
        from datetime import UTC, datetime

        # Mock provider: mark sent immediately
        await self.repository.mark_sent(comm.id)

        # Log delivery with completion
        attempt = await self.repository.create_delivery_attempt(
            communication_id=comm.id,
            provider="mock",
            status="sent",
        )

        # Mark delivery attempt as completed (mock provider completes immediately)
        attempt.completed_at = datetime.now(UTC)
        await self.session.flush()

    async def retry_communication(
        self, communication_id: UUID, user_id: UUID | None = None
    ) -> None:
        """Retry a failed or queued communication.

        Only allows retry if status is in {failed, queued, draft}.
        """
        comm = await self.repository.get_communication_by_id(communication_id)
        if not comm:
            raise ValueError(f"Communication {communication_id} not found")

        if comm.status not in ("failed", "queued", "draft"):
            raise ValueError(
                f"Cannot retry communication with status '{comm.status}'. "
                f"Only failed, queued, or draft can be retried."
            )

        # Reset to draft and re-deliver
        comm.status = "draft"
        comm.error_message = None
        await self.session.flush()

        await self._deliver(comm)

    async def mark_read(
        self, communication_id: UUID, candidate_id: UUID
    ) -> None:
        """Mark communication as read.

        Validates that the communication belongs to the candidate.
        """
        comm = await self.repository.get_communication_by_id(communication_id)
        if not comm:
            raise ValueError(f"Communication {communication_id} not found")

        if comm.candidate_id != candidate_id:
            raise ValueError(
                f"Communication {communication_id} does not belong to candidate {candidate_id}"
            )

        await self.repository.mark_read(communication_id)

    async def list_for_candidate(
        self, candidate_id: UUID, audience: str = "candidate"
    ) -> list:
        """List communications for a candidate."""
        return await self.repository.list_for_candidate_audience(candidate_id, audience)

    async def list_for_recruiter(
        self, candidate_id: UUID, job_id: UUID | None = None
    ) -> list:
        """List communications for a candidate (recruiter view)."""
        return await self.repository.list_for_recruiter(candidate_id, job_id)

    async def list_templates(self, status: str | None = None) -> list:
        """List communication templates."""
        return await self.repository.list_templates(status)

    async def create_template(
        self,
        key: str,
        channel: str,
        audience: str,
        body_template: str,
        subject_template: str | None = None,
        status: str = "active",
    ):
        """Create a communication template."""
        return await self.repository.create_template(
            key=key,
            channel=channel,
            audience=audience,
            body_template=body_template,
            subject_template=subject_template,
            status=status,
        )

    async def update_template(
        self,
        template_id: UUID,
        key: str | None = None,
        channel: str | None = None,
        audience: str | None = None,
        body_template: str | None = None,
        subject_template: str | None = None,
        status: str | None = None,
    ):
        """Update a communication template."""
        return await self.repository.update_template(
            template_id=template_id,
            key=key,
            channel=channel,
            audience=audience,
            body_template=body_template,
            subject_template=subject_template,
            status=status,
        )

    async def send_custom_message(
        self,
        candidate_id: UUID,
        job_id: UUID,
        subject: str,
        body: str,
        channel: str = "email",
        audience: str = "candidate",
        created_by: UUID | None = None,
    ):
        """Create and deliver a custom communication message to the candidate."""
        comm = await self.repository.create_communication(
            candidate_id=candidate_id,
            job_id=job_id,
            channel=channel,
            audience=audience,
            body=body,
            subject=subject,
            template_key="custom_message",
            status="draft",
            created_by=created_by,
        )
        await self._deliver(comm)
        return comm
