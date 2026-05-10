"""Tests for job quality validator service."""

from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from src.application.services.job_quality_validator_service import (
    JobQualityValidatorService,
    JobNotFoundForQualityError,
)
from src.infrastructure.database.models.job_model import JobModel, JobRequiredSkillModel


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_repository():
    repo = AsyncMock()
    repo.find_active_by_id = AsyncMock()
    repo.list_required_skill_rows = AsyncMock(return_value=[])
    return repo


@pytest.fixture
def service(mock_repository):
    return JobQualityValidatorService(mock_repository)


def _create_job(
    title="Backend Developer Pleno",
    description="A solid backend developer position",
    requirements="Python and PostgreSQL",
    job_area="Tecnologia",
    responsibilities="Design, implement and maintain backend services with ownership of delivery and technical quality.",
    experience_context="Experience in production backend systems, API maintenance and collaboration with product teams.",
    behavioral_requirements=None,
    priority="normal",
    seniority_level="mid",
    minimum_education_level="bachelor",
    minimum_years_experience=2,
    deal_breakers=None,
):
    """Helper to create a JobModel for testing."""
    job = JobModel(
        id=uuid4(),
        title=title,
        description=description,
        requirements=requirements,
        status="draft",
        job_area=job_area,
        responsibilities=responsibilities,
        experience_context=experience_context,
        behavioral_requirements=["Comunicação"] if behavioral_requirements is None else behavioral_requirements,
        priority=priority,
        seniority_level=seniority_level,
        minimum_education_level=minimum_education_level,
        minimum_years_experience=minimum_years_experience,
        deal_breakers=deal_breakers or [],
        work_model=None,
        location=None,
        salary_min=None,
        salary_max=None,
        salary_currency="BRL",
        created_by=uuid4(),
    )
    return job


def _create_skill_row(
    skill_id,
    skill_name,
    priority_level="complementary",
    weight=1.0,
    minimum_level=None,
    minimum_years=None,
):
    """Helper to create a skill row for testing."""
    class MockRow:
        def __init__(self):
            self.JobRequiredSkillModel = JobRequiredSkillModel(
                id=uuid4(),
                job_id=uuid4(),
                skill_id=skill_id,
                priority_level=priority_level,
                weight=weight,
                minimum_level=minimum_level,
                minimum_years=minimum_years,
            )
            self.skill_name = skill_name
            self.skill_normalized_name = skill_name.lower().replace(" ", "_")

    return MockRow()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_job_not_found_raises_error(service, mock_repository):
    """Test that validating non-existent job raises error."""
    job_id = uuid4()
    mock_repository.find_active_by_id.return_value = None

    with pytest.raises(JobNotFoundForQualityError):
        await service.validate(job_id)


