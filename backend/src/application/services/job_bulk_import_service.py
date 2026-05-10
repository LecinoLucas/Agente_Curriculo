from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.job_service import (
    InvalidJobSalaryRangeError,
    InvalidJobTextError,
    JobPublicationValidationError,
    JobService,
)
from src.application.services.job_skill_resolver_service import JobSkillResolverService
from src.infrastructure.database.models.job_model import JobRequiredSkillModel, SkillModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.schemas.job_schemas import (
    BulkImportJobSkillRequest,
    BulkImportJobItemRequest,
    BulkImportJobResultResponse,
    BulkImportJobsRequest,
    BulkImportJobsResponse,
    CreateJobRequest,
)


class JobBulkImportService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._job_repository = SQLAlchemyJobRepository(session)
        self._skill_resolver = JobSkillResolverService(session)
        self._job_service = JobService(self._job_repository)

    async def import_jobs(self, payload: BulkImportJobsRequest, created_by: UUID) -> BulkImportJobsResponse:
        results: list[BulkImportJobResultResponse] = []
        created = 0
        skipped = 0
        failed = 0

        for item in payload.jobs:
            result = await self._import_single_job(
                item,
                payload.options.dry_run,
                payload.options.skip_duplicates,
                payload.options.default_status,
                created_by,
            )
            results.append(result)
            if result.status == "created":
                created += 1
            elif result.status == "skipped":
                skipped += 1
            else:
                failed += 1

        return BulkImportJobsResponse(
            total=len(payload.jobs),
            created=created,
            skipped=skipped,
            failed=failed,
            results=results,
        )

    async def _import_single_job(
        self,
        item: BulkImportJobItemRequest,
        dry_run: bool,
        skip_duplicates: bool,
        default_status: str,
        created_by: UUID,
    ) -> BulkImportJobResultResponse:
        warnings: list[str] = []
        requested_status = item.status if "status" in item.model_fields_set else default_status

        duplicate = await self._job_repository.find_active_by_identity(
            title=item.title,
            job_area=item.job_area,
            location=item.location,
        )
        if duplicate is not None:
            if skip_duplicates:
                return BulkImportJobResultResponse(
                    title=item.title,
                    status="skipped",
                    job_id=duplicate.id,
                    errors=[],
                    warnings=["Vaga duplicada encontrada por title + job_area + location."],
                )
            return BulkImportJobResultResponse(
                title=item.title,
                status="failed",
                errors=["Vaga duplicada encontrada por title + job_area + location."],
            )

        skill_resolution = await self._skill_resolver.resolve_many(item.skills)
        warnings.extend(skill_resolution.warnings)
        unresolved_skills = sorted({name.strip() for name in skill_resolution.unresolved if name and name.strip()})
        resolved_skills = [(entry.request, entry.skill) for entry in skill_resolution.resolved]
        requirements = item.requirements

        if unresolved_skills:
            missing = ", ".join(unresolved_skills)
            return BulkImportJobResultResponse(
                title=item.title,
                status="failed",
                resolved_skills=skill_resolution.resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[f"Skills não encontradas: {missing}"],
                warnings=warnings,
            )

        nested = await self._session.begin_nested()
        try:
            body = CreateJobRequest(
                title=item.title,
                description=item.description,
                requirements=requirements,
                status="draft" if requested_status == "published" else requested_status,
                seniority_level=item.seniority_level,
                minimum_education_level=item.minimum_education_level,
                minimum_years_experience=item.minimum_years_experience,
                deal_breakers=item.deal_breakers,
                work_model=item.work_model,
                location=item.location,
                salary_min=item.salary_min,
                salary_max=item.salary_max,
                salary_currency=item.salary_currency,
                job_area=item.job_area,
                responsibilities=item.responsibilities,
                experience_context=item.experience_context,
                behavioral_requirements=item.behavioral_requirements,
                priority=item.priority,
            )

            job = await self._job_service.create(body, created_by)

            for skill_request, skill in resolved_skills:
                link = JobRequiredSkillModel(
                    job_id=job.id,
                    skill_id=skill.id,
                    priority_level=skill_request.priority_level,
                    minimum_level=skill_request.minimum_level,
                    minimum_years=skill_request.minimum_years,
                    weight=skill_request.weight,
                )
                await self._job_repository.create_required_skill_link(link)

            if resolved_skills:
                job = await self._job_service.sync_skill_requirements_snapshot(job.id)
                await self._job_service._maybe_generate_job_profile(job)

            quality = await self._job_service.refresh_quality(job.id)
            if requested_status == "published":
                await self._job_service.transition_status(job.id, "published")
                quality = await self._job_service.refresh_quality(job.id)

            if dry_run:
                warnings.append("Dry run: vaga validada sem persistência.")
                await nested.rollback()
            else:
                await nested.commit()

            return BulkImportJobResultResponse(
                title=item.title,
                status="created",
                job_id=None if dry_run else job.id,
                quality_score=quality.quality_score,
                quality_status=quality.status,
                resolved_skills=skill_resolution.resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[],
                warnings=warnings + list(quality.warnings),
            )
        except (InvalidJobSalaryRangeError, InvalidJobTextError, JobPublicationValidationError) as exc:
            await nested.rollback()
            return BulkImportJobResultResponse(
                title=item.title,
                status="failed",
                resolved_skills=skill_resolution.resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[self._friendly_error(exc)],
                warnings=warnings,
            )
        except Exception as exc:
            await nested.rollback()
            return BulkImportJobResultResponse(
                title=item.title,
                status="failed",
                resolved_skills=skill_resolution.resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[str(exc)],
                warnings=warnings,
            )

    @staticmethod
    def _friendly_error(exc: Exception) -> str:
        if isinstance(exc, InvalidJobTextError):
            return "Título e descrição não podem estar em branco."
        if isinstance(exc, InvalidJobSalaryRangeError):
            return "Faixa salarial inválida: salary_min não pode ser maior que salary_max."
        if isinstance(exc, JobPublicationValidationError):
            return "Vaga não atende os critérios mínimos de publicação: " + ", ".join(exc.missing_fields)
        return str(exc)
