from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel


class SQLAlchemyJobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, job: JobModel) -> JobModel:
        self._session.add(job)
        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def find_active_by_id(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel).where(JobModel.id == job_id, JobModel.deleted_at.is_(None))
        )

    async def list_active(self, page: int, page_size: int) -> tuple[list[JobModel], int]:
        total = int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count()).select_from(JobModel).where(JobModel.deleted_at.is_(None))
                )
            )
            or 0
        )
        offset = (page - 1) * page_size
        result = await self._session.execute(
            sa.select(JobModel)
            .where(JobModel.deleted_at.is_(None))
            .order_by(JobModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return list(result.scalars().all()), total

    async def save(self, job: JobModel) -> JobModel:
        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def find_active_skill_by_id(self, skill_id: UUID) -> SkillModel | None:
        return await self._session.scalar(
            sa.select(SkillModel).where(SkillModel.id == skill_id, SkillModel.deleted_at.is_(None))
        )

    async def list_required_skill_rows(self, job_id: UUID):
        result = await self._session.execute(
            sa.select(JobRequiredSkillModel, SkillModel.name.label("skill_name"))
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
            .order_by(JobRequiredSkillModel.is_mandatory.desc(), SkillModel.name.asc())
        )
        return result.all()

    async def find_required_skill_link(
        self,
        job_id: UUID,
        skill_id: UUID,
    ) -> JobRequiredSkillModel | None:
        return await self._session.scalar(
            sa.select(JobRequiredSkillModel).where(
                JobRequiredSkillModel.job_id == job_id,
                JobRequiredSkillModel.skill_id == skill_id,
            )
        )

    async def create_required_skill_link(
        self,
        link: JobRequiredSkillModel,
    ) -> JobRequiredSkillModel:
        self._session.add(link)
        await self._session.flush()
        await self._session.refresh(link)
        return link

    async def delete_required_skill_link(self, link: JobRequiredSkillModel) -> None:
        await self._session.delete(link)
        await self._session.flush()

    async def list_candidate_ranking(self, job_id: UUID) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                CandidateModel.id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.email,
                ResumeJobMatchModel.match_score,
                ResumeJobMatchModel.recommendation,
                AnalysisResultModel.overall_score,
                AnalysisResultModel.seniority_level,
                AnalysisResultModel.total_experience_years,
            )
            .join(AnalysisModel, AnalysisModel.id == ResumeJobMatchModel.analysis_id)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .join(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == AnalysisModel.id,
                isouter=True,
            )
            .where(
                ResumeJobMatchModel.job_id == job_id,
                ResumeModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
            )
            .order_by(ResumeJobMatchModel.match_score.desc().nulls_last())
            .limit(50)
        )
        return [dict(row) for row in result.mappings().all()]
