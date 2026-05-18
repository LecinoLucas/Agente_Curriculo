from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID

import structlog

from src.application.services.skill_text_normalizer import normalize_skill_text
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel, SkillModel
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest
from src.interface.api.schemas.skill_schemas import (
    AddJobSkillRequest,
    JobRequiredSkillResponse,
    UpdateJobSkillRequest,
)
from src.application.services.audit_service import AuditService
from src.domain.entities.user import User
from src.domain.exceptions import ValidationException

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
        job_profiler_service: "JobProfilerService | None" = None,
        job_quality_validator_service: "JobQualityValidatorService | None" = None,
        audit_service: AuditService | None = None,
    ) -> None:
        self._repository = repository
        self._job_profiler = job_profiler_service
        self._quality_validator = job_quality_validator_service
        self._audit_service = audit_service

    async def create(self, body: CreateJobRequest, created_by: UUID) -> JobModel:
        self._validate_salary_range(body.salary_min, body.salary_max)
        title = self._clean_required_text(body.title)
        description = self._clean_required_text(body.description)
        deal_breakers = [db.model_dump(exclude_none=True) for db in body.deal_breakers] if body.deal_breakers else []
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
            behavioral_template_id=body.behavioral_template_id,
            priority=body.priority,
            skill_requirements=validated_skill_requirements,
            created_by=created_by,
            selection_flow_type=body.selection_flow_type or "standard",
            requires_behavioral_assessment=body.requires_behavioral_assessment if body.requires_behavioral_assessment is not None else True,
            requires_behavioral_ai_evaluation=body.requires_behavioral_ai_evaluation if body.requires_behavioral_ai_evaluation is not None else True,
            requires_interview=body.requires_interview if body.requires_interview is not None else True,
            requires_scorecard=body.requires_scorecard if body.requires_scorecard is not None else True,
            requires_manager_review=body.requires_manager_review if body.requires_manager_review is not None else False,
        )
        saved_job = await self._repository.create(job)
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
    ) -> tuple[list[JobModel], int, dict[str, int]]:
        return await self._repository.list_active(
            page,
            page_size,
            search=search,
            status=status,
            job_area=job_area,
            work_model=work_model,
        )

    async def get(self, job_id: UUID) -> JobModel:
        job = await self._repository.find_active_by_id(job_id)
        if job is None:
            raise JobNotFoundError
        return job

    async def update(self, job_id: UUID, body: UpdateJobRequest) -> JobModel:
        job = await self.get(job_id)
        provided_fields = body.model_fields_set
        skills_configuration_changed = "skill_requirements" in provided_fields
        if "status" in provided_fields and body.status == "archived":
            raise ValidationException("Use a ação específica de arquivar vaga.")
        salary_min = body.salary_min if "salary_min" in provided_fields else job.salary_min
        salary_max = body.salary_max if "salary_max" in provided_fields else job.salary_max
        self._validate_salary_range(salary_min, salary_max)
        target_job_area = body.job_area if "job_area" in provided_fields else job.job_area
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
            "behavioral_template_id",
            "priority",
            "skill_requirements",
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
            if field_name in {"requirements", "location", "responsibilities", "experience_context"}:
                val = self._clean_optional_text(val)
            if field_name == "salary_currency" and isinstance(val, str):
                val = val.upper()
            if field_name == "deal_breakers" and isinstance(val, list):
                val = [db.model_dump(exclude_none=True) for db in val]
            if field_name == "behavioral_requirements" and isinstance(val, list):
                val = self._clean_string_list(val)
            if field_name == "skill_requirements":
                val = validated_skill_requirements
            setattr(job, field_name, val)

        if "status" in provided_fields and body.status is not None:
            self._set_status(job, body.status)

        job.updated_at = datetime.now(timezone.utc)
        saved_job = await self._repository.save(job)

        # Invalidate stale scores/matches if structural fields changed
        if provided_fields.intersection({
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
        }):
            await self._invalidate_job_scores_and_matches(job_id)
            await self._maybe_generate_job_profile(saved_job)
            if skills_configuration_changed:
                await self._recompute_active_pipeline_matches(job_id)

        await self._maybe_refresh_quality(saved_job.id)

        return saved_job

    async def _invalidate_job_scores_and_matches(self, job_id: UUID) -> None:
        """Hard-delete persisted ranking/matching data for this job after structural updates."""
        if not hasattr(self._repository, "_session"):
            return
        import sqlalchemy as sa
        from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel
        from src.infrastructure.database.models.profile_analysis_model import (
            CandidateJobMatchModel,
            JobProfileAnalysisModel,
        )

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
                superseded_at=datetime.now(timezone.utc),
            )
        )

    async def _recompute_active_pipeline_matches(self, job_id: UUID) -> None:
        if not hasattr(self._repository, "_session"):
            return

        import sqlalchemy as sa

        from src.application.services.analysis_service import AnalysisService
        from src.infrastructure.database.models.candidate_job_pipeline_model import (
            CandidateJobPipelineModel,
        )
        from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
            SQLAlchemyAnalysisRepository,
        )

        session = self._repository._session
        active_entries = list(
            (
                await session.scalars(
                    sa.select(CandidateJobPipelineModel).where(
                        CandidateJobPipelineModel.job_id == job_id,
                        CandidateJobPipelineModel.relationship_status == "active",
                        CandidateJobPipelineModel.is_terminal.is_(False),
                        CandidateJobPipelineModel.terminated_at.is_(None),
                    )
                )
            ).all()
        )
        if not active_entries:
            return

        analysis_repo = SQLAlchemyAnalysisRepository(session)
        analysis_service = AnalysisService(analysis_repo)
        for entry in active_entries:
            resume_version_id = getattr(entry, "resume_version_id", None)
            if resume_version_id is None:
                continue

            latest_completed = await analysis_repo.find_latest_completed_for_version(
                resume_version_id,
                job_id,
            )
            if latest_completed is None:
                continue

            try:
                await analysis_service.match_completed_analysis_to_job(
                    analysis_id=latest_completed.id,
                    job_id=job_id,
                    force_recompute=True,
                )
            except Exception:
                logger.warning(
                    "job.skill_recompute_failed",
                    job_id=str(job_id),
                    candidate_id=str(entry.candidate_id),
                    analysis_id=str(latest_completed.id),
                    exc_info=True,
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        await self._recompute_active_pipeline_matches(job_id)
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
        await self._recompute_active_pipeline_matches(job_id)
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
        await self._recompute_active_pipeline_matches(job_id)
        await self._maybe_refresh_quality(job.id)
        return self._required_skill_response(saved, skill.name if skill is not None else "")

    async def sync_skill_requirements_snapshot(self, job_id: UUID) -> JobModel:
        job = await self.get(job_id)
        rows = await self._repository.list_required_skill_rows(job_id)
        job.skill_requirements = self._skill_requirements_from_required_skill_rows(rows)
        job.updated_at = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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

    @staticmethod
    def _required_skill_response(link: JobRequiredSkillModel, skill_name: str) -> JobRequiredSkillResponse:
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
            job.job_profile_hash = build_job_profile_hash(
                title=job.title,
                description=job.description,
                requirements=job.requirements,
                seniority_level=job.seniority_level,
                minimum_years_experience=float(job.minimum_years_experience) if job.minimum_years_experience is not None else None,
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
                        "timestamp": datetime.now(timezone.utc).isoformat(),
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
                        "timestamp": datetime.now(timezone.utc).isoformat(),
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
