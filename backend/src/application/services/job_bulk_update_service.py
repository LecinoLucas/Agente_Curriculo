from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.job_service import (
    InvalidJobSalaryRangeError,
    InvalidJobTextError,
    JobNotFoundError,
    JobService,
)
from src.application.services.job_bulk_import_service import JobBulkImportService
from src.application.services.job_skill_resolver_service import JobSkillResolverService
from src.infrastructure.database.models.job_model import JobRequiredSkillModel, SkillModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.repositories.sqlalchemy_skill_repository import SQLAlchemySkillRepository
from src.interface.api.schemas.job_schemas import (
    BulkImportJobSkillRequest,
    BulkUpdateJobDataRequest,
    BulkUpdateJobItemRequest,
    BulkUpdateJobResultResponse,
    BulkUpdateJobsRequest,
    BulkUpdateJobsResponse,
    UpdateJobRequest,
)


class JobBulkUpdateService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._job_repository = SQLAlchemyJobRepository(session)
        self._skill_repository = SQLAlchemySkillRepository(session)
        self._skill_resolver = JobSkillResolverService(self._skill_repository)
        self._job_service = JobService(self._job_repository)

    async def update_jobs(self, payload: BulkUpdateJobsRequest) -> BulkUpdateJobsResponse:
        results: list[BulkUpdateJobResultResponse] = []
        updated = 0
        failed = 0

        for item in payload.jobs:
            result = await self._update_single_job(item, payload.options.fallback_unknown_skills_to_requirements)
            results.append(result)
            if result.status == "updated":
                updated += 1
            else:
                failed += 1

        return BulkUpdateJobsResponse(
            total=len(payload.jobs),
            updated=updated,
            failed=failed,
            results=results,
        )

    async def _update_single_job(
        self,
        item: BulkUpdateJobItemRequest,
        fallback_unknown_skills_to_requirements: bool,
    ) -> BulkUpdateJobResultResponse:
        warnings: list[str] = []
        unresolved_skills: list[str] = []
        resolved_skill_names: list[str] = []
        job = await self._resolve_job(item)
        if job is None:
            return BulkUpdateJobResultResponse(
                job_id=item.job_id,
                status="failed",
                errors=["Vaga não encontrada."],
            )

        nested = await self._session.begin_nested()
        try:
            update_data = item.data.model_copy(deep=True)
            if "skills" in item.data.model_fields_set:
                skill_resolution = await self._skill_resolver.resolve_many(item.data.skills or [])
                warnings.extend(skill_resolution.warnings)
                unresolved_skills = sorted({name.strip() for name in skill_resolution.unresolved if name and name.strip()})
                resolved_skill_names = skill_resolution.resolved_skill_names
                update_data.skills = [entry.request for entry in skill_resolution.resolved]

                if unresolved_skills:
                    if not fallback_unknown_skills_to_requirements:
                        raise ValueError(f"Skill não encontrada: {', '.join(unresolved_skills)}")
                    update_data.requirements = JobBulkImportService._append_unresolved_skills_to_requirements(
                        update_data.requirements if "requirements" in update_data.model_fields_set else job.requirements,
                        unresolved_skills,
                    )
                    warnings.append(
                        "Skills fora do catálogo estruturado foram mantidas apenas em requirements: "
                        + ", ".join(unresolved_skills)
                        + "."
                    )

            update_body = self._build_update_request(update_data)
            if update_body.model_fields_set:
                await self._job_service.update(job.id, update_body)

            if "skills" in item.data.model_fields_set:
                resolved_skills, skill_warnings = await self._resolve_skills(update_data.skills or [])
                warnings.extend(skill_warnings)
                await self._replace_skills(job.id, resolved_skills)
                job = await self._job_service.get(job.id)
                await self._job_service._maybe_generate_job_profile(job)

            quality = await self._job_service.refresh_quality(job.id)
            await nested.commit()
            return BulkUpdateJobResultResponse(
                job_id=job.id,
                status="updated",
                resolved_skills=resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[],
                warnings=warnings + list(quality.warnings),
            )
        except (InvalidJobSalaryRangeError, InvalidJobTextError, JobNotFoundError) as exc:
            await nested.rollback()
            return BulkUpdateJobResultResponse(
                job_id=job.id,
                status="failed",
                resolved_skills=resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[self._friendly_error(exc)],
                warnings=warnings,
            )
        except ValueError as exc:
            await nested.rollback()
            return BulkUpdateJobResultResponse(
                job_id=job.id,
                status="failed",
                resolved_skills=resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[str(exc)],
                warnings=warnings,
            )
        except Exception as exc:
            await nested.rollback()
            return BulkUpdateJobResultResponse(
                job_id=job.id,
                status="failed",
                resolved_skills=resolved_skill_names,
                unresolved_skills=unresolved_skills,
                errors=[str(exc)],
                warnings=warnings,
            )

    async def _resolve_job(self, item: BulkUpdateJobItemRequest):
        if item.job_id is not None:
            return await self._job_repository.find_active_by_id(item.job_id)
        if item.match_key is not None:
            return await self._job_repository.find_active_by_identity(
                title=item.match_key.title,
                job_area=item.match_key.job_area,
                location=item.match_key.location,
            )
        return None

    @staticmethod
    def _build_update_request(data: BulkUpdateJobDataRequest) -> UpdateJobRequest:
        payload = data.model_dump(exclude_unset=True, exclude={"skills"})
        return UpdateJobRequest(**payload)

    async def _resolve_skills(
        self,
        skills: list[BulkImportJobSkillRequest],
    ) -> tuple[list[tuple[BulkImportJobSkillRequest, SkillModel]], list[str]]:
        resolution = await self._skill_resolver.resolve_many(skills)
        if resolution.unresolved:
            raise ValueError(f"Skill não encontrada: {', '.join(sorted(resolution.unresolved))}")
        return ([(entry.request, entry.skill) for entry in resolution.resolved], resolution.warnings)

    async def _replace_skills(
        self,
        job_id: UUID,
        skills: list[tuple[BulkImportJobSkillRequest, SkillModel]],
    ) -> None:
        existing_rows = await self._job_repository.list_required_skill_rows(job_id)
        for row in existing_rows:
            await self._job_repository.delete_required_skill_link(row.JobRequiredSkillModel)

        for skill_request, skill in skills:
            link = JobRequiredSkillModel(
                job_id=job_id,
                skill_id=skill.id,
                is_mandatory=skill_request.is_mandatory,
                minimum_level=skill_request.minimum_level,
                minimum_years=skill_request.minimum_years,
                weight=skill_request.weight,
            )
            await self._job_repository.create_required_skill_link(link)

    @staticmethod
    def _friendly_error(exc: Exception) -> str:
        if isinstance(exc, InvalidJobTextError):
            return "Título e descrição não podem estar em branco."
        if isinstance(exc, InvalidJobSalaryRangeError):
            return "Faixa salarial inválida: salary_min não pode ser maior que salary_max."
        if isinstance(exc, JobNotFoundError):
            return "Vaga não encontrada."
        return str(exc)
