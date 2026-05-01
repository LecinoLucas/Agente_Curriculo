from datetime import UTC, datetime
from uuid import UUID

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.repositories.sqlalchemy_candidate_job_link_repository import (
    SQLAlchemyCandidateJobLinkRepository,
)
from sqlalchemy.ext.asyncio import AsyncSession


class CandidateNotFoundError(Exception):
    """Raised when candidate is not found."""
    pass


class JobNotFoundError(Exception):
    """Raised when job is not found."""
    pass


class CandidateJobLinkNotFoundError(Exception):
    """Raised when candidate-job link is not found."""
    pass


class CandidateJobLinkService:
    """Service to manage official candidate-job links (source of truth for candidate-job relationships)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._repository = SQLAlchemyCandidateJobLinkRepository(session)

    async def ensure_link(
        self,
        candidate_id: UUID,
        job_id: UUID,
        source: str,
    ) -> CandidateJobLinkModel:
        """Create or reactivate a link. If link exists (even deleted), reactivate it with new source.

        Args:
            candidate_id: UUID of the candidate
            job_id: UUID of the job
            source: Source of the link (manual, pipeline, ai_match, import)

        Returns:
            The created or reactivated link.

        Raises:
            CandidateNotFoundError: If candidate doesn't exist
            JobNotFoundError: If job doesn't exist
        """
        await self._ensure_candidate_exists(candidate_id)
        await self._ensure_job_exists(job_id)

        existing = await self._repository.get_by_candidate_and_job(candidate_id, job_id)
        if existing:
            if existing.deleted_at is None:
                # Link already exists and is active — just update source if different
                if existing.source != source:
                    existing.source = source
                    existing.updated_at = datetime.now(UTC)
                    return await self._repository.save(existing)
                return existing
            else:
                # Link was deleted — restore it
                restored = await self._repository.restore(candidate_id, job_id)
                if restored:
                    restored.source = source
                    restored.status = "active"
                    restored.updated_at = datetime.now(UTC)
                    return await self._repository.save(restored)

        # Create new link
        link = CandidateJobLinkModel(
            candidate_id=candidate_id,
            job_id=job_id,
            status="active",
            source=source,
        )
        return await self._repository.create(link)

    async def link_candidate_to_job(
        self,
        candidate_id: UUID,
        job_id: UUID,
        source: str = "manual",
    ) -> CandidateJobLinkModel:
        """Link a candidate to a job. This is the public API for manual linking.

        Args:
            candidate_id: UUID of the candidate
            job_id: UUID of the job
            source: Source of the link (default: manual)

        Returns:
            The created or reactivated link.
        """
        return await self.ensure_link(candidate_id, job_id, source)

    async def unlink_candidate_from_job(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> None:
        """Soft-delete a link (status remains in DB for audit)."""
        await self._repository.soft_delete(candidate_id, job_id)

    async def update_link_status(
        self,
        candidate_id: UUID,
        job_id: UUID,
        status: str,
    ) -> CandidateJobLinkModel:
        """Update the status of an existing link.

        Args:
            candidate_id: UUID of the candidate
            job_id: UUID of the job
            status: New status (active, removed, transferred, hired, rejected)

        Returns:
            The updated link.

        Raises:
            CandidateJobLinkNotFoundError: If link doesn't exist
        """
        link = await self._repository.update_status(candidate_id, job_id, status)
        if not link:
            raise CandidateJobLinkNotFoundError(
                f"No link found between candidate {candidate_id} and job {job_id}"
            )
        return link

    async def transfer_candidate(
        self,
        candidate_id: UUID,
        from_job_id: UUID,
        to_job_id: UUID,
    ) -> tuple[CandidateJobLinkModel, CandidateJobLinkModel]:
        """Transfer a candidate from one job to another.

        The source link status becomes "transferred" and a new link is created for the destination.

        Args:
            candidate_id: UUID of the candidate
            from_job_id: UUID of the source job
            to_job_id: UUID of the destination job

        Returns:
            Tuple of (updated_source_link, new_destination_link)

        Raises:
            CandidateJobLinkNotFoundError: If source link doesn't exist
        """
        source_link = await self._repository.get_active_by_candidate_and_job(
            candidate_id, from_job_id
        )
        if not source_link:
            raise CandidateJobLinkNotFoundError(
                f"No active link found between candidate {candidate_id} and job {from_job_id}"
            )

        # Mark source as transferred
        source_link.status = "transferred"
        source_link.updated_at = datetime.now(UTC)
        updated_source = await self._repository.save(source_link)

        # Create link at destination
        new_dest_link = await self.ensure_link(candidate_id, to_job_id, source="manual")

        return updated_source, new_dest_link

    async def get_jobs_for_candidate(
        self,
        candidate_id: UUID,
    ) -> list[CandidateJobLinkModel]:
        """Get all active jobs linked to a candidate."""
        return await self._repository.list_active_by_candidate(candidate_id)

    async def get_candidates_for_job(
        self,
        job_id: UUID,
    ) -> list[CandidateJobLinkModel]:
        """Get all active candidates linked to a job. This is the official source of truth."""
        return await self._repository.list_active_by_job(job_id)

    async def candidate_linked_to_job(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> bool:
        """Check if a candidate is actively linked to a job."""
        link = await self._repository.get_active_by_candidate_and_job(candidate_id, job_id)
        return link is not None

    async def _ensure_candidate_exists(self, candidate_id: UUID) -> None:
        """Verify that the candidate exists."""
        candidate = await self._session.scalar(
            __import__("sqlalchemy", fromlist=["select"]).select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )
        if not candidate:
            raise CandidateNotFoundError(f"Candidate {candidate_id} not found")

    async def _ensure_job_exists(self, job_id: UUID) -> None:
        """Verify that the job exists."""
        job = await self._session.scalar(
            __import__("sqlalchemy", fromlist=["select"]).select(JobModel).where(
                JobModel.id == job_id,
                JobModel.deleted_at.is_(None),
            )
        )
        if not job:
            raise JobNotFoundError(f"Job {job_id} not found")
