"""
Testes para os campos estruturais de vaga (job_area, responsibilities, experience_context, behavioral_requirements, priority).

Cobertura:
1. POST /jobs com todos os novos campos → 201
2. PATCH /jobs/:id com job_area e responsibilities → profile regenerado (hash muda)
3. GET /jobs/:id/quality sem job_area → missing_fields inclui "job_area"
4. GET /jobs/:id/quality com job_area + responsibilities → score aumenta
5. Score não ultrapassa 100
6. Vagas antigas (sem novos campos) → backward compatible
7. behavioral_requirements: deduplicação, normalização
"""

import pytest
from decimal import Decimal
from uuid import uuid4

from src.interface.api.schemas.job_schemas import CreateJobRequest, UpdateJobRequest
from src.application.services.job_service import JobService
from src.application.services.job_quality_validator_service import JobQualityValidatorService
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_create_job_with_all_structural_fields(db_session: AsyncSession):
    """Test creating a job with all new structural fields."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Senior Data Engineer",
        description="We are seeking a data engineer...",
        job_area="data",
        responsibilities="Build ETL pipelines, optimize queries, mentor junior engineers",
        experience_context="5+ years in data engineering with Apache Spark",
        behavioral_requirements=["Communication", "Proactivity", "Problem Solving"],
        priority="high",
        seniority_level="senior",
        minimum_years_experience=Decimal("5.0"),
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    assert job.job_area == "data"
    assert job.responsibilities == "Build ETL pipelines, optimize queries, mentor junior engineers"
    assert job.experience_context == "5+ years in data engineering with Apache Spark"
    assert job.behavioral_requirements == ["Communication", "Proactivity", "Problem Solving"]
    assert job.priority == "high"
    assert job.quality_score is not None
    assert 0 <= job.quality_score <= 100


@pytest.mark.asyncio
async def test_behavioral_requirements_normalization(db_session: AsyncSession):
    """Test that behavioral_requirements are deduplicated and stripped."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Test Job",
        description="Test description",
        behavioral_requirements=[
            "  Communication  ",
            "communication",  # duplicate (case-insensitive)
            "Proactivity",
        ],
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    # Should be deduplicated and normalized
    assert len(job.behavioral_requirements) == 2
    assert "Communication" in job.behavioral_requirements
    assert "Proactivity" in job.behavioral_requirements


@pytest.mark.asyncio
async def test_update_job_with_new_fields_regenerates_profile(db_session: AsyncSession):
    """Test that updating structural fields regenerates the job profile."""
    user_id = uuid4()
    # Create initial job without job_area
    body = CreateJobRequest(
        title="Data Analyst",
        description="Analyze data and create reports...",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)
    initial_hash = job.job_profile_hash

    # Update with job_area and responsibilities
    update = UpdateJobRequest(
        job_area="data",
        responsibilities="Create dashboards, analyze trends, present insights",
    )
    updated_job = await service.update(job.id, update)
    await db_session.refresh(updated_job)

    # Hash should change because job_area and responsibilities changed
    assert updated_job.job_profile_hash != initial_hash
    assert updated_job.job_area == "data"


