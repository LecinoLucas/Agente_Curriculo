from datetime import UTC, datetime
from uuid import UUID

import structlog

from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_behavioral_template_repository import (
    SQLAlchemyBehavioralTemplateRepository,
)
from src.interface.api.schemas.behavioral_template_schemas import (
    BehavioralCompetencyCreateRequest,
    BehavioralCompetencyDetailResponse,
    BehavioralCompetencyResponse,
    BehavioralQuestionCreateRequest,
    BehavioralQuestionResponse,
    BehavioralTemplateCreateRequest,
    BehavioralTemplateDetailResponse,
    BehavioralTemplateResponse,
    BehavioralTemplateUpdateRequest,
)

logger = structlog.get_logger(__name__)


class BehavioralTemplateService:
    def __init__(self, repository: SQLAlchemyBehavioralTemplateRepository) -> None:
        self._repository = repository

    async def list_templates(self) -> list[BehavioralTemplateResponse]:
        """List all templates (any status)."""
        templates = await self._repository.list_templates()
        return [
            BehavioralTemplateResponse(
                id=t["id"],
                name=t["name"],
                description=t["description"],
                status=t["status"],
                version=t["version"],
                competency_count=t["competency_count"],
                question_count=t["question_count"],
                created_at=t["created_at"],
                updated_at=t["updated_at"],
                archived_at=t.get("archived_at"),
            )
            for t in templates
        ]

    async def list_active_templates(self) -> list[BehavioralTemplateResponse]:
        """List only active templates."""
        templates = await self._repository.list_templates(status="active")
        return [
            BehavioralTemplateResponse(
                id=t["id"],
                name=t["name"],
                description=t["description"],
                status=t["status"],
                version=t["version"],
                competency_count=t["competency_count"],
                question_count=t["question_count"],
                created_at=t["created_at"],
                updated_at=t["updated_at"],
                archived_at=t.get("archived_at"),
            )
            for t in templates
        ]

    async def get_template(self, template_id: UUID) -> BehavioralTemplateDetailResponse:
        """Get template with all details."""
        template = await self._repository.get_template(template_id)

        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        competencies = [
            BehavioralCompetencyDetailResponse(
                id=c["id"],
                template_id=c["template_id"],
                name=c["name"],
                description=c["description"],
                weight=c["weight"],
                display_order=c["display_order"],
                question_count=c["question_count"],
                questions=[
                    BehavioralQuestionResponse(
                        id=q["id"],
                        competency_id=q["competency_id"],
                        question_text=q["question_text"],
                        answer_type=q["answer_type"],
                        is_required=q["is_required"],
                        weight=q["weight"],
                        display_order=q["display_order"],
                        options_json=q["options_json"],
                    )
                    for q in c["questions"]
                ],
            )
            for c in template["competencies"]
        ]

        return BehavioralTemplateDetailResponse(
            id=template["id"],
            name=template["name"],
            description=template["description"],
            status=template["status"],
            version=template["version"],
            competency_count=template["competency_count"],
            question_count=template["question_count"],
            created_at=template["created_at"],
            updated_at=template["updated_at"],
            competencies=competencies,
        )

    async def create_template(self, request: BehavioralTemplateCreateRequest) -> BehavioralTemplateResponse:
        """Create a new template in draft status."""
        result = await self._repository.create_template(
            name=request.name,
            description=request.description,
        )
        return BehavioralTemplateResponse(**result)

    async def update_template(self, template_id: UUID, request: BehavioralTemplateUpdateRequest) -> BehavioralTemplateResponse:
        """Update template (only name and description)."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        update_data = {}
        if request.name is not None:
            update_data["name"] = request.name
        if request.description is not None:
            update_data["description"] = request.description

        if update_data:
            await self._repository.update_template(template_id, **update_data)

        template = await self._repository.get_template(template_id)
        return BehavioralTemplateResponse(
            id=template["id"],
            name=template["name"],
            description=template["description"],
            status=template["status"],
            version=template["version"],
            competency_count=template["competency_count"],
            question_count=template["question_count"],
            created_at=template["created_at"],
            updated_at=template["updated_at"],
        )

    async def activate_template(self, template_id: UUID) -> BehavioralTemplateResponse:
        """Activate a template (must have at least 1 competency with questions)."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        if template["competency_count"] == 0:
            raise ValidationException("Template must have at least one competency")

        if template["question_count"] == 0:
            raise ValidationException("All competencies must have at least one question")

        await self._repository.set_template_status(template_id, "active")

        template = await self._repository.get_template(template_id)
        return BehavioralTemplateResponse(
            id=template["id"],
            name=template["name"],
            description=template["description"],
            status=template["status"],
            version=template["version"],
            competency_count=template["competency_count"],
            question_count=template["question_count"],
            created_at=template["created_at"],
            updated_at=template["updated_at"],
        )

    async def archive_template(self, template_id: UUID) -> BehavioralTemplateResponse:
        """Archive a template."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        await self._repository.set_template_status(
            template_id,
            "archived",
            archived_at=datetime.now(UTC),
        )

        template = await self._repository.get_template(template_id)
        return BehavioralTemplateResponse(
            id=template["id"],
            name=template["name"],
            description=template["description"],
            status=template["status"],
            version=template["version"],
            competency_count=template["competency_count"],
            question_count=template["question_count"],
            created_at=template["created_at"],
            updated_at=template["updated_at"],
            archived_at=template.get("archived_at"),
        )

    async def create_competency(
        self,
        template_id: UUID,
        request: BehavioralCompetencyCreateRequest,
    ) -> BehavioralCompetencyResponse:
        """Create a competency in a template."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        result = await self._repository.create_competency(
            template_id=template_id,
            name=request.name,
            description=request.description,
            weight=request.weight,
            display_order=request.display_order,
        )
        return BehavioralCompetencyResponse(**result)

    async def update_competency(
        self,
        template_id: UUID,
        competency_id: UUID,
        **fields: dict,
    ) -> None:
        """Update a competency."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        competencies = [c for c in template["competencies"] if c["id"] == str(competency_id)]
        if not competencies:
            raise NotFoundException(f"Competency {competency_id} not found")

        await self._repository.update_competency(competency_id, **fields)

    async def delete_competency(
        self,
        template_id: UUID,
        competency_id: UUID,
    ) -> None:
        """Delete a competency (questions cascade-deleted)."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        competencies = [c for c in template["competencies"] if c["id"] == str(competency_id)]
        if not competencies:
            raise NotFoundException(f"Competency {competency_id} not found")

        await self._repository.delete_competency(competency_id)

    async def create_question(
        self,
        template_id: UUID,
        competency_id: UUID,
        request: BehavioralQuestionCreateRequest,
    ) -> BehavioralQuestionResponse:
        """Create a question in a competency."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        competencies = [c for c in template["competencies"] if c["id"] == str(competency_id)]
        if not competencies:
            raise NotFoundException(f"Competency {competency_id} not found")

        result = await self._repository.create_question(
            competency_id=competency_id,
            question_text=request.question_text,
            answer_type=request.answer_type,
            is_required=request.is_required,
            weight=request.weight,
            display_order=request.display_order,
            options_json=request.options_json,
        )
        return BehavioralQuestionResponse(**result)

    async def update_question(
        self,
        template_id: UUID,
        competency_id: UUID,
        question_id: UUID,
        **fields: dict,
    ) -> None:
        """Update a question."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        competencies = [c for c in template["competencies"] if c["id"] == str(competency_id)]
        if not competencies:
            raise NotFoundException(f"Competency {competency_id} not found")

        competency = competencies[0]
        questions = [q for q in competency["questions"] if q["id"] == str(question_id)]
        if not questions:
            raise NotFoundException(f"Question {question_id} not found")

        await self._repository.update_question(question_id, **fields)

    async def delete_question(
        self,
        template_id: UUID,
        competency_id: UUID,
        question_id: UUID,
    ) -> None:
        """Delete a question."""
        template = await self._repository.get_template(template_id)
        if not template:
            raise NotFoundException(f"Template {template_id} not found")

        competencies = [c for c in template["competencies"] if c["id"] == str(competency_id)]
        if not competencies:
            raise NotFoundException(f"Competency {competency_id} not found")

        competency = competencies[0]
        questions = [q for q in competency["questions"] if q["id"] == str(question_id)]
        if not questions:
            raise NotFoundException(f"Question {question_id} not found")

        await self._repository.delete_question(question_id)

    async def link_template_to_job(self, job_id: UUID, template_id: UUID | None) -> None:
        """Link a template to a job (or unlink if template_id is None)."""
        if template_id is not None:
            template = await self._repository.get_template(template_id)
            if not template:
                raise NotFoundException(f"Template {template_id} not found")

            if template["status"] != "active":
                raise ValidationException("Only active templates can be linked to a job")

        await self._repository.link_to_job(job_id, template_id)
        await self._invalidate_job_scores(job_id)

        if template_id is not None:
            await self._create_retroactive_assignments(job_id, template_id)

    async def _create_retroactive_assignments(self, job_id: UUID, template_id: UUID) -> None:
        import sqlalchemy as sa
        from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
        from src.infrastructure.database.models.job_model import JobModel
        from src.application.services.behavioral_assignment_service import BehavioralAssignmentService
        from src.infrastructure.repositories.sqlalchemy_behavioral_assignment_repository import (
            SQLAlchemyBehavioralAssignmentRepository,
        )

        session = self._repository._session
        job_row = await session.execute(
            sa.select(JobModel.requires_behavioral_assessment, JobModel.behavioral_template_id).where(
                JobModel.id == job_id
            )
        )
        job_data = job_row.first()
        if job_data is None:
            return
        if not bool(job_data.requires_behavioral_assessment):
            return
        if job_data.behavioral_template_id != template_id:
            return

        result = await session.execute(
            sa.select(
                CandidateJobPipelineModel.candidate_id,
                CandidateJobPipelineModel.candidate_job_pipeline_id,
            ).where(
                CandidateJobPipelineModel.job_id == job_id,
                CandidateJobPipelineModel.relationship_status == "active",
                CandidateJobPipelineModel.is_terminal.is_(False),
                CandidateJobPipelineModel.terminated_at.is_(None),
            )
        )
        active_rows = result.all()
        candidate_ids = [row.candidate_id for row in active_rows]

        if not candidate_ids:
            return

        assignment_service = BehavioralAssignmentService(SQLAlchemyBehavioralAssignmentRepository(session))
        for row in active_rows:
            await assignment_service.ensure_behavioral_assignment_for_candidate_job(
                candidate_id=row.candidate_id,
                job_id=job_id,
                requires_behavioral_assessment=True,
                template_id=template_id,
                pipeline_id=row.candidate_job_pipeline_id,
                pipeline_active=True,
            )

    async def _invalidate_job_scores(self, job_id: UUID) -> None:
        """Invalidate scores and matches for a job after template change."""
        import sqlalchemy as sa
        from src.infrastructure.database.models.scoring_model import CandidateJobScoreModel
        from src.infrastructure.database.models.profile_analysis_model import (
            CandidateJobMatchModel,
            JobProfileAnalysisModel,
        )

        session = self._repository._session
        await session.execute(
            sa.delete(CandidateJobScoreModel).where(CandidateJobScoreModel.job_id == job_id)
        )
        await session.execute(
            sa.delete(CandidateJobMatchModel).where(CandidateJobMatchModel.job_id == job_id)
        )
        await session.execute(
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