@pytest.mark.asyncio
async def test_weak_vaga_without_priority_skills(service, mock_repository):
    """Test that vaga without essential skills is weak and cannot publish."""
    job = _create_job(
        title="Dev",  # Too short
        description="",  # Empty
        requirements=None,
        job_area=None,
        responsibilities=None,
        experience_context=None,
        behavioral_requirements=[],
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = []

    result = await service.validate(job.id)

    assert result.status == "weak"
    assert not result.can_publish
    assert result.quality_score < 50
    assert "priority_skills" in result.missing_fields


@pytest.mark.asyncio
async def test_good_vaga_with_all_criteria(service, mock_repository):
    """Test that well-configured vaga is good and can publish."""
    job = _create_job(
        title="Senior Backend Developer Position",  # Good length
        description="We are looking for an experienced backend developer with expertise in Python and PostgreSQL to help build our microservices architecture.",  # > 100 chars
        requirements="5+ years of Python, PostgreSQL, REST API design, Docker, Git",  # > 50 chars
        seniority_level="senior",
        minimum_education_level="bachelor",
        minimum_years_experience=5,
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=2.0),
        _create_skill_row(uuid4(), "PostgreSQL", priority_level="priority", weight=1.5),
        _create_skill_row(uuid4(), "Docker", priority_level="complementary", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert result.status == "good"
    assert result.can_publish
    assert result.quality_score >= 75
    assert len(result.missing_fields) == 0


@pytest.mark.asyncio
async def test_linked_priority_skills_satisfy_skill_requirements_when_payload_is_absent(service, mock_repository):
    job = _create_job()
    job.skill_requirements = None
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "React", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "Node.js", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert result.can_publish
    assert "skill_requirements" not in result.publication_blockers
    assert any("skills vinculadas" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_linked_skills_override_divergent_skill_requirements_snapshot(service, mock_repository):
    job = _create_job()
    job.skill_requirements = {
        "priority": ["React"],
        "complementary": [],
        "eliminatory": [],
    }
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "JavaScript", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "Node.js", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert "skill_requirements" not in result.publication_blockers
    assert any("divergente" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_acceptable_vaga_with_warnings(service, mock_repository):
    """Test that mid-quality vaga can still be blocked from publication."""
    job = _create_job(
        title="Python Developer",
        description="We are hiring a Python developer for our team.",  # > 50 but < 100
        requirements="Python",  # Minimal but present
        seniority_level="junior",
        minimum_education_level=None,
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert result.status == "acceptable"
    assert not result.can_publish
    assert 50 <= result.quality_score < 75
    assert "priority_skills" in result.publication_blockers


@pytest.mark.asyncio
async def test_many_priority_skills_generates_warning(service, mock_repository):
    """Test that vaga with >5 essential skills gets a warning."""
    job = _create_job()
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), f"Skill {i}", priority_level="priority", weight=1.0)
        for i in range(10)
    ]

    result = await service.validate(job.id)

    assert len(result.warnings) > 0
    assert any("Muitas skills essenciais" in w for w in result.warnings)


@pytest.mark.asyncio
async def test_priority_skill_low_weight_generates_warning(service, mock_repository):
    """Test that essential skill with weight < 0.5 generates warning."""
    job = _create_job()
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=0.3),  # Low weight
        _create_skill_row(uuid4(), "PostgreSQL", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert len(result.warnings) > 0
    assert any("peso baixo" in w for w in result.warnings)


@pytest.mark.asyncio
async def test_short_description_loses_points(service, mock_repository):
    """Test that short description reduces score."""
    job = _create_job(
        title="Python Developer",
        description="Short",  # < 100 chars
        requirements="Python",
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert len(result.suggestions) > 0
    assert any("descrição" in s.lower() and "detalhada" in s for s in result.suggestions)


@pytest.mark.asyncio
async def test_missing_fields_listed_correctly(service, mock_repository):
    """Test that missing fields are correctly identified."""
    job = _create_job(
        seniority_level=None,  # Missing
        minimum_education_level=None,  # Missing
        minimum_years_experience=None,  # Missing
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = []

    result = await service.validate(job.id)

    assert "seniority_level" in result.missing_fields
    assert "minimum_education_level" in result.missing_fields
    assert "minimum_years_experience" in result.missing_fields


@pytest.mark.asyncio
async def test_missing_structural_fields_reduce_quality(service, mock_repository):
    job = _create_job(
        job_area=None,
        responsibilities=None,
        experience_context=None,
        behavioral_requirements=[],
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "PostgreSQL", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert "job_area" in result.missing_fields
    assert "responsibilities" in result.missing_fields
    assert "experience_context" in result.missing_fields
    assert any("comportamentais" in warning.lower() for warning in result.warnings)


@pytest.mark.asyncio
async def test_missing_publication_blockers_prevent_publish_even_with_good_score(service, mock_repository):
    job = _create_job(
        job_area=None,
        minimum_years_experience=None,
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "PostgreSQL", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert not result.can_publish
    assert "job_area" in result.publication_blockers
    assert "minimum_years_experience" in result.publication_blockers


@pytest.mark.asyncio
async def test_two_priority_skills_are_required_for_publication(service, mock_repository):
    job = _create_job()
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert not result.can_publish
    assert "priority_skills" in result.publication_blockers


@pytest.mark.asyncio
async def test_score_capped_at_100(service, mock_repository):
    """Test that score is never > 100."""
    job = _create_job(
        title="This is a very good title with more than ten characters" * 10,  # Very long
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = []

    result = await service.validate(job.id)

    assert result.quality_score <= 100


@pytest.mark.asyncio
async def test_deal_breakers_with_reason_adds_points(service, mock_repository):
    """Test that valid deal-breakers with reason field adds points."""
    job = _create_job(
        deal_breakers=[
            {"field": "work_model", "value": "remote", "reason": "This role requires remote work", "is_active": True}
        ]
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Python", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    # Should have deal_breaker points (5 pts)
    assert result.quality_score >= 50  # At least passing with deal breaker points


@pytest.mark.asyncio
async def test_no_skills_added_yet_warns(service, mock_repository):
    """Test that vaga with no skills added gets warning and loses points."""
    job = _create_job()
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = []

    result = await service.validate(job.id)

    assert "priority_skills" in result.missing_fields
    assert len(result.warnings) > 0
    assert any("Sem skills" in w for w in result.warnings)


@pytest.mark.asyncio
async def test_technical_job_with_less_than_three_priority_skills_warns_permissive_ranking(service, mock_repository):
    job = _create_job(title="Desenvolvedor Backend Pleno", job_area="technology")
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Node.js", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "SQL", priority_level="priority", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert any("ranking pode ficar permissivo" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_full_stack_job_without_frontend_signal_warns(service, mock_repository):
    job = _create_job(
        title="Desenvolvedor Full Stack Pleno",
        description="Atuacao full stack com foco em APIs e servicos de backend.",
        job_area="technology",
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Node.js", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "SQL", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "API REST", priority_level="complementary", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert any("skill clara de frontend" in warning for warning in result.warnings)
    assert not any("skill clara de backend" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_full_stack_job_without_backend_signal_warns(service, mock_repository):
    job = _create_job(
        title="Full Stack Engineer",
        description="Posicao full stack com participacao em interfaces e experiencia web.",
        job_area="technology",
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "React", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "Frontend", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "Vue.js", priority_level="complementary", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert any("skill clara de backend" in warning for warning in result.warnings)
    assert not any("skill clara de frontend" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_more_than_twelve_complementary_skills_warns_about_clarity(service, mock_repository):
    job = _create_job(title="Desenvolvedor Full Stack Pleno", job_area="technology")
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Node.js", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "SQL", priority_level="priority", weight=1.0),
        *[
            _create_skill_row(uuid4(), f"Diferencial {index}", priority_level="complementary", weight=1.0)
            for index in range(13)
        ],
    ]

    result = await service.validate(job.id)

    assert any("Diferenciais em excesso" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_backend_job_does_not_warn_about_missing_frontend_signal(service, mock_repository):
    job = _create_job(
        title="Backend Developer Pleno",
        description="Atuacao em backend, APIs e bancos relacionais para produtos internos.",
        job_area="technology",
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "Node.js", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "SQL", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "API REST", priority_level="complementary", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert not any("skill clara de frontend" in warning for warning in result.warnings)
    assert not any("skill clara de backend" in warning for warning in result.warnings)


@pytest.mark.asyncio
async def test_frontend_job_does_not_warn_about_missing_backend_signal(service, mock_repository):
    job = _create_job(
        title="Frontend Developer Pleno",
        description="Atuacao em interfaces web, componentes reutilizaveis e experiencia do usuario.",
        job_area="technology",
    )
    mock_repository.find_active_by_id.return_value = job
    mock_repository.list_required_skill_rows.return_value = [
        _create_skill_row(uuid4(), "React", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "Frontend", priority_level="priority", weight=1.0),
        _create_skill_row(uuid4(), "JavaScript", priority_level="complementary", weight=1.0),
    ]

    result = await service.validate(job.id)

    assert not any("skill clara de backend" in warning for warning in result.warnings)
    assert not any("skill clara de frontend" in warning for warning in result.warnings)
