from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_job_link_model import CandidateJobLinkModel
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

    async def find_active_by_identity(
        self,
        *,
        title: str,
        job_area: str | None,
        location: str | None,
    ) -> JobModel | None:
        normalized_title = title.strip().lower()
        normalized_job_area = (job_area or "").strip().lower()
        normalized_location = (location or "").strip().lower()
        return await self._session.scalar(
            sa.select(JobModel).where(
                JobModel.deleted_at.is_(None),
                sa.func.lower(sa.func.trim(JobModel.title)) == normalized_title,
                sa.func.lower(sa.func.trim(sa.func.coalesce(JobModel.job_area, ""))) == normalized_job_area,
                sa.func.lower(sa.func.trim(sa.func.coalesce(JobModel.location, ""))) == normalized_location,
            )
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
            sa.select(
                JobRequiredSkillModel,
                SkillModel.name.label("skill_name"),
                SkillModel.normalized_name.label("skill_normalized_name"),
                SkillModel.category.label("skill_category"),
                SkillModel.aliases.label("skill_aliases"),
            )
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
        """List candidates linked to a job (official source: candidate_job_links).

        Uses CandidateJobLinkModel as source of truth. Optionally enriches with
        ResumeJobMatch and AnalysisResult scores if available.
        """
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
            # Source of truth: candidate_job_links
            .join(CandidateJobLinkModel, (CandidateJobLinkModel.candidate_id == CandidateModel.id) & (CandidateJobLinkModel.job_id == job_id))
            # Enrichment: latest ResumeJobMatch for this (candidate, job)
            .join(
                ResumeJobMatchModel,
                (ResumeJobMatchModel.job_id == job_id) & (ResumeJobMatchModel.analysis_id == sa.select(AnalysisModel.id)
                    .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
                    .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
                    .where(ResumeModel.candidate_id == CandidateModel.id)
                    .order_by(AnalysisModel.updated_at.desc())
                    .limit(1)
                    .scalar_subquery()),
                isouter=True,
            )
            .join(
                AnalysisModel,
                AnalysisModel.id == ResumeJobMatchModel.analysis_id,
                isouter=True,
            )
            .join(
                AnalysisResultModel,
                AnalysisResultModel.analysis_id == AnalysisModel.id,
                isouter=True,
            )
            .where(
                CandidateJobLinkModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
            )
            .order_by(ResumeJobMatchModel.match_score.desc().nulls_last())
            .limit(50)
        )
        return [dict(row) for row in result.mappings().all()]

    async def list_completed_unmatched_analyses(
        self,
        job_id: UUID,
        limit: int | None = None,
    ) -> list[AnalysisModel]:
        """List all completed analyses that haven't been matched to this job yet.

        CRITICAL: Only returns analyses for candidates with active CandidateJobLinkModel
        to the specified job (official source of truth for candidate-job linking).
        """
        query = (
            sa.select(AnalysisModel)
            .join(
                ResumeVersionModel,
                ResumeVersionModel.id == AnalysisModel.resume_version_id,
            )
            .join(
                ResumeModel,
                ResumeModel.id == ResumeVersionModel.resume_id,
            )
            # Validate official candidate-job link exists (source of truth)
            .join(
                CandidateJobLinkModel,
                sa.and_(
                    CandidateJobLinkModel.candidate_id == ResumeModel.candidate_id,
                    CandidateJobLinkModel.job_id == job_id,
                    CandidateJobLinkModel.deleted_at.is_(None),
                ),
            )
            .where(
                AnalysisModel.status == "completed",
                ~sa.exists(
                    sa.select(1).where(
                        ResumeJobMatchModel.analysis_id == AnalysisModel.id,
                        ResumeJobMatchModel.job_id == job_id,
                    )
                ),
            )
            .order_by(AnalysisModel.created_at.desc())
        )
        if limit:
            query = query.limit(limit)

        result = await self._session.execute(query)
        return list(result.scalars().all())
