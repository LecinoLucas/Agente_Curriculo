from datetime import datetime, timezone
from uuid import UUID

from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest
from src.interface.api.schemas.skill_schemas import AddJobSkillRequest, JobRequiredSkillResponse


class JobNotFoundError(Exception):
    pass


class InvalidJobSalaryRangeError(Exception):
    pass


class InvalidJobTextError(Exception):
    pass


class SkillNotFoundError(Exception):
    pass


class JobSkillConflictError(Exception):
    pass


class JobSkillLinkNotFoundError(Exception):
    pass


class JobService:
    def __init__(self, repository: SQLAlchemyJobRepository) -> None:
        self._repository = repository

    async def create(self, body: CreateJobRequest, created_by: UUID) -> JobModel:
        self._validate_salary_range(body.salary_min, body.salary_max)
        title = self._clean_required_text(body.title)
        description = self._clean_required_text(body.description)
        deal_breakers = [db.model_dump(exclude_none=True) for db in body.deal_breakers] if body.deal_breakers else []
        job = JobModel(
            title=title,
            description=description,
            requirements=body.requirements.strip() if body.requirements else None,
            status=body.status,
            seniority_level=body.seniority_level,
            minimum_education_level=body.minimum_education_level,
            minimum_years_experience=body.minimum_years_experience,
            deal_breakers=deal_breakers,
            work_model=body.work_model,
            location=body.location,
            salary_min=body.salary_min,
            salary_max=body.salary_max,
            salary_currency=body.salary_currency.upper(),
            created_by=created_by,
        )
        return await self._repository.create(job)

    async def list(self, page: int, page_size: int) -> tuple[list[JobModel], int]:
        return await self._repository.list_active(page, page_size)

    async def get(self, job_id: UUID) -> JobModel:
        job = await self._repository.find_active_by_id(job_id)
        if job is None:
            raise JobNotFoundError
        return job

    async def update(self, job_id: UUID, body: UpdateJobRequest) -> JobModel:
        job = await self.get(job_id)
        salary_min = body.salary_min if body.salary_min is not None else job.salary_min
        salary_max = body.salary_max if body.salary_max is not None else job.salary_max
        self._validate_salary_range(salary_min, salary_max)

        for field_name in (
            "title",
            "description",
            "requirements",
            "status",
            "seniority_level",
            "minimum_education_level",
            "minimum_years_experience",
            "deal_breakers",
            "work_model",
            "location",
            "salary_min",
            "salary_max",
            "salary_currency",
        ):
            val = getattr(body, field_name, None)
            if val is not None:
                if field_name in {"title", "description"} and isinstance(val, str):
                    val = self._clean_required_text(val)
                if field_name == "salary_currency" and isinstance(val, str):
                    val = val.upper()
                if field_name == "deal_breakers" and isinstance(val, list):
                    val = [db.model_dump(exclude_none=True) for db in val]
                setattr(job, field_name, val)

        if body.status is not None:
            self._set_status(job, body.status)

        job.updated_at = datetime.now(timezone.utc)
        return await self._repository.save(job)

    async def transition_status(self, job_id: UUID, next_status: str) -> JobModel:
        job = await self.get(job_id)
        self._set_status(job, next_status)
        return await self._repository.save(job)

    async def soft_delete(self, job_id: UUID) -> None:
        job = await self.get(job_id)
        now = datetime.now(timezone.utc)
        job.status = "cancelled"
        job.deleted_at = now
        job.updated_at = now
        await self._repository.save(job)

    async def list_required_skills(self, job_id: UUID) -> list[JobRequiredSkillResponse]:
        await self.get(job_id)
        rows = await self._repository.list_required_skill_rows(job_id)
        return [self._required_skill_response(row.JobRequiredSkillModel, row.skill_name) for row in rows]

    async def add_required_skill(self, job_id: UUID, body: AddJobSkillRequest) -> JobRequiredSkillResponse:
        await self.get(job_id)

        skill = await self._repository.find_active_skill_by_id(body.skill_id)
        if skill is None:
            raise SkillNotFoundError

        existing = await self._repository.find_required_skill_link(job_id, body.skill_id)
        if existing is not None:
            raise JobSkillConflictError

        link = JobRequiredSkillModel(
            job_id=job_id,
            skill_id=body.skill_id,
            is_mandatory=body.is_mandatory,
            minimum_level=body.minimum_level,
            minimum_years=body.minimum_years,
            weight=body.weight,
        )
        saved = await self._repository.create_required_skill_link(link)
        return self._required_skill_response(saved, skill.name)

    async def remove_required_skill(self, job_id: UUID, skill_id: UUID) -> None:
        await self.get(job_id)
        link = await self._repository.find_required_skill_link(job_id, skill_id)
        if link is None:
            raise JobSkillLinkNotFoundError
        await self._repository.delete_required_skill_link(link)

    async def list_candidate_ranking(self, job_id: UUID) -> dict:
        await self.get(job_id)
        return {"job_id": job_id, "candidates": await self._repository.list_candidate_ranking(job_id)}

    @staticmethod
    def _validate_salary_range(salary_min, salary_max) -> None:
        if salary_min is not None and salary_max is not None and salary_min > salary_max:
            raise InvalidJobSalaryRangeError

    @staticmethod
    def _clean_required_text(value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise InvalidJobTextError
        return cleaned

    @staticmethod
    def _set_status(job: JobModel, next_status: str) -> None:
        now = datetime.now(timezone.utc)
        job.status = next_status
        job.updated_at = now

        if next_status == "published" and job.published_at is None:
            job.published_at = now
        if next_status in {"closed", "cancelled"} and job.closed_at is None:
            job.closed_at = now

    @staticmethod
    def _required_skill_response(link: JobRequiredSkillModel, skill_name: str) -> JobRequiredSkillResponse:
        return JobRequiredSkillResponse(
            id=link.id,
            job_id=link.job_id,
            skill_id=link.skill_id,
            skill_name=skill_name,
            is_mandatory=link.is_mandatory,
            minimum_level=link.minimum_level,
            minimum_years=link.minimum_years,
            weight=link.weight,
        )
