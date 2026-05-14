import pytest
from uuid import uuid4, UUID

from src.application.services.behavioral_template_service import BehavioralTemplateService
from src.domain.exceptions import NotFoundException, ValidationException
from src.infrastructure.repositories.sqlalchemy_behavioral_template_repository import (
    SQLAlchemyBehavioralTemplateRepository,
)
from src.interface.api.schemas.behavioral_template_schemas import (
    BehavioralCompetencyCreateRequest,
    BehavioralQuestionCreateRequest,
    BehavioralTemplateCreateRequest,
)
from sqlalchemy.ext.asyncio import AsyncSession


def to_uuid(id_value) -> UUID:
    """Convert string ID from Pydantic response to UUID."""
    if isinstance(id_value, UUID):
        return id_value
    return UUID(id_value)


@pytest.mark.asyncio
class TestBehavioralTemplates:
    async def test_create_draft_template(self, db_session: AsyncSession) -> None:
        """Test creating a template in draft status."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        request = BehavioralTemplateCreateRequest(
            name="Communication Assessment",
            description="Assess communication skills",
        )

        result = await service.create_template(request)

        assert result.id is not None
        assert result.name == "Communication Assessment"
        assert result.description == "Assess communication skills"
        assert result.status == "draft"
        assert result.version == 1
        assert result.competency_count == 0
        assert result.question_count == 0

    async def test_create_template_with_competency_and_question(self, db_session: AsyncSession) -> None:
        """Test creating a full template hierarchy."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        # Create template
        template = await service.create_template(
            BehavioralTemplateCreateRequest(
                name="Leadership Assessment",
                description="Evaluate leadership abilities",
            )
        )
        template_id = to_uuid(template.id)

        # Create competency
        competency = await service.create_competency(
            template_id,
            BehavioralCompetencyCreateRequest(
                name="Team Management",
                description="Ability to manage teams",
                weight=1.5,
                display_order=1,
            ),
        )
        competency_id = to_uuid(competency.id)

        # Create question
        question = await service.create_question(
            template_id,
            competency_id,
            BehavioralQuestionCreateRequest(
                question_text="Describe your experience managing large teams.",
                answer_type="text",
                is_required=True,
                weight=2.0,
                display_order=1,
            ),
        )

        # Verify full structure
        detail = await service.get_template(template_id)
        assert detail.competency_count == 1
        assert detail.question_count == 1
        assert len(detail.competencies) == 1
        assert detail.competencies[0].name == "Team Management"
        assert detail.competencies[0].question_count == 1
        assert detail.competencies[0].questions[0].question_text == "Describe your experience managing large teams."

    async def test_cannot_activate_empty_template(self, db_session: AsyncSession) -> None:
        """Test that empty templates cannot be activated."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        template = await service.create_template(
            BehavioralTemplateCreateRequest(
                name="Empty Template",
            )
        )

        with pytest.raises(ValidationException, match="must have at least one competency"):
            await service.activate_template(to_uuid(template.id))

    async def test_cannot_activate_template_without_questions(self, db_session: AsyncSession) -> None:
        """Test that templates without questions cannot be activated."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        template = await service.create_template(
            BehavioralTemplateCreateRequest(name="Template With Empty Competency")
        )

        # Create competency but no question
        await service.create_competency(
            to_uuid(template.id),
            BehavioralCompetencyCreateRequest(name="Empty Competency"),
        )

        with pytest.raises(ValidationException, match="must have at least one question"):
            await service.activate_template(to_uuid(template.id))

    async def test_activate_valid_template(self, db_session: AsyncSession) -> None:
        """Test activating a valid template."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        # Create complete template
        template = await service.create_template(
            BehavioralTemplateCreateRequest(name="Valid Template")
        )

        competency = await service.create_competency(
            to_uuid(template.id),
            BehavioralCompetencyCreateRequest(name="Competency 1"),
        )

        await service.create_question(
            to_uuid(template.id),
            to_uuid(competency.id),
            BehavioralQuestionCreateRequest(
                question_text="Test question",
                answer_type="text",
            ),
        )

        # Activate
        result = await service.activate_template(to_uuid(template.id))
        assert result.status == "active"

    async def test_archive_template(self, db_session: AsyncSession) -> None:
        """Test archiving a template."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        template = await service.create_template(
            BehavioralTemplateCreateRequest(name="To Archive")
        )

        result = await service.archive_template(to_uuid(template.id))
        assert result.status == "archived"
        assert result.archived_at is not None

    async def test_cannot_link_archived_template_to_job(self, db_session: AsyncSession) -> None:
        """Test that archived templates cannot be linked to jobs."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        template = await service.create_template(
            BehavioralTemplateCreateRequest(name="Archived Template")
        )

        await service.archive_template(to_uuid(template.id))

        job_id = uuid4()
        with pytest.raises(ValidationException, match="Cannot link archived template"):
            await service.link_template_to_job(job_id, to_uuid(template.id))

    async def test_link_active_template_to_job(self, db_session: AsyncSession) -> None:
        """Test linking an active template to a job."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        # Create and activate template
        template = await service.create_template(
            BehavioralTemplateCreateRequest(name="Job Template")
        )

        competency = await service.create_competency(
            to_uuid(template.id),
            BehavioralCompetencyCreateRequest(name="Job Competency"),
        )

        await service.create_question(
            to_uuid(template.id),
            to_uuid(competency.id),
            BehavioralQuestionCreateRequest(
                question_text="Job question",
                answer_type="text",
            ),
        )

        await service.activate_template(to_uuid(template.id))

        # Link to job
        job_id = uuid4()
        await service.link_template_to_job(job_id, to_uuid(template.id))
        # (Should not raise)

    async def test_remove_template_from_job(self, db_session: AsyncSession) -> None:
        """Test removing a template from a job."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        # Create and activate template
        template = await service.create_template(
            BehavioralTemplateCreateRequest(name="To Remove")
        )

        competency = await service.create_competency(
            to_uuid(template.id),
            BehavioralCompetencyCreateRequest(name="Comp"),
        )

        await service.create_question(
            to_uuid(template.id),
            to_uuid(competency.id),
            BehavioralQuestionCreateRequest(
                question_text="Q",
                answer_type="text",
            ),
        )

        await service.activate_template(to_uuid(template.id))

        # Link then unlink
        job_id = uuid4()
        await service.link_template_to_job(job_id, to_uuid(template.id))
        await service.link_template_to_job(job_id, None)
        # (Should not raise)

    async def test_list_templates_with_counts(self, db_session: AsyncSession) -> None:
        """Test listing templates shows correct counts."""
        service = BehavioralTemplateService(SQLAlchemyBehavioralTemplateRepository(db_session))

        # Create templates with different counts
        t1 = await service.create_template(BehavioralTemplateCreateRequest(name="Template 1"))
        t2 = await service.create_template(BehavioralTemplateCreateRequest(name="Template 2"))

        # Add competencies to t2
        c1 = await service.create_competency(to_uuid(t2.id), BehavioralCompetencyCreateRequest(name="Comp1"))
        c2 = await service.create_competency(to_uuid(t2.id), BehavioralCompetencyCreateRequest(name="Comp2"))

        # Add questions to c1 only
        await service.create_question(
            to_uuid(t2.id),
            to_uuid(c1.id),
            BehavioralQuestionCreateRequest(question_text="Q1", answer_type="text"),
        )

        # List and verify
        templates = await service.list_templates()
        assert len(templates) >= 2

        t1_data = next(t for t in templates if t.id == t1.id)
        assert t1_data.competency_count == 0
        assert t1_data.question_count == 0

        t2_data = next(t for t in templates if t.id == t2.id)
        assert t2_data.competency_count == 2
        assert t2_data.question_count == 1
