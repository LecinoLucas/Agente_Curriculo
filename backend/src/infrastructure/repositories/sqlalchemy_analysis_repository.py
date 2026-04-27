from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel


class SQLAlchemyAnalysisRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @property
    def session(self) -> AsyncSession:
        return self._session

    async def find_resume_version_for_user(
        self,
        resume_version_id: UUID,
        current_user: User,
    ) -> ResumeVersionModel | None:
        query = (
            sa.select(ResumeVersionModel)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .where(
                ResumeVersionModel.id == resume_version_id,
                ResumeModel.deleted_at.is_(None),
                CandidateModel.deleted_at.is_(None),
            )
        )
        if not self._can_manage_all(current_user):
            query = query.where(CandidateModel.user_id == current_user.id)

        return await self._session.scalar(query)

    async def find_preferred_ai_model(self) -> AIModelModel | None:
        model = await self._session.scalar(
            sa.select(AIModelModel)
            .where(AIModelModel.is_active.is_(True))
            .order_by(AIModelModel.activated_at.desc())
        )
        if model is not None:
            return model
        return await self._session.scalar(
            sa.select(AIModelModel).order_by(AIModelModel.created_at.desc())
        )

    async def find_preferred_prompt_template(self) -> PromptTemplateModel | None:
        template = await self._session.scalar(
            sa.select(PromptTemplateModel)
            .where(PromptTemplateModel.is_active.is_(True))
            .order_by(PromptTemplateModel.activated_at.desc())
        )
        if template is not None:
            return template
        return await self._session.scalar(
            sa.select(PromptTemplateModel).order_by(PromptTemplateModel.created_at.desc())
        )

    async def create(self, analysis: AnalysisModel) -> AnalysisModel:
        self._session.add(analysis)
        await self._session.flush()
        await self._session.refresh(analysis)
        return analysis

    async def list_for_user(
        self,
        current_user: User,
        page: int,
        page_size: int,
        status_filter: str | None,
    ) -> tuple[list[AnalysisModel], int]:
        conditions: list[sa.ColumnElement[bool]] = []
        if not self._can_manage_all(current_user):
            conditions.append(AnalysisModel.requested_by == current_user.id)
        if status_filter is not None:
            conditions.append(AnalysisModel.status == status_filter)

        base_query = sa.select(AnalysisModel)
        count_query = sa.select(sa.func.count()).select_from(AnalysisModel)
        if conditions:
            base_query = base_query.where(*conditions)
            count_query = count_query.where(*conditions)

        total = int((await self._session.scalar(count_query)) or 0)
        offset = (page - 1) * page_size
        result = await self._session.execute(
            base_query.order_by(AnalysisModel.created_at.desc()).offset(offset).limit(page_size)
        )
        return list(result.scalars().all()), total

    async def find_for_user(self, analysis_id: UUID, current_user: User) -> AnalysisModel | None:
        query = sa.select(AnalysisModel).where(AnalysisModel.id == analysis_id)
        if not self._can_manage_all(current_user):
            query = query.where(AnalysisModel.requested_by == current_user.id)
        return await self._session.scalar(query)

    async def find_completed(self, analysis_id: UUID) -> AnalysisModel | None:
        return await self._session.scalar(
            sa.select(AnalysisModel).where(
                AnalysisModel.id == analysis_id,
                AnalysisModel.status == "completed",
            )
        )

    async def find_result(self, analysis_id: UUID) -> AnalysisResultModel | None:
        return await self._session.scalar(
            sa.select(AnalysisResultModel).where(AnalysisResultModel.analysis_id == analysis_id)
        )

    async def list_global(
        self,
        page: int,
        page_size: int,
        status_filter: str | None = None,
        search: str | None = None,
        used_real_ai: bool | None = None,
    ) -> tuple[list[dict], int]:
        total_tokens_expr = (
            sa.func.coalesce(AnalysisResultModel.input_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.output_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_read_tokens, 0)
            + sa.func.coalesce(AnalysisResultModel.cache_write_tokens, 0)
        )
        used_real_ai_expr = sa.case(
            (AnalysisResultModel.id.is_(None), None),
            (total_tokens_expr > 0, True),
            else_=False,
        ).label("used_real_ai")

        # Admin view — intentionally includes analyses for soft-deleted candidates/resumes.
        filters: list[sa.ColumnElement] = []
        if status_filter:
            filters.append(AnalysisModel.status == status_filter)
        if search:
            term = f"%{search.lower().strip()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(CandidateModel.full_name).like(term),
                    sa.func.lower(CandidateModel.email).like(term),
                )
            )
        if used_real_ai is True:
            filters.append(
                sa.and_(AnalysisResultModel.id.is_not(None), total_tokens_expr > 0)
            )
        elif used_real_ai is False:
            filters.append(
                sa.and_(AnalysisResultModel.id.is_not(None), total_tokens_expr == 0)
            )

        joins = (
            sa.select(sa.func.count())
            .select_from(AnalysisModel)
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .outerjoin(AnalysisResultModel, AnalysisResultModel.analysis_id == AnalysisModel.id)
        )
        total = int((await self._session.scalar(joins.where(*filters))) or 0)

        offset = (page - 1) * page_size
        result = await self._session.execute(
            sa.select(
                AnalysisModel.id,
                AnalysisModel.resume_version_id,
                AnalysisModel.status,
                AnalysisModel.failure_reason,
                AnalysisModel.retry_count,
                AnalysisModel.created_at,
                AnalysisModel.started_at,
                AnalysisModel.completed_at,
                AnalysisModel.failed_at,
                CandidateModel.id.label("candidate_id"),
                CandidateModel.full_name.label("candidate_name"),
                CandidateModel.email.label("candidate_email"),
                ResumeVersionModel.original_file_name.label("resume_file_name"),
                used_real_ai_expr,
                AnalysisResultModel.overall_score,
            )
            .join(ResumeVersionModel, ResumeVersionModel.id == AnalysisModel.resume_version_id)
            .join(ResumeModel, ResumeModel.id == ResumeVersionModel.resume_id)
            .join(CandidateModel, CandidateModel.id == ResumeModel.candidate_id)
            .outerjoin(AnalysisResultModel, AnalysisResultModel.analysis_id == AnalysisModel.id)
            .where(*filters)
            .order_by(AnalysisModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        return [dict(row) for row in result.mappings().all()], total

    async def find_active_job(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel).where(JobModel.id == job_id, JobModel.deleted_at.is_(None))
        )

    async def list_active_job_skill_rows(self, job_id: UUID):
        result = await self._session.execute(
            sa.select(JobRequiredSkillModel, SkillModel.name.label("skill_name"))
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
        )
        return result.all()

    async def list_unmatched_published_jobs(
        self,
        analysis_id: UUID,
        limit: int | None = None,
    ) -> list[JobModel]:
        query = (
            sa.select(JobModel)
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
                ~sa.exists(
                    sa.select(1)
                    .select_from(ResumeJobMatchModel)
                    .where(
                        ResumeJobMatchModel.analysis_id == analysis_id,
                        ResumeJobMatchModel.job_id == JobModel.id,
                    )
                ),
            )
            .order_by(JobModel.created_at.desc())
        )
        if limit is not None and limit > 0:
            query = query.limit(limit)

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def list_published_jobs(self) -> list[JobModel]:
        result = await self._session.execute(
            sa.select(JobModel)
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
            )
            .order_by(JobModel.created_at.desc())
        )
        return list(result.scalars().all())

    async def count_published_jobs(self) -> int:
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(JobModel)
                    .where(
                        JobModel.status == "published",
                        JobModel.deleted_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def count_published_matches_for_analysis(self, analysis_id: UUID) -> int:
        return int(
            (
                await self._session.scalar(
                    sa.select(sa.func.count())
                    .select_from(ResumeJobMatchModel)
                    .join(JobModel, JobModel.id == ResumeJobMatchModel.job_id)
                    .where(
                        ResumeJobMatchModel.analysis_id == analysis_id,
                        JobModel.status == "published",
                        JobModel.deleted_at.is_(None),
                    )
                )
            )
            or 0
        )

    async def list_recent_job_matches_for_analysis(
        self,
        analysis_id: UUID,
        limit: int = 5,
    ) -> list[dict]:
        result = await self._session.execute(
            sa.select(
                ResumeJobMatchModel.job_id,
                JobModel.title.label("job_title"),
                JobModel.status.label("job_status"),
                ResumeJobMatchModel.match_score,
                ResumeJobMatchModel.recommendation,
                ResumeJobMatchModel.created_at,
            )
            .join(JobModel, JobModel.id == ResumeJobMatchModel.job_id)
            .where(
                ResumeJobMatchModel.analysis_id == analysis_id,
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
            )
            .order_by(
                ResumeJobMatchModel.match_score.desc().nulls_last(),
                ResumeJobMatchModel.created_at.desc(),
            )
            .limit(limit)
        )
        return [dict(row) for row in result.mappings().all()]

    async def find_job_match(
        self,
        analysis_id: UUID,
        job_id: UUID,
    ) -> ResumeJobMatchModel | None:
        return await self._session.scalar(
            sa.select(ResumeJobMatchModel).where(
                ResumeJobMatchModel.analysis_id == analysis_id,
                ResumeJobMatchModel.job_id == job_id,
            )
        )

    async def save_job_match(self, match: ResumeJobMatchModel) -> ResumeJobMatchModel:
        self._session.add(match)
        await self._session.flush()
        await self._session.refresh(match)
        return match

    @staticmethod
    def _can_manage_all(user: User) -> bool:
        return user.role.value in {"admin", "recruiter"}