@pytest.mark.asyncio
async def test_quality_score_increases_with_job_area_and_responsibilities(db_session: AsyncSession):
    """Test that job_area and responsibilities improve quality score."""
    user_id = uuid4()
    # Create job without new fields
    body_minimal = CreateJobRequest(
        title="Junior Developer",
        description="We are hiring a junior developer...",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job_minimal = await service.create(body_minimal, user_id)
    await db_session.refresh(job_minimal)
    minimal_score = job_minimal.quality_score or 0

    # Create job with new fields
    body_full = CreateJobRequest(
        title="Junior Developer",
        description="We are hiring a junior developer...",
        job_area="technology",
        responsibilities="Write clean code, participate in code reviews, debug issues",
    )

    job_full = await service.create(body_full, uuid4())
    await db_session.refresh(job_full)
    full_score = job_full.quality_score or 0

    # Full job should have higher quality score
    assert full_score > minimal_score


@pytest.mark.asyncio
async def test_quality_score_capped_at_100(db_session: AsyncSession):
    """Test that quality score never exceeds 100."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Full Stack Engineer",
        description="We are seeking a full stack engineer with extensive experience...",
        requirements="React, Node.js, PostgreSQL, AWS, Docker",
        job_area="technology",
        responsibilities="Design and implement full stack features, lead architecture decisions",
        experience_context="10+ years in full stack development",
        behavioral_requirements=["Leadership", "Communication", "Strategic Thinking"],
        seniority_level="senior",
        minimum_education_level="bachelor",
        minimum_years_experience=Decimal("10.0"),
        deal_breakers=[],
        work_model="remote",
        location="USA",
        salary_min=Decimal("120000"),
        salary_max=Decimal("180000"),
        priority="high",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    assert job.quality_score is not None
    assert job.quality_score <= 100
    assert job.quality_score >= 0


@pytest.mark.asyncio
async def test_missing_fields_in_quality_report(db_session: AsyncSession):
    """Test that missing job_area is reported in quality validation."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Product Manager",
        description="We are hiring a product manager...",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    validator = JobQualityValidatorService(SQLAlchemyJobRepository(db_session))
    quality = await validator.validate(job.id)

    # Should suggest job_area
    assert "job_area" in [f.lower() for f in quality.missing_fields]


@pytest.mark.asyncio
async def test_priority_field_default(db_session: AsyncSession):
    """Test that priority defaults to 'normal'."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="QA Engineer",
        description="Quality assurance engineer position...",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    assert job.priority == "normal"


@pytest.mark.asyncio
async def test_update_priority_field(db_session: AsyncSession):
    """Test updating priority field."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="DevOps Engineer",
        description="DevOps engineer for cloud infrastructure...",
        priority="normal",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)

    # Update priority to urgent
    update = UpdateJobRequest(priority="urgent")
    updated_job = await service.update(job.id, update)
    await db_session.refresh(updated_job)

    assert updated_job.priority == "urgent"


@pytest.mark.asyncio
async def test_old_jobs_backward_compatible(db_session: AsyncSession):
    """Test that old jobs without new fields continue to work."""
    user_id = uuid4()
    # Simulate old job by creating with just required fields
    body = CreateJobRequest(
        title="Support Agent",
        description="Customer support position...",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    # Should have defaults
    assert job.job_area is None
    assert job.responsibilities is None
    assert job.experience_context is None
    assert job.behavioral_requirements == []
    assert job.priority == "normal"

    # Quality validator should still work
    validator = JobQualityValidatorService(SQLAlchemyJobRepository(db_session))
    quality = await validator.validate(job.id)
    assert quality.quality_score is not None
    assert 0 <= quality.quality_score <= 100


@pytest.mark.asyncio
async def test_empty_behavioral_requirements(db_session: AsyncSession):
    """Test that empty behavioral_requirements default correctly."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Intern",
        description="Internship program...",
        behavioral_requirements=[],
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    assert job.behavioral_requirements == []


@pytest.mark.asyncio
async def test_responsibilities_text_cleaning(db_session: AsyncSession):
    """Test that responsibilities text is stripped."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Manager",
        description="Management position...",
        responsibilities="  \n  Lead teams, manage budgets, drive strategy  \n  ",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    assert job.responsibilities == "Lead teams, manage budgets, drive strategy"


@pytest.mark.asyncio
async def test_experience_context_text_cleaning(db_session: AsyncSession):
    """Test that experience_context text is stripped."""
    user_id = uuid4()
    body = CreateJobRequest(
        title="Consultant",
        description="Consulting position...",
        experience_context="  \n  Experience in enterprise environments  \n  ",
    )

    service = JobService(SQLAlchemyJobRepository(db_session))
    job = await service.create(body, user_id)
    await db_session.refresh(job)

    assert job.experience_context == "Experience in enterprise environments"
