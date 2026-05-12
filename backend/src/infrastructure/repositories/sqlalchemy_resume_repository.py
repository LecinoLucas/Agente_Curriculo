from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.base_soft_delete_repository import BaseSoftDeleteRepository


class SQLAlchemyResumeRepository(BaseSoftDeleteRepository[ResumeModel]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ResumeModel)

    async def find_candidate_by_user_id(self, user_id: UUID) -> CandidateModel | None:
        """
        Find Candidate linked to a User via user_id.

        This method is part of the candidate portal access mechanism. It allows a User
        with role="candidate" to access their linked Candidate profile and resumes.

        Invariants:
        - Assumes at most 1 Candidate per user_id (enforced by partial UNIQUE index)
        - Used by ResumeService to filter access for candidate portal users
        """
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.user_id == user_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def create_candidate(self, candidate: CandidateModel) -> CandidateModel:
        self._session.add(candidate)
        await self._session.flush()
        await self._session.refresh(candidate)
        return candidate

    async def find_candidate_by_id(self, candidate_id: UUID) -> CandidateModel | None:
        return await self._session.scalar(
            sa.select(CandidateModel).where(
                CandidateModel.id == candidate_id,
                CandidateModel.deleted_at.is_(None),
            )
        )

    async def create_resume(self, resume: ResumeModel) -> ResumeModel:
        self._session.add(resume)
        await self._session.flush()
        await self._session.refresh(resume)
        return resume

    async def create_version(self, version: ResumeVersionModel) -> ResumeVersionModel:
        self._session.add(version)
        await self._session.flush()
        await self._session.refresh(version)
        return version

    async def find_active_resume_by_id(self, resume_id: UUID) -> ResumeModel | None:
        return await self._session.scalar(
            sa.select(ResumeModel).where(
                ResumeModel.id == resume_id,
                ResumeModel.deleted_at.is_(None),
            )
        )

    async def count_summaries(self, candidate_id: UUID | None = None) -> int:
        query = sa.select(sa.func.count()).select_from(ResumeModel).where(ResumeModel.deleted_at.is_(None))
        if candidate_id is not None:
            query = query.where(ResumeModel.candidate_id == candidate_id)
        return await self._session.scalar(query) or 0

    async def list_summaries(
        self, candidate_id: UUID | None = None, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        query = (
            sa.select(
                ResumeModel.id,
                ResumeModel.candidate_id,
                CandidateModel.full_name.label("candidate_name"),
                ResumeModel.title,
                ResumeModel.status,
                ResumeModel.current_version,
                ResumeModel.updated_at,
                ResumeVersionModel.id.label("current_version_id"),
                ResumeVersionModel.original_file_name.label("current_file_name"),
                ResumeVersionModel.extraction_status,
            )
            .join(
                ResumeVersionModel,
                sa.and_(
                    ResumeVersionModel.resume_id == ResumeModel.id,
                    ResumeVersionModel.version_number == ResumeModel.current_version,
                ),
                isouter=True,
            )
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .where(ResumeModel.deleted_at.is_(None))
            .order_by(ResumeModel.updated_at.desc())
        )
        if candidate_id is not None:
            query = query.where(ResumeModel.candidate_id == candidate_id)

        query = query.limit(limit).offset(offset)

        result = await self._session.execute(query)
        return [dict(row) for row in result.mappings().all()]

    async def list_versions(self, resume_id: UUID) -> list[ResumeVersionModel]:
        result = await self._session.execute(
            sa.select(ResumeVersionModel)
            .where(ResumeVersionModel.resume_id == resume_id)
            .order_by(ResumeVersionModel.version_number.desc())
        )
        return list(result.scalars().all())

    async def find_version(self, resume_id: UUID, version_number: int) -> ResumeVersionModel | None:
        return await self._session.scalar(
            sa.select(ResumeVersionModel).where(
                ResumeVersionModel.resume_id == resume_id,
                ResumeVersionModel.version_number == version_number,
            )
        )

    async def find_version_by_id(self, version_id: UUID) -> ResumeVersionModel | None:
        return await self._session.scalar(
            sa.select(ResumeVersionModel).where(
                ResumeVersionModel.id == version_id,
            )
        )

    async def save_resume(self, resume: ResumeModel) -> ResumeModel:
        await self._session.flush()
        await self._session.refresh(resume)
        return resume

    async def save_version(self, version: ResumeVersionModel) -> ResumeVersionModel:
        await self._session.flush()
        await self._session.refresh(version)
        return version

    async def save_candidate(self, candidate: CandidateModel) -> CandidateModel:
        await self._session.flush()
        await self._session.refresh(candidate)
        return candidate
