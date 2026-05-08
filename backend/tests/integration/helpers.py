"""Shared test helpers for integration tests."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4
import hashlib

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.analysis_model import (
    AnalysisModel,
    AnalysisResultModel,
    AIModelModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.job_model import (
    JobRequiredSkillModel,
    SkillModel,
)
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.repositories.sqlalchemy_candidate_repository import SQLAlchemyCandidateRepository
from src.infrastructure.repositories.sqlalchemy_job_repository import SQLAlchemyJobRepository
from src.infrastructure.database.models.scoring_model import ScoreModelVersionModel
from src.application.services.candidate_ranking_service import CandidateRankingService


async def _create_active_user(
    db_session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    """Create an active user with given credentials and role."""
    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"Test User {role.value}",
        role=role,
        is_active=True,
    )
    persisted = await repo.save(user)
    await db_session.commit()
    return persisted


async def _auth_headers(
    client: AsyncClient,
    email: str,
    password: str,
) -> dict[str, str]:
    """Obtain auth headers for a user."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _seed_scoring_case(
    db_session: AsyncSession,
    created_by: UUID,
    job_title: str = "Test Job",
    candidate_email: str = None,
    include_ranking_row: bool = False,
) -> tuple[UUID, UUID, UUID]:
    """Seed complete canonical matching flow for scoring tests.

    Creates: candidate, job, pipeline, resume, profiles, analysis, match.
    Returns: (job_id, candidate_id, match_id)
    """
    if candidate_email is None:
        candidate_email = f"candidate-{uuid4()}@test.local"

    # 1. Create candidate
    candidate = CandidateModel(
        email=candidate_email,
        full_name="Test Candidate",
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.flush()

    # 2. Create resume + version
    resume = ResumeModel(
        candidate_id=candidate.id,
        title="Test Resume",
        created_by=created_by,
    )
    db_session.add(resume)
    await db_session.flush()

    dummy_hash = hashlib.sha256(b"test_resume").hexdigest()
    resume_version = ResumeVersionModel(
        resume_id=resume.id,
        version_number=1,
        s3_bucket="test-bucket",
        s3_key="test-key",
        original_file_name="resume.pdf",
        file_size_bytes=1000,
        file_hash_sha256=dummy_hash,
        uploaded_by=created_by,
    )
    db_session.add(resume_version)
    await db_session.flush()

    # 3. Create job
    job = JobModel(
        title=job_title,
        description="Test job description with Python, FastAPI, PostgreSQL requirements",
        location="Test Location",
        minimum_years_experience=Decimal("5.0"),
        created_by=created_by,
    )
    db_session.add(job)
    await db_session.flush()

    # 3a. Create skills and link to job (for highlights)
    python_skill = SkillModel(name="Python", normalized_name="python", category="programming_language", is_verified=True)
    db_session.add(python_skill)
    await db_session.flush()

    fastapi_skill = SkillModel(name="FastAPI", normalized_name="fastapi", category="framework", is_verified=True)
    db_session.add(fastapi_skill)
    await db_session.flush()

    # 3b. Create job required skills (for highlights/explanation)
    job_python = JobRequiredSkillModel(
        job_id=job.id,
        skill_id=python_skill.id,
        is_mandatory=True,
        minimum_level="mid",
        weight=Decimal("1.5"),
    )
    db_session.add(job_python)

    job_fastapi = JobRequiredSkillModel(
        job_id=job.id,
        skill_id=fastapi_skill.id,
        is_mandatory=True,
        minimum_level="mid",
        weight=Decimal("1.0"),
    )
    db_session.add(job_fastapi)
    await db_session.flush()

    # 4. Create candidate_job_pipeline (REQUIRED by endpoint)
    pipeline = CandidateJobPipelineModel(
        candidate_id=candidate.id,
        job_id=job.id,
        resume_version_id=resume_version.id,
        link_status="active",
        pipeline_stage="entry",
        pipeline_status="active",
    )
    db_session.add(pipeline)
    await db_session.flush()

    # 5. Create AI model for analysis
    ai_model = AIModelModel(
        provider="google",
        model_id="gemini-test",
        model_name="Gemini Test",
        context_window=200000,
        is_active=True,
    )
    db_session.add(ai_model)
    await db_session.flush()

    # 6. Create prompt template for analysis
    prompt_template = PromptTemplateModel(
        name="test_template",
        version=1,
        description="Test template",
        template_type="candidate_analysis",
        user_prompt_template="Analyze: {resume}",
        is_active=True,
        created_by=created_by,
    )
    db_session.add(prompt_template)
    await db_session.flush()

    # 7. Create analysis (REQUIRED by endpoint)
    analysis = AnalysisModel(
        resume_version_id=resume_version.id,
        job_id=job.id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt_template.id,
        status="completed",
        requested_by=created_by,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(analysis)
    await db_session.flush()

    # 8. Create analysis result (REQUIRED by endpoint)
    result = AnalysisResultModel(
        analysis_id=analysis.id,
        overall_score=Decimal("82.50"),
        technical_score=Decimal("85.00"),
        experience_score=Decimal("85.00"),
        education_score=Decimal("80.00"),
        seniority_level="mid",
        total_experience_years=Decimal("5.0"),
        strengths=["Strong Python expertise", "Proficient with FastAPI framework"],
        weaknesses=["Limited Rust experience", "Need PostgreSQL advanced skills"],
        recommendations=["Consider learning Rust for systems programming", "Deepen PostgreSQL optimization knowledge"],
    )
    db_session.add(result)
    await db_session.flush()

    # 9. Create candidate profile analysis
    candidate_analysis = CandidateProfileAnalysisModel(
        candidate_id=candidate.id,
        resume_version_id=resume_version.id,
        provider="google",
        model_id="gemini-test",
        prompt_version="v1",
        experience_years=Decimal("5.0"),
        seniority_level="mid",
        skills_json=["Python", "FastAPI"],
    )
    db_session.add(candidate_analysis)
    await db_session.flush()

    # 10. Create job profile analysis
    job_signature_hash = hashlib.sha256(job.description.encode()).hexdigest()[:16]
    job_analysis = JobProfileAnalysisModel(
        job_id=job.id,
        provider="google",
        model_id="gemini-test",
        prompt_version="v1",
        job_signature_hash=job_signature_hash,
        experience_required=Decimal("3.0"),
        required_skills_json=["Python", "FastAPI", "PostgreSQL"],
        nice_to_have_skills_json=["Pipelines"],
    )
    db_session.add(job_analysis)
    await db_session.flush()

    # 11. Create candidate_job_match (canonical truth source)
    match = CandidateJobMatchModel(
        candidate_id=candidate.id,
        job_id=job.id,
        resume_version_id=resume_version.id,
        candidate_profile_analysis_id=candidate_analysis.id,
        job_profile_analysis_id=job_analysis.id,
        score_version="v3-canonical-det",
        match_score=Decimal("75.50"),
        recommendation="good_match",
        matched_skills_json=["Python", "FastAPI"],
        missing_skills_json=["pipelines"],
        explanation="Good technical match with Python/FastAPI expertise.",
    )
    db_session.add(match)
    pipeline.current_analysis_id = analysis.id
    await db_session.commit()

    if include_ranking_row:
        active_version = await db_session.scalar(
            sa.select(ScoreModelVersionModel).where(ScoreModelVersionModel.is_active.is_(True))
        )
        if active_version is None:
            active_version = ScoreModelVersionModel(
                version=f"test-score-{uuid4()}",
                is_active=True,
                weights={
                    "skill_match": 0.4,
                    "experience_match": 0.25,
                    "seniority_match": 0.2,
                    "education": 0.1,
                    "ai_confidence": 0.05,
                },
                thresholds={"high": 70, "low": 45},
            )
            db_session.add(active_version)
            await db_session.commit()

        await CandidateRankingService(db_session).compute_single_candidate(job.id, candidate.id)
        await db_session.commit()

    return job.id, candidate.id, match.id
