from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.job_model import (
    JobModel,
    JobRequiredSkillModel,
    JobUnitModel,
    SkillModel,
)
from src.infrastructure.database.models.operational_master_model import (
    LocationGroupModel,
    OperationalGroupModel,
    OperationalUnitModel,
)
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.repositories.base_soft_delete_repository import BaseSoftDeleteRepository


class SQLAlchemyJobRepository(BaseSoftDeleteRepository[JobModel]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, JobModel)

    def _build_filters(
        self,
        *,
        search: str | None = None,
        status: str | None = None,
        job_area: str | None = None,
        work_model: str | None = None,
        operational_group_id: UUID | None = None,
        location_group_id: UUID | None = None,
        allocation_mode: str | None = None,
        include_status: bool = True,
    ) -> list:
        filters: list = [JobModel.deleted_at.is_(None)]

        if search:
            normalized = f"%{search.strip().lower()}%"
            filters.append(
                sa.or_(
                    sa.func.lower(JobModel.title).like(normalized),
                    sa.func.lower(sa.func.coalesce(JobModel.location, "")).like(normalized),
                    sa.func.lower(sa.func.coalesce(JobModel.job_area, "")).like(normalized),
                    sa.func.lower(sa.func.coalesce(JobModel.work_model, "")).like(normalized),
                    sa.func.lower(sa.func.coalesce(JobModel.seniority_level, "")).like(normalized),
                )
            )

        if job_area:
            filters.append(JobModel.job_area == job_area)

        if work_model:
            filters.append(JobModel.work_model == work_model)

        if operational_group_id is not None:
            filters.append(JobModel.operational_group_id == operational_group_id)

        if location_group_id is not None:
            filters.append(JobModel.location_group_id == location_group_id)

        if allocation_mode:
            filters.append(JobModel.allocation_mode == allocation_mode)

        if include_status:
            if status:
                filters.append(JobModel.status == status)
            else:
                filters.append(JobModel.status != "archived")

        return filters

    async def create(self, job: JobModel) -> JobModel:
        self._session.add(job)
        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def find_active_by_id(self, job_id: UUID) -> JobModel | None:
        return await self._session.scalar(
            sa.select(JobModel)
            .options(selectinload(JobModel.job_units))
            .where(JobModel.id == job_id, JobModel.deleted_at.is_(None))
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
                sa.func.lower(sa.func.trim(sa.func.coalesce(JobModel.job_area, "")))
                == normalized_job_area,
                sa.func.lower(sa.func.trim(sa.func.coalesce(JobModel.location, "")))
                == normalized_location,
            )
        )

    async def list_active(
        self,
        page: int,
        page_size: int,
        *,
        search: str | None = None,
        status: str | None = None,
        job_area: str | None = None,
        work_model: str | None = None,
        operational_group_id: UUID | None = None,
        location_group_id: UUID | None = None,
        operational_unit_id: UUID | None = None,
        allocation_mode: str | None = None,
    ) -> tuple[list[JobModel], int, dict[str, int]]:
        filters = self._build_filters(
            search=search,
            status=status,
            job_area=job_area,
            work_model=work_model,
            operational_group_id=operational_group_id,
            location_group_id=location_group_id,
            allocation_mode=allocation_mode,
        )
        count_stmt = sa.select(sa.func.count(sa.distinct(JobModel.id))).select_from(JobModel)
        if operational_unit_id is not None:
            count_stmt = count_stmt.join(JobUnitModel, JobUnitModel.job_id == JobModel.id)
            filters.append(
                sa.and_(
                    JobUnitModel.operational_unit_id == operational_unit_id,
                    JobUnitModel.is_active.is_(True),
                )
            )
        total = int((await self._session.scalar(count_stmt.where(*filters))) or 0)
        offset = (page - 1) * page_size
        list_stmt = sa.select(JobModel).options(selectinload(JobModel.job_units))
        if operational_unit_id is not None:
            list_stmt = list_stmt.join(JobUnitModel, JobUnitModel.job_id == JobModel.id)
        result = await self._session.execute(
            list_stmt.where(*filters)
            .order_by(JobModel.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        summary_filters = self._build_filters(
            search=search,
            job_area=job_area,
            work_model=work_model,
            operational_group_id=operational_group_id,
            location_group_id=location_group_id,
            allocation_mode=allocation_mode,
            include_status=False,
        )
        summary_stmt = sa.select(
            sa.func.count(sa.distinct(JobModel.id)).label("all"),
            sa.func.count(
                sa.distinct(sa.case((JobModel.status == "published", JobModel.id)))
            ).label("published"),
            sa.func.count(sa.distinct(sa.case((JobModel.status == "draft", JobModel.id)))).label(
                "draft"
            ),
            sa.func.count(sa.distinct(sa.case((JobModel.status == "paused", JobModel.id)))).label(
                "paused"
            ),
            sa.func.count(sa.distinct(sa.case((JobModel.status == "closed", JobModel.id)))).label(
                "closed"
            ),
            sa.func.count(
                sa.distinct(sa.case((JobModel.status == "cancelled", JobModel.id)))
            ).label("cancelled"),
            sa.func.count(sa.distinct(sa.case((JobModel.status == "archived", JobModel.id)))).label(
                "archived"
            ),
            sa.func.count(
                sa.distinct(
                    sa.case((JobModel.quality_status.in_(["weak", "acceptable"]), JobModel.id))
                )
            ).label("attention"),
        ).select_from(JobModel)
        if operational_unit_id is not None:
            summary_stmt = summary_stmt.join(JobUnitModel, JobUnitModel.job_id == JobModel.id)
            summary_filters.append(
                sa.and_(
                    JobUnitModel.operational_unit_id == operational_unit_id,
                    JobUnitModel.is_active.is_(True),
                )
            )
        summary_row = (
            (await self._session.execute(summary_stmt.where(*summary_filters))).mappings().one()
        )

        summary = {
            "all": int(summary_row["all"] or 0),
            "published": int(summary_row["published"] or 0),
            "draft": int(summary_row["draft"] or 0),
            "paused": int(summary_row["paused"] or 0),
            "closed": int(summary_row["closed"] or 0),
            "cancelled": int(summary_row["cancelled"] or 0),
            "archived": int(summary_row["archived"] or 0),
            "attention": int(summary_row["attention"] or 0),
        }

        return list(result.scalars().unique().all()), total, summary

    async def save(self, job: JobModel) -> JobModel:
        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def find_active_operational_group_by_id(
        self,
        group_id: UUID,
    ) -> OperationalGroupModel | None:
        return await self._session.scalar(
            sa.select(OperationalGroupModel).where(
                OperationalGroupModel.id == group_id,
                OperationalGroupModel.is_active.is_(True),
            )
        )

    async def find_active_location_group_by_id(
        self,
        location_group_id: UUID,
    ) -> LocationGroupModel | None:
        return await self._session.scalar(
            sa.select(LocationGroupModel).where(
                LocationGroupModel.id == location_group_id,
                LocationGroupModel.is_active.is_(True),
            )
        )

    async def find_active_operational_unit_ids(self, unit_ids: set[UUID]) -> set[UUID]:
        if not unit_ids:
            return set()
        result = await self._session.execute(
            sa.select(OperationalUnitModel.id).where(
                OperationalUnitModel.id.in_(unit_ids),
                OperationalUnitModel.is_active.is_(True),
            )
        )
        return set(result.scalars().all())

    async def find_active_operational_units_by_ids(
        self,
        unit_ids: set[UUID],
    ) -> list[OperationalUnitModel]:
        if not unit_ids:
            return []
        result = await self._session.execute(
            sa.select(OperationalUnitModel).where(
                OperationalUnitModel.id.in_(unit_ids),
                OperationalUnitModel.is_active.is_(True),
            )
        )
        return list(result.scalars().all())

    async def replace_job_units(self, job_id: UUID, unit_rows: list[dict]) -> None:
        await self._session.execute(sa.delete(JobUnitModel).where(JobUnitModel.job_id == job_id))
        created_units: list[JobUnitModel] = []
        for unit_row in unit_rows:
            job_unit = JobUnitModel(job_id=job_id, **unit_row)
            self._session.add(job_unit)
            created_units.append(job_unit)
        await self._session.flush()
        job = await self._session.get(JobModel, job_id)
        if job is not None:
            set_committed_value(job, "job_units", created_units)

    async def find_active_skill_by_id(self, skill_id: UUID) -> SkillModel | None:
        return await self._session.scalar(
            sa.select(SkillModel).where(SkillModel.id == skill_id, SkillModel.deleted_at.is_(None))
        )

    async def find_active_skill_by_normalized_name(self, normalized_name: str) -> SkillModel | None:
        return await self._session.scalar(
            sa.select(SkillModel).where(
                SkillModel.normalized_name == normalized_name,
                SkillModel.deleted_at.is_(None),
            )
        )

    async def create_skill(self, skill: SkillModel) -> SkillModel:
        self._session.add(skill)
        await self._session.flush()
        await self._session.refresh(skill)
        return skill

    async def list_required_skill_rows(self, job_id: UUID):
        result = await self._session.execute(
            sa.select(
                JobRequiredSkillModel,
                SkillModel.name.label("skill_name"),
                SkillModel.normalized_name.label("skill_normalized_name"),
            )
            .join(SkillModel, JobRequiredSkillModel.skill_id == SkillModel.id)
            .where(JobRequiredSkillModel.job_id == job_id, SkillModel.deleted_at.is_(None))
            .order_by(
                sa.case(
                    (JobRequiredSkillModel.priority_level == "eliminatory", 0),
                    (JobRequiredSkillModel.priority_level == "priority", 1),
                    else_=2,
                ),
                SkillModel.name.asc(),
            )
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

    async def find_required_skill_link_by_id(
        self,
        job_id: UUID,
        link_id: UUID,
    ) -> JobRequiredSkillModel | None:
        return await self._session.scalar(
            sa.select(JobRequiredSkillModel).where(
                JobRequiredSkillModel.job_id == job_id,
                JobRequiredSkillModel.id == link_id,
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

    async def list_completed_unmatched_analyses(
        self,
        job_id: UUID,
        limit: int | None = None,
    ) -> list[AnalysisModel]:
        """List all completed analyses that haven't been matched to this job yet."""
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
            .join(
                CandidateJobPipelineModel,
                sa.and_(
                    CandidateJobPipelineModel.candidate_id == ResumeModel.candidate_id,
                    CandidateJobPipelineModel.job_id == job_id,
                    CandidateJobPipelineModel.pipeline_status == "active",
                    CandidateJobPipelineModel.relationship_status == "active",
                    CandidateJobPipelineModel.is_terminal.is_(False),
                    CandidateJobPipelineModel.terminated_at.is_(None),
                ),
            )
            .where(
                AnalysisModel.status == "completed",
                ~sa.exists(
                    sa.select(1).where(
                        CandidateJobMatchModel.candidate_id == ResumeModel.candidate_id,
                        CandidateJobMatchModel.resume_version_id == AnalysisModel.resume_version_id,
                        CandidateJobMatchModel.job_id == job_id,
                    )
                ),
            )
            .order_by(AnalysisModel.created_at.desc())
        )
        if limit:
            query = query.limit(limit)

        result = await self._session.execute(query)
        return list(result.scalars().all())

    async def list_published(self, *, limit: int = 50, offset: int = 0) -> list[JobModel]:
        """Lista vagas com status='published' e não deletadas, com paginação."""
        result = await self._session.execute(
            sa.select(JobModel)
            .where(
                JobModel.status == "published",
                JobModel.deleted_at.is_(None),
            )
            .order_by(JobModel.title.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_behavioral_template_summary(self, template_id: UUID) -> dict | None:
        """Return status + structure counters for a behavioral template."""
        stmt = (
            sa.select(
                BehavioralAssessmentTemplateModel.id.label("id"),
                BehavioralAssessmentTemplateModel.status.label("status"),
                sa.func.count(sa.distinct(BehavioralTemplateCompetencyModel.id)).label(
                    "competency_count"
                ),
                sa.func.count(sa.distinct(BehavioralTemplateQuestionModel.id)).label(
                    "question_count"
                ),
            )
            .outerjoin(
                BehavioralTemplateCompetencyModel,
                BehavioralTemplateCompetencyModel.template_id
                == BehavioralAssessmentTemplateModel.id,
            )
            .outerjoin(
                BehavioralTemplateQuestionModel,
                BehavioralTemplateQuestionModel.competency_id
                == BehavioralTemplateCompetencyModel.id,
            )
            .where(BehavioralAssessmentTemplateModel.id == template_id)
            .group_by(
                BehavioralAssessmentTemplateModel.id, BehavioralAssessmentTemplateModel.status
            )
        )
        result = await self._session.execute(stmt)
        row = result.mappings().first()
        if row is None:
            return None
        return {
            "id": row["id"],
            "status": row["status"],
            "competency_count": int(row["competency_count"] or 0),
            "question_count": int(row["question_count"] or 0),
        }
