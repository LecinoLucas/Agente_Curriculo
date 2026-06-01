from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

import structlog

from src.application.services.audit_service import AuditService
from src.application.services.skill_text_normalizer import normalize_skill_text
from src.domain.entities.user import User
from src.domain.exceptions import ValidationException
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest
from src.interface.api.schemas.skill_schemas import (
    AddJobSkillRequest,
    JobRequiredSkillResponse,
    UpdateJobSkillRequest,
)

if TYPE_CHECKING:
    from src.application.services.job_profiler_service import JobProfilerService
    from src.application.services.job_quality_validator_service import (
        JobQualityResult,
        JobQualityValidatorService,
    )
from src.application.services.job_profiler_service import (
    JobProfilerService,
    build_job_profile_hash,
    job_skill_from_row,
)
from src.application.services.job_skill_priority_service import (
    normalize_job_skill_priority_level,
)
from src.application.services.skill_requirements_service import (
    validate_skill_requirements_product_rules,
)
from src.interface.workers.matching_dispatcher import enqueue_job_match_recompute

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
        validation_errors: list[str] | None = None,
    ) -> None:
        self.missing_fields = list(missing_fields)
        self.quality_score = int(quality_score)
        self.quality_status = quality_status
        self.suggestions = list(suggestions)
        self.warnings = list(warnings)
        self.validation_errors = list(validation_errors or [])
        super().__init__("Vaga não atende os critérios mínimos de publicação.")


