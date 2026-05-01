from datetime import UTC, datetime
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel


class SQLAlchemyCandidateJobLinkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, link: CandidateJobLinkModel) -> CandidateJobLinkModel:
        """Create a new candidate-job link."""
        self._session.add(link)
        await self._session.flush()
        await self._session.refresh(link)
        return link

    async def get_by_candidate_and_job(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobLinkModel | None:
        """Get the link between a candidate and job (active or deleted)."""
        return await self._session.scalar(
            sa.select(CandidateJobLinkModel).where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.job_id == job_id,
            )
        )

    async def get_active_by_candidate_and_job(
        self,
        candidate_id: UUID,
        job_id: UUID,
    ) -> CandidateJobLinkModel | None:
        """Get the active link between a candidate and job (not deleted)."""
        return await self._session.scalar(
            sa.select(CandidateJobLinkModel).where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.job_id == job_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
        )

    async def list_active_by_job(self, job_id: UUID) -> list[CandidateJobLinkModel]:
        """List all active links for a job (official list of candidates in that job)."""
        result = await self._session.execute(
            sa.select(CandidateJobLinkModel)
            .where(
                CandidateJobLinkModel.job_id == job_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
            .order_by(CandidateJobLinkModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_active_by_candidate(self, candidate_id: UUID) -> list[CandidateJobLinkModel]:
        """List all active links for a candidate (all jobs the candidate is linked to)."""
        result = await self._session.execute(
            sa.select(CandidateJobLinkModel)
            .where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
            .order_by(CandidateJobLinkModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_by_status(self, status: str) -> list[CandidateJobLinkModel]:
        """List all links with a specific status (regardless of deleted_at)."""
        result = await self._session.execute(
            sa.select(CandidateJobLinkModel)
            .where(CandidateJobLinkModel.status == status)
            .order_by(CandidateJobLinkModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def save(self, link: CandidateJobLinkModel) -> CandidateJobLinkModel:
        """Update an existing link."""
        link.updated_at = datetime.now(UTC)
        await self._session.flush()
        await self._session.refresh(link)
        return link

    async def soft_delete(self, candidate_id: UUID, job_id: UUID) -> None:
        """Soft-delete a link by setting deleted_at."""
        link = await self.get_by_candidate_and_job(candidate_id, job_id)
        if link:
            link.deleted_at = datetime.now(UTC)
            link.updated_at = datetime.now(UTC)
            await self._session.flush()

    async def restore(self, candidate_id: UUID, job_id: UUID) -> CandidateJobLinkModel | None:
        """Restore a soft-deleted link."""
        link = await self.get_by_candidate_and_job(candidate_id, job_id)
        if link:
            link.deleted_at = None
            link.updated_at = datetime.now(UTC)
            await self._session.flush()
            await self._session.refresh(link)
            return link
        return None

    async def update_status(
        self,
        candidate_id: UUID,
        job_id: UUID,
        status: str,
    ) -> CandidateJobLinkModel | None:
        """Update the status of a link."""
        link = await self.get_by_candidate_and_job(candidate_id, job_id)
        if link:
            link.status = status
            link.updated_at = datetime.now(UTC)
            await self._session.flush()
            await self._session.refresh(link)
            return link
        return None

    async def count_active_for_job(self, job_id: UUID) -> int:
        """Count active links for a job."""
        return await self._session.scalar(
            sa.select(sa.func.count(CandidateJobLinkModel.id)).where(
                CandidateJobLinkModel.job_id == job_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
        ) or 0

    async def count_active_for_candidate(self, candidate_id: UUID) -> int:
        """Count active links for a candidate."""
        return await self._session.scalar(
            sa.select(sa.func.count(CandidateJobLinkModel.id)).where(
                CandidateJobLinkModel.candidate_id == candidate_id,
                CandidateJobLinkModel.deleted_at.is_(None),
            )
        ) or 0
