from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID

import structlog

from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest
from src.interface.api.schemas.skill_schemas import AddJobSkillRequest, JobRequiredSkillResponse

if TYPE_CHECKING:
    from src.application.services.job_profiler_service import JobProfilerService
    from src.application.services.job_quality_validator_service import (
        JobQualityResult,
        JobQualityValidatorService,
    )
from src.application.services.job_profiler_service import JobProfilerService, job_skill_from_row

logger = structlog.get_logger(__name__)


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


class JobPublicationValidationError(Exception):
    def __init__(
        self,
        *,
        missing_fields: list[str],
        quality_score: int,
        quality_status: str,
        suggestions: list[str],
        warnings: list[str],
    ) -> None:
        self.missing_fields = list(missing_fields)
        self.quality_score = int(quality_score)
        self.quality_status = quality_status
        self.suggestions = list(suggestions)
        self.warnings = list(warnings)
        super().__init__("Vaga não atende os critérios mínimos de publicação.")


class JobService:
    def __init__(
        self,
        repository: SQLAlchemyJobRepository,
        job_profiler_service: "JobProfilerService | None" = None,
        job_quality_validator_service: "JobQualityValidatorService | None" = None,
    ) -> None:
        self._repository = repository
        self._job_profiler = job_profiler_service
        self._quality_validator = job_quality_validator_service

    async def create(self, body: CreateJobRequest, created_by: UUID) -> JobModel:
        self._validate_salary_range(body.salary_min, body.salary_max)
        title = self._clean_required_text(body.title)
        description = self._clean_required_text(body.description)
        deal_breakers = [db.model_dump(exclude_none=True) for db in body.deal_breakers] if body.deal_breakers else []
        job = JobModel(
            title=title,
            description=description,
            requirements=self._clean_optional_text(body.requirements),
            status=body.status,
            seniority_level=body.seniority_level,
            minimum_education_level=body.minimum_education_level,
            minimum_years_experience=body.minimum_years_experience,
            deal_breakers=deal_breakers,
            work_model=body.work_model,
            location=self._clean_optional_text(body.location),
            salary_min=body.salary_min,
            salary_max=body.salary_max,
            salary_currency=body.salary_currency.upper(),
            job_area=body.job_area,
            responsibilities=self._clean_optional_text(body.responsibilities),
            experience_context=self._clean_optional_text(body.experience_context),
            behavioral_requirements=self._clean_string_list(body.behavioral_requirements),
            priority=body.priority,
            created_by=created_by,
        )
        saved_job = await self._repository.create(job)
        await self._maybe_generate_job_profile(saved_job)
        await self._maybe_refresh_quality(saved_job.id)
        return saved_job

    async def list(self, page: int, page_size: int) -> tuple[list[JobModel], int]:
        return await self._repository.list_active(page, page_size)

    async def get(self, job_id: UUID) -> JobModel:
        job = await self._repository.find_active_by_id(job_id)
        if job is None:
            raise JobNotFoundError
        return job

    async def update(self, job_id: UUID, body: UpdateJobRequest) -> JobModel:
        job = await self.get(job_id)
        provided_fields = body.model_fields_set
        salary_min = body.salary_min if "salary_min" in provided_fields else job.salary_min
        salary_max = body.salary_max if "salary_max" in provided_fields else job.salary_max
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
            "job_area",
            "responsibilities",
            "experience_context",
            "behavioral_requirements",
            "priority",
        ):
            if field_name not in provided_fields:
                continue

            val = getattr(body, field_name, None)
            if field_name in {"title", "description"}:
                if val is None:
                    continue
                val = self._clean_required_text(val)
            if field_name in {"requirements", "location", "responsibilities", "experience_context"}:
                val = self._clean_optional_text(val)
            if field_name == "salary_currency" and isinstance(val, str):
                val = val.upper()
            if field_name == "deal_breakers" and isinstance(val, list):
                val = [db.model_dump(exclude_none=True) for db in val]
            if field_name == "behavioral_requirements" and isinstance(val, list):
                val = self._clean_string_list(val)
            setattr(job, field_name, val)

        if "status" in provided_fields and body.status is not None:
            self._set_status(job, body.status)

        job.updated_at = datetime.now(timezone.utc)
        saved_job = await self._repository.save(job)

        if provided_fields.intersection({
            "title",
            "description",
            "requirements",
            "seniority_level",
            "job_area",
            "responsibilities",
            "experience_context",
            "behavioral_requirements",
            "minimum_years_experience",
            "minimum_education_level",
            "priority",
        }):
            await self._maybe_generate_job_profile(saved_job)

        await self._maybe_refresh_quality(saved_job.id)

        return saved_job

    async def transition_status(self, job_id: UUID, next_status: str) -> JobModel:
        job = await self.get(job_id)
        if next_status == "published":
            await self.ensure_publishable(job.id)
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
        job = await self.get(job_id)
        await self._maybe_generate_job_profile(job)
        await self._maybe_refresh_quality(job.id)
        return self._required_skill_response(saved, skill.name)

    async def remove_required_skill(self, job_id: UUID, skill_id: UUID) -> None:
        await self.get(job_id)
        link = await self._repository.find_required_skill_link(job_id, skill_id)
        if link is None:
            raise JobSkillLinkNotFoundError
        await self._repository.delete_required_skill_link(link)
        job = await self.get(job_id)
        await self._maybe_generate_job_profile(job)
        await self._maybe_refresh_quality(job.id)

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
    def _clean_optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @staticmethod
    def _clean_string_list(values: list[str] | None) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for value in values or []:
            cleaned = str(value).strip()
            key = cleaned.casefold()
            if not cleaned or key in seen:
                continue
            seen.add(key)
            normalized.append(cleaned)
        return normalized

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

    async def _maybe_generate_job_profile(self, job: JobModel) -> None:
        """
        Gera e persiste JobProfile se o serviço está disponível.
        Nunca levanta exceção — falhas da IA são silenciosas e logadas.
        """
        try:
            skill_rows = await self._repository.list_required_skill_rows(job.id)
            profiler = self._job_profiler or JobProfilerService(ai_service=None)
            profile = await profiler.generate_profile(
                job.description,
                title=job.title,
                requirements=job.requirements,
                seniority_level=job.seniority_level,
                minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
                minimum_education_level=job.minimum_education_level,
                job_area=job.job_area,
                responsibilities=job.responsibilities,
                experience_context=job.experience_context,
                behavioral_requirements=list(job.behavioral_requirements or []),
                priority=job.priority,
                linked_skills=[job_skill_from_row(row) for row in skill_rows],
            )

            job.job_profile_json = profile.to_dict()
            job.job_profile_hash = profile.description_hash
            await self._repository.save(job)

            logger.info(
                "job_profile_generated",
                job_id=str(job.id),
                area=profile.area,
                target_level=profile.target_level,
                completeness=profile.job_completeness_score,
                confidence=profile.confidence,
            )
        except Exception as exc:
            logger.warning(
                "job_profile_generation_failed",
                job_id=str(job.id),
                error=str(exc),
            )

    async def refresh_quality(self, job_id: UUID) -> "JobQualityResult":
        from src.application.services.job_quality_validator_service import JobQualityValidatorService

        validator = self._quality_validator or JobQualityValidatorService(self._repository)
        result = await validator.validate(job_id)
        job = await self.get(job_id)
        job.quality_score = result.quality_score
        job.quality_status = result.status
        await self._repository.save(job)
        return result

    async def ensure_publishable(self, job_id: UUID) -> "JobQualityResult":
        result = await self.refresh_quality(job_id)
        if result.can_publish:
            return result

        missing_fields = list(dict.fromkeys(result.publication_blockers or result.missing_fields))
        raise JobPublicationValidationError(
            missing_fields=missing_fields,
            quality_score=result.quality_score,
            quality_status=result.status,
            suggestions=result.suggestions,
            warnings=result.warnings,
        )

    async def _maybe_refresh_quality(self, job_id: UUID) -> None:
        try:
            await self.refresh_quality(job_id)
        except Exception as exc:
            logger.warning(
                "job_quality_refresh_failed",
                job_id=str(job_id),
                error=str(exc),
            )