class JobService:
    def __init__(
        self,
        repository: SQLAlchemyJobRepository,
        job_profiler_service: JobProfilerService | None = None,
        job_quality_validator_service: JobQualityValidatorService | None = None,
        audit_service: AuditService | None = None,
    ) -> None:
        self._repository = repository
        self._job_profiler = job_profiler_service
        self._quality_validator = job_quality_validator_service
        self._audit_service = audit_service

    async def create(self, body: CreateJobRequest, created_by: UUID) -> JobModel:
        self._validate_salary_range(body.salary_min, body.salary_max)
        await self._ensure_operational_scope_exists(
            operational_group_id=body.operational_group_id,
            location_group_id=body.location_group_id,
        )
        await self._ensure_job_units_match_operational_scope(
            self._job_unit_ids_from_body(body) or set(),
            operational_group_id=body.operational_group_id,
            location_group_id=body.location_group_id,
        )
        title = self._clean_required_text(body.title)
        description = self._clean_required_text(body.description)
        deal_breakers = (
            [db.model_dump(exclude_none=True) for db in body.deal_breakers]
            if body.deal_breakers
            else []
        )
        validated_skill_requirements = self._validate_skill_requirements_payload(
            body.skill_requirements,
            job_area=body.job_area,
        )
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
            mandatory_skills=self._clean_string_list(body.mandatory_skills),
            nice_to_have_skills=self._clean_string_list(body.nice_to_have_skills),
            screening_questions=self._clean_string_list(body.screening_questions),
            benefits=self._clean_string_list(body.benefits),
            working_hours=self._clean_optional_text(body.working_hours),
            behavioral_template_id=body.behavioral_template_id,
            priority=body.priority,
            skill_requirements=validated_skill_requirements,
            operational_group_id=body.operational_group_id,
            location_group_id=body.location_group_id,
            allocation_mode=body.allocation_mode,
            created_by=created_by,
            selection_flow_type=body.selection_flow_type or "standard",
            requires_behavioral_assessment=body.requires_behavioral_assessment
            if body.requires_behavioral_assessment is not None
            else True,
            requires_behavioral_ai_evaluation=body.requires_behavioral_ai_evaluation
            if body.requires_behavioral_ai_evaluation is not None
            else True,
            requires_interview=body.requires_interview
            if body.requires_interview is not None
            else True,
            requires_scorecard=body.requires_scorecard
            if body.requires_scorecard is not None
            else True,
            requires_manager_review=body.requires_manager_review
            if body.requires_manager_review is not None
            else False,
        )
        saved_job = await self._repository.create(job)
        await self._replace_job_units_if_provided(saved_job.id, body)
        await self._maybe_generate_job_profile(saved_job)
        await self._maybe_refresh_quality(saved_job.id)
        return saved_job

    async def list(
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
        return await self._repository.list_active(
            page,
            page_size,
            search=search,
            status=status,
            job_area=job_area,
            work_model=work_model,
            operational_group_id=operational_group_id,
            location_group_id=location_group_id,
            operational_unit_id=operational_unit_id,
            allocation_mode=allocation_mode,
        )

    async def get(self, job_id: UUID) -> JobModel:
        job = await self._repository.find_active_by_id(job_id)
        if job is None:
            raise JobNotFoundError
        return job

    async def update(self, job_id: UUID, body: UpdateJobRequest) -> JobModel:
        job = await self.get(job_id)
        provided_fields = body.model_fields_set
        if "status" in provided_fields and body.status == "archived":
            raise ValidationException("Use a ação específica de arquivar vaga.")
        salary_min = body.salary_min if "salary_min" in provided_fields else job.salary_min
        salary_max = body.salary_max if "salary_max" in provided_fields else job.salary_max
        self._validate_salary_range(salary_min, salary_max)
        target_job_area = body.job_area if "job_area" in provided_fields else job.job_area
        target_operational_group_id = (
            body.operational_group_id
            if "operational_group_id" in provided_fields
            else job.operational_group_id
        )
        target_location_group_id = (
            body.location_group_id
            if "location_group_id" in provided_fields
            else job.location_group_id
        )
        await self._ensure_operational_scope_exists(
            operational_group_id=target_operational_group_id,
            location_group_id=target_location_group_id,
        )
        provided_unit_ids = self._job_unit_ids_from_body(body)
        target_unit_ids = (
            provided_unit_ids
            if provided_unit_ids is not None
            else {unit.operational_unit_id for unit in job.job_units if unit.is_active}
        )
        await self._ensure_job_units_match_operational_scope(
            target_unit_ids,
            operational_group_id=target_operational_group_id,
            location_group_id=target_location_group_id,
        )
        validated_skill_requirements = (
            self._validate_skill_requirements_payload(
                body.skill_requirements,
                job_area=target_job_area,
            )
            if "skill_requirements" in provided_fields
            else None
        )

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
            "mandatory_skills",
            "nice_to_have_skills",
            "screening_questions",
            "benefits",
            "working_hours",
            "behavioral_template_id",
            "priority",
            "skill_requirements",
            "operational_group_id",
            "location_group_id",
            "allocation_mode",
            "selection_flow_type",
            "requires_behavioral_assessment",
            "requires_behavioral_ai_evaluation",
            "requires_interview",
            "requires_scorecard",
            "requires_manager_review",
        ):
            if field_name not in provided_fields:
                continue

            val = getattr(body, field_name, None)
            if field_name in {"title", "description"}:
                if val is None:
                    continue
                val = self._clean_required_text(val)
            if field_name in {
                "requirements",
                "location",
                "responsibilities",
                "experience_context",
                "working_hours",
            }:
                val = self._clean_optional_text(val)
            if field_name == "salary_currency" and isinstance(val, str):
                val = val.upper()
            if field_name == "deal_breakers" and isinstance(val, list):
                val = [db.model_dump(exclude_none=True) for db in val]
            if field_name in {
                "behavioral_requirements",
                "mandatory_skills",
                "nice_to_have_skills",
                "screening_questions",
                "benefits",
            } and isinstance(val, list):
                val = self._clean_string_list(val)
            if field_name == "skill_requirements":
                val = validated_skill_requirements
            setattr(job, field_name, val)

        if "status" in provided_fields and body.status is not None:
            self._set_status(job, body.status)

        job.updated_at = datetime.now(UTC)
        saved_job = await self._repository.save(job)
        await self._replace_job_units_if_provided(job_id, body, provided_fields=provided_fields)

        # Invalidate stale scores/matches if structural fields changed, then
        # enqueue background recompute — no LLM, uses persisted profiles.
        if provided_fields.intersection(
            {
                "title",
                "description",
                "requirements",
                "seniority_level",
                "job_area",
                "responsibilities",
                "experience_context",
                "behavioral_requirements",
                "behavioral_template_id",
                "minimum_years_experience",
                "minimum_education_level",
                "priority",
                "deal_breakers",
                "skill_requirements",
                "job_profile_json",
            }
        ):
            await self._invalidate_job_scores_and_matches(job_id)
            await self._maybe_generate_job_profile(saved_job)
            await enqueue_job_match_recompute(job_id)

        await self._maybe_refresh_quality(saved_job.id)

        return saved_job

    async def _invalidate_job_scores_and_matches(self, job_id: UUID) -> None:
        """Hard-delete persisted ranking/matching data for this job after structural updates."""
        if not hasattr(self._repository, "_session"):
            return
        import sqlalchemy as sa

        from src.infrastructure.database.models.profile_analysis_model import (
            CandidateJobMatchModel,
            JobProfileAnalysisModel,
        )
        from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel

        await self._repository._session.execute(
            sa.delete(CandidateJobScoreModel).where(CandidateJobScoreModel.job_id == job_id)
        )
        await self._repository._session.execute(
            sa.delete(CandidateJobMatchModel).where(CandidateJobMatchModel.job_id == job_id)
        )
        await self._repository._session.execute(
            sa.update(JobProfileAnalysisModel)
            .where(
                JobProfileAnalysisModel.job_id == job_id,
                JobProfileAnalysisModel.is_active.is_(True),
            )
            .values(
                is_active=False,
                superseded_at=datetime.now(UTC),
            )
        )

    async def transition_status(self, job_id: UUID, next_status: str) -> JobModel:
        if next_status == "archived":
            raise ValidationException("Use a ação específica de arquivar vaga.")
        job = await self.get(job_id)
        if next_status == "published":
            await self.ensure_publishable(job.id)
        self._set_status(job, next_status)
        return await self._repository.save(job)

    async def archive(
        self,
        job_id: UUID,
        *,
        actor: User,
        reason: str,
        note: str | None = None,
    ) -> JobModel:
        job = await self.get(job_id)
        if job.status == "archived":
            raise ValidationException("A vaga já está arquivada.")

        previous_status = str(job.status)
        now = datetime.now(UTC)
        job.archived_previous_status = previous_status
        job.status = "archived"
        job.archived_at = now
        job.archived_by = actor.id
        job.archive_reason = reason.strip()
        job.archive_reason_note = self._clean_optional_text(note)
        job.updated_at = now
        saved = await self._repository.save(job)
        await self._log_audit(
            action="archive_job",
            job=saved,
            actor=actor,
            reason=job.archive_reason,
            note=job.archive_reason_note,
            before_state={"status": previous_status},
            after_state={"status": "archived"},
        )
        return saved

    async def restore(self, job_id: UUID, *, actor: User) -> JobModel:
        job = await self.get(job_id)
        if job.status != "archived":
            raise ValidationException("A vaga não está arquivada.")

        previous_status = str(job.archived_previous_status or "paused")
        now = datetime.now(UTC)
        if previous_status == "published":
            await self.ensure_publishable(job.id)

        job.status = previous_status
        job.updated_at = now
        job.archived_at = None
        job.archived_by = None
        job.archive_reason = None
        job.archive_reason_note = None
        job.archived_previous_status = None
        saved = await self._repository.save(job)
        await self._log_audit(
            action="restore_job",
            job=saved,
            actor=actor,
            reason=None,
            note=None,
            before_state={"status": "archived"},
            after_state={"status": previous_status},
        )
        return saved

    async def soft_delete(self, job_id: UUID) -> None:
        job = await self.get(job_id)
        now = datetime.now(UTC)
        job.status = "cancelled"
        job.deleted_at = now
        job.updated_at = now
        await self._repository.save(job)

    async def list_required_skills(self, job_id: UUID) -> list[JobRequiredSkillResponse]:
        await self.get(job_id)
        rows = await self._repository.list_required_skill_rows(job_id)
        return [
            self._required_skill_response(row.JobRequiredSkillModel, row.skill_name) for row in rows
        ]

    async def add_required_skill(
        self, job_id: UUID, body: AddJobSkillRequest
    ) -> JobRequiredSkillResponse:
        await self.get(job_id)

        skill_name = body.skill_name.strip()
        normalized_name = normalize_skill_text(skill_name)
        if not normalized_name:
            raise SkillNotFoundError

        skill = await self._repository.find_active_skill_by_normalized_name(normalized_name)
        if skill is None:
            skill = await self._repository.create_skill(
                SkillModel(
                    name=skill_name,
                    normalized_name=normalized_name,
                )
            )

        existing = await self._repository.find_required_skill_link(job_id, skill.id)
        if existing is not None:
            raise JobSkillConflictError

        link = JobRequiredSkillModel(
            job_id=job_id,
            skill_id=skill.id,
            priority_level=normalize_job_skill_priority_level(body.priority_level),
            minimum_level=body.minimum_level,
            minimum_years=body.minimum_years,
            weight=body.weight,
        )
        saved = await self._repository.create_required_skill_link(link)
        job = await self.sync_skill_requirements_snapshot(job_id)
        await self._invalidate_job_scores_and_matches(job_id)
        await self._maybe_generate_job_profile(job)
        await enqueue_job_match_recompute(job_id)
        await self._maybe_refresh_quality(job.id)
        return self._required_skill_response(saved, skill.name)

    async def remove_required_skill(self, job_id: UUID, skill_id: UUID) -> None:
        await self.get(job_id)
        link = await self._repository.find_required_skill_link(job_id, skill_id)
        if link is None:
            link = await self._repository.find_required_skill_link_by_id(job_id, skill_id)
        if link is None:
            raise JobSkillLinkNotFoundError
        await self._repository.delete_required_skill_link(link)
        job = await self.sync_skill_requirements_snapshot(job_id)
        await self._invalidate_job_scores_and_matches(job_id)
        await self._maybe_generate_job_profile(job)
        await enqueue_job_match_recompute(job_id)
        await self._maybe_refresh_quality(job.id)

    async def update_required_skill(
        self,
        job_id: UUID,
        link_id: UUID,
        body: UpdateJobSkillRequest,
    ) -> JobRequiredSkillResponse:
        await self.get(job_id)
        link = await self._repository.find_required_skill_link_by_id(job_id, link_id)
        if link is None:
            link = await self._repository.find_required_skill_link(job_id, link_id)
        if link is None:
            raise JobSkillLinkNotFoundError

        provided_fields = body.model_fields_set
        if "priority_level" in provided_fields and body.priority_level is not None:
            link.priority_level = normalize_job_skill_priority_level(body.priority_level)
        if "minimum_level" in provided_fields:
            link.minimum_level = body.minimum_level
        if "minimum_years" in provided_fields:
            link.minimum_years = body.minimum_years
        if "weight" in provided_fields and body.weight is not None:
            link.weight = body.weight

        saved = await self._repository.create_required_skill_link(link)
        skill = await self._repository.find_active_skill_by_id(saved.skill_id)
        job = await self.sync_skill_requirements_snapshot(job_id)
        await self._invalidate_job_scores_and_matches(job_id)
        await self._maybe_generate_job_profile(job)
        await enqueue_job_match_recompute(job_id)
        await self._maybe_refresh_quality(job.id)
        return self._required_skill_response(saved, skill.name if skill is not None else "")

    async def sync_skill_requirements_snapshot(self, job_id: UUID) -> JobModel:
        job = await self.get(job_id)
        rows = await self._repository.list_required_skill_rows(job_id)
        job.skill_requirements = self._skill_requirements_from_required_skill_rows(rows)
        job.updated_at = datetime.now(UTC)
        return await self._repository.save(job)

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
    def _validate_skill_requirements_payload(
        skill_requirements: dict[str, list[str]] | None,
        *,
        job_area: str | None,
    ) -> dict[str, list[str]] | None:
        if skill_requirements is None:
            return None

        result = validate_skill_requirements_product_rules(
            skill_requirements,
            job_area=job_area,
            check_raw_duplicates=True,
        )
        if result.errors:
            raise ValidationException("; ".join(result.errors))
        return result.sanitized

    @staticmethod
    def _skill_requirements_from_required_skill_rows(rows: list) -> dict[str, list[str]]:
        priority: list[str] = []
        complementary: list[str] = []
        eliminatory: list[str] = []
        seen: set[str] = set()
        for row in rows:
            name = str(getattr(row, "skill_name", "") or "").strip()
            normalized = normalize_skill_text(name)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            link = getattr(row, "JobRequiredSkillModel", row)
            level = normalize_job_skill_priority_level(
                getattr(link, "priority_level", "complementary")
            )
            if level == "priority":
                priority.append(name)
            elif level == "eliminatory":
                eliminatory.append(name)
            else:
                complementary.append(name)
        return {
            "priority": priority,
            "complementary": complementary,
            "eliminatory": eliminatory,
        }

    @staticmethod
    def _set_status(job: JobModel, next_status: str) -> None:
        now = datetime.now(UTC)
        job.status = next_status
        job.updated_at = now

        if next_status == "published" and job.published_at is None:
            job.published_at = now
        if next_status in {"closed", "cancelled"} and job.closed_at is None:
            job.closed_at = now
        if next_status != "archived":
            job.archived_at = None
            job.archived_by = None
            job.archive_reason = None
            job.archive_reason_note = None
            job.archived_previous_status = None

    async def _ensure_operational_scope_exists(
        self,
        *,
        operational_group_id: UUID | None,
        location_group_id: UUID | None,
    ) -> None:
        if operational_group_id is not None:
            group = await self._repository.find_active_operational_group_by_id(operational_group_id)
            if group is None:
                raise ValidationException("Grupo operacional não encontrado ou inativo.")

        if location_group_id is not None:
            location_group = await self._repository.find_active_location_group_by_id(
                location_group_id
            )
            if location_group is None:
                raise ValidationException("Localidade operacional não encontrada ou inativa.")

    async def _replace_job_units_if_provided(
        self,
        job_id: UUID,
        body: CreateJobRequest | UpdateJobRequest,
        *,
        provided_fields: set[str] | None = None,
    ) -> None:
        if provided_fields is not None and not provided_fields.intersection(
            {"operational_unit_ids", "job_units"}
        ):
            return

        unit_rows = self._job_unit_rows_from_body(body)
        if unit_rows is None:
            return

        await self._repository.replace_job_units(job_id, unit_rows)

    async def _ensure_job_units_match_operational_scope(
        self,
        unit_ids: set[UUID],
        *,
        operational_group_id: UUID | None,
        location_group_id: UUID | None,
    ) -> None:
        if not unit_ids:
            return

        units = await self._repository.find_active_operational_units_by_ids(unit_ids)
        units_by_id = {unit.id: unit for unit in units}
        if set(units_by_id) != unit_ids:
            raise ValidationException(
                "Uma ou mais filiais operacionais não foram encontradas ou estão inativas."
            )

        if operational_group_id is not None and any(
            unit.group_id != operational_group_id for unit in units
        ):
            raise ValidationException(
                "Uma ou mais filiais operacionais não pertencem ao grupo operacional da vaga."
            )

        if location_group_id is not None and any(
            unit.location_group_id != location_group_id for unit in units
        ):
            raise ValidationException(
                "Uma ou mais filiais operacionais não pertencem à localidade da vaga."
            )

    @staticmethod
    def _job_unit_ids_from_body(
        body: CreateJobRequest | UpdateJobRequest,
    ) -> set[UUID] | None:
        if body.job_units is not None:
            return {unit.operational_unit_id for unit in body.job_units}

        if body.operational_unit_ids is not None:
            return set(body.operational_unit_ids)

        return None

    @staticmethod
    def _job_unit_rows_from_body(
        body: CreateJobRequest | UpdateJobRequest,
    ) -> list[dict] | None:
        if body.job_units is not None:
            return [unit.model_dump() for unit in body.job_units]

        if body.operational_unit_ids is not None:
            return [
                {
                    "operational_unit_id": unit_id,
                    "openings_count": None,
                    "priority": None,
                    "is_active": True,
                }
                for unit_id in body.operational_unit_ids
            ]

        return None

    @staticmethod
    def _required_skill_response(
        link: JobRequiredSkillModel, skill_name: str
    ) -> JobRequiredSkillResponse:
        return JobRequiredSkillResponse(
            id=link.id,
            job_id=link.job_id,
            skill_id=link.skill_id,
            skill_name=skill_name,
            priority_level=normalize_job_skill_priority_level(link.priority_level),
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
                minimum_years_experience=float(job.minimum_years_experience)
                if job.minimum_years_experience is not None
                else None,
                minimum_education_level=job.minimum_education_level,
                job_area=job.job_area,
                responsibilities=job.responsibilities,
                experience_context=job.experience_context,
                behavioral_requirements=list(job.behavioral_requirements or []),
                priority=job.priority,
                linked_skills=[job_skill_from_row(row) for row in skill_rows],
            )

            job.job_profile_json = profile.to_dict()
            job.job_profile_hash = build_job_profile_hash(
                title=job.title,
                description=job.description,
                requirements=job.requirements,
                seniority_level=job.seniority_level,
                minimum_years_experience=float(job.minimum_years_experience)
                if job.minimum_years_experience is not None
                else None,
                minimum_education_level=job.minimum_education_level,
                job_area=job.job_area,
                responsibilities=job.responsibilities,
                experience_context=job.experience_context,
                behavioral_requirements=tuple(job.behavioral_requirements or ()),
                priority=job.priority,
                linked_skills=tuple(job_skill_from_row(row) for row in skill_rows),
            )
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

    async def refresh_quality(self, job_id: UUID) -> JobQualityResult:
        from src.application.services.job_quality_validator_service import (
            JobQualityValidatorService,
        )

        validator = self._quality_validator or JobQualityValidatorService(self._repository)
        result = await validator.validate(job_id)
        job = await self.get(job_id)
        job.quality_score = result.quality_score
        job.quality_status = result.status
        await self._repository.save(job)
        return result

    async def ensure_publishable(self, job_id: UUID) -> JobQualityResult:
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
            validation_errors=result.validation_errors,
        )

    async def _log_audit(
        self,
        *,
        action: str,
        job: JobModel,
        actor: User,
        reason: str | None,
        note: str | None,
        before_state: dict[str, str] | None,
        after_state: dict[str, str] | None,
    ) -> None:
        if self._audit_service is None:
            return
        try:
            audit_session = getattr(self._audit_service, "_session", None)
            if audit_session is None:
                await self._audit_service.log_event(
                    action=action,
                    resource_type="job",
                    resource_id=job.id,
                    user_id=actor.id,
                    metadata={
                        "entityType": "job",
                        "entityId": str(job.id),
                        "reason": reason,
                        "note": note,
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                    before_state=before_state,
                    after_state=after_state,
                )
                return

            async with audit_session.begin_nested():
                await self._audit_service.log_event(
                    action=action,
                    resource_type="job",
                    resource_id=job.id,
                    user_id=actor.id,
                    metadata={
                        "entityType": "job",
                        "entityId": str(job.id),
                        "reason": reason,
                        "note": note,
                        "timestamp": datetime.now(UTC).isoformat(),
                    },
                    before_state=before_state,
                    after_state=after_state,
                )
        except Exception as exc:
            logger.warning(
                "job_audit_log_failed",
                action=action,
                job_id=str(job.id),
                actor_id=str(actor.id),
                error=str(exc),
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
