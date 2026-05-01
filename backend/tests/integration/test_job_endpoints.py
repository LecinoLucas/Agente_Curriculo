from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.analysis_service import AnalysisService
from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
    ResumeJobMatchModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel, SkillModel
from src.infrastructure.repositories.sqlalchemy_analysis_repository import (
    SQLAlchemyAnalysisRepository,
)
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


async def _create_active_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name=f"{role.value.title()} User",
        role=role,
    )
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


async def _auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _job_payload(**overrides) -> dict:
    payload = {
        "title": "Backend Engineer",
        "description": "Build and maintain backend APIs",
        "requirements": "Python, FastAPI and PostgreSQL",
        "job_area": "technology",
        "responsibilities": "Build APIs, maintain integrations and collaborate with product on backend deliveries.",
        "experience_context": "Experience with backend APIs in production, integrations and structured technical routines.",
        "behavioral_requirements": ["Comunicação", "Autonomia"],
        "priority": "normal",
        "seniority_level": "senior",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "brl",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_candidate_cannot_create_job(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "candidate-job@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    headers = await _auth_headers(client, "candidate-job@test.com", "password123")

    response = await client.post("/api/v1/jobs", json=_job_payload(), headers=headers)

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_can_crud_job_and_soft_delete(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job@test.com", "password123")

    create = await client.post("/api/v1/jobs", json=_job_payload(), headers=headers)
    assert create.status_code == 201
    created = create.json()
    assert created["title"] == "Backend Engineer"
    assert created["salary_currency"] == "BRL"
    assert created["job_area"] == "technology"
    assert created["priority"] == "normal"
    assert created["behavioral_requirements"] == ["Comunicação", "Autonomia"]
    assert created["quality_score"] is not None
    assert created["quality_status"] in {"weak", "acceptable", "good"}

    job_id = created["id"]
    detail = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == job_id

    update = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "title": "Senior Backend Engineer",
            "salary_max": "20000.00",
            "priority": "urgent",
            "job_area": "data",
            "behavioral_requirements": ["Comunicação", "Organização"],
        },
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["title"] == "Senior Backend Engineer"
    assert update.json()["priority"] == "urgent"
    assert update.json()["job_area"] == "data"

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=headers)
    assert publish.status_code == 200
    assert publish.json()["status"] == "published"

    listing = await client.get("/api/v1/jobs", headers=headers)
    assert listing.status_code == 200
    listed_job = next(item for item in listing.json()["data"] if item["id"] == job_id)
    assert listed_job["quality_score"] is not None
    assert listed_job["quality_status"] in {"weak", "acceptable", "good"}

    delete = await client.delete(f"/api/v1/jobs/{job_id}", headers=headers)
    assert delete.status_code == 204

    deleted_detail = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert deleted_detail.status_code == 404

    listing_after_delete = await client.get("/api/v1/jobs", headers=headers)
    assert listing_after_delete.status_code == 200
    assert all(item["id"] != job_id for item in listing_after_delete.json()["data"])


@pytest.mark.asyncio
async def test_recruiter_can_clear_optional_job_fields_on_update(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job-clear@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job-clear@test.com", "password123")

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            minimum_education_level="bachelor",
            minimum_years_experience="5.0",
            deal_breakers=[
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "Brasil",
                    "reason": "Precisa atender a região",
                    "is_active": True,
                }
            ],
        ),
        headers=headers,
    )
    assert create.status_code == 201
    job_id = create.json()["id"]

    update = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "requirements": None,
            "location": None,
            "work_model": None,
            "salary_min": None,
            "salary_max": None,
            "minimum_education_level": None,
            "minimum_years_experience": None,
            "deal_breakers": [],
        },
        headers=headers,
    )
    assert update.status_code == 200
    updated = update.json()
    assert updated["requirements"] is None
    assert updated["location"] is None
    assert updated["work_model"] is None
    assert updated["salary_min"] is None
    assert updated["salary_max"] is None
    assert updated["minimum_education_level"] is None
    assert updated["minimum_years_experience"] is None
    assert updated["deal_breakers"] == []

    detail = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert detail.status_code == 200
    persisted = detail.json()
    assert persisted["requirements"] is None
    assert persisted["location"] is None
    assert persisted["work_model"] is None
    assert persisted["salary_min"] is None
    assert persisted["salary_max"] is None
    assert persisted["minimum_education_level"] is None
    assert persisted["minimum_years_experience"] is None
    assert persisted["deal_breakers"] == []


@pytest.mark.asyncio
async def test_recruiter_can_edit_job_with_decimal_fields_and_add_skill(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test editing a job with Decimal fields (sent as strings) and then adding a skill."""
    await _create_active_user(
        db_session,
        "recruiter-job-skill@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job-skill@test.com", "password123")

    # Create a skill first
    skill = SkillModel(
        name="Python",
        normalized_name="python",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    db_session.add(skill)
    await db_session.commit()
    skill_id = skill.id

    # Create a job
    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            minimum_years_experience="3.5",
            salary_min="10000.00",
            salary_max="15000.00",
        ),
        headers=headers,
    )
    assert create.status_code == 201
    job_id = create.json()["id"]

    # Edit the job with decimal fields
    update = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "title": "Senior Python Backend Engineer",
            "minimum_years_experience": "5.0",
            "salary_min": "12000.00",
            "salary_max": "18000.00",
        },
        headers=headers,
    )
    assert update.status_code == 200, f"Update failed: {update.text}"
    updated = update.json()
    assert updated["title"] == "Senior Python Backend Engineer"

    # Add a skill to the job
    add_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_id": str(skill_id), "is_mandatory": True},
        headers=headers,
    )
    assert add_skill.status_code == 201

    # Edit the job again after adding a skill (should not cause 422)
    update2 = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "title": "Principal Python Backend Engineer",
            "description": "Lead Python backend architecture",
        },
        headers=headers,
    )
    assert update2.status_code == 200
    assert update2.json()["title"] == "Principal Python Backend Engineer"

    persisted_job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == UUID(job_id)))
    assert persisted_job is not None
    assert isinstance(persisted_job.job_profile_json, dict)
    critical_names = {
        item["name"]
        for item in persisted_job.job_profile_json.get("critical_requirements", [])
    }
    assert "Python" in critical_names


@pytest.mark.asyncio
async def test_removing_job_skill_regenerates_job_profile(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job-remove-skill@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job-remove-skill@test.com", "password123")

    skill = SkillModel(
        name="SQL",
        normalized_name="sql",
        category="data",
        aliases=["SQL Server"],
        is_verified=True,
    )
    db_session.add(skill)
    await db_session.commit()

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(
            title="Analista de Dados",
            description="Boa oportunidade",
            requirements="Apoiar rotinas do time",
        ),
        headers=headers,
    )
    assert create.status_code == 201
    job_id = UUID(create.json()["id"])

    add_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_id": str(skill.id), "is_mandatory": True},
        headers=headers,
    )
    assert add_skill.status_code == 201

    await client.delete(f"/api/v1/jobs/{job_id}/skills/{skill.id}", headers=headers)

    persisted_job = await db_session.scalar(sa.select(JobModel).where(JobModel.id == job_id))
    assert persisted_job is not None
    critical_names = {
        item["name"]
        for item in (persisted_job.job_profile_json or {}).get("critical_requirements", [])
    }
    assert "SQL" not in critical_names


@pytest.mark.asyncio
async def test_match_endpoint_persists_job_candidate_ranking(
    client: AsyncClient,
    db_session: AsyncSession,
):
    candidate = await _create_active_user(
        db_session,
        "candidate-ranking@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    await _create_active_user(
        db_session,
        "recruiter-ranking@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    candidate_headers = await _auth_headers(client, "candidate-ranking@test.com", "password123")
    recruiter_headers = await _auth_headers(client, "recruiter-ranking@test.com", "password123")

    db_session.add(
        CandidateModel(
            user_id=candidate.id,
            full_name="Candidate Ranking",
            email="candidate-ranking@test.com",
            created_by=candidate.id,
        )
    )
    await db_session.commit()

    resume_upload = await client.post("/api/v1/resumes", headers=candidate_headers)
    assert resume_upload.status_code == 202
    resume_version_id = UUID(resume_upload.json()["version_id"])

    skill = await db_session.scalar(
        sa.select(SkillModel).where(SkillModel.normalized_name == "python", SkillModel.deleted_at.is_(None))
    )
    if skill is None:
        skill = SkillModel(
            name="Python",
            normalized_name="python",
            category="backend",
            aliases=[],
            is_verified=True,
        )
        db_session.add(skill)
        await db_session.flush()

    ai_model = AIModelModel(
        provider="anthropic",
        model_id=f"claude-ranking-{uuid4()}",
        model_name="Claude Ranking Test",
        is_active=True,
    )
    prompt = PromptTemplateModel(
        name=f"ranking_prompt_{uuid4()}",
        version=1,
        template_type="full_analysis",
        user_prompt_template="Analyze resume",
        is_active=True,
        created_by=candidate.id,
    )
    db_session.add_all([ai_model, prompt])
    await db_session.flush()

    analysis_id = uuid4()
    now = datetime.now(UTC)
    analysis = AnalysisModel(
        id=analysis_id,
        resume_version_id=resume_version_id,
        ai_model_id=ai_model.id,
        prompt_template_id=prompt.id,
        status="completed",
        requested_by=candidate.id,
        created_at=now,
        updated_at=now,
    )
    result = AnalysisResultModel(
        id=uuid4(),
        analysis_id=analysis_id,
        overall_score="88.00",
        technical_score="92.00",
        experience_score="80.00",
        education_score="75.00",
        communication_score="85.00",
        leadership_score="70.00",
        candidate_summary="Perfil backend forte.",
        seniority_level="senior",
        total_experience_years="6.0",
        strengths=["Python"],
        weaknesses=[],
        recommendations=[],
        keywords=["python", "fastapi"],
        extracted_data={"skills": [{"name": "Python"}]},
        created_at=now,
    )
    db_session.add_all([analysis, result])
    await db_session.commit()

    job = await client.post(
        "/api/v1/jobs",
        json=_job_payload(),
        headers=recruiter_headers,
    )
    assert job.status_code == 201
    job_id = job.json()["id"]

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=recruiter_headers)
    assert publish.status_code == 200

    add_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_id": str(skill.id), "is_mandatory": True},
        headers=recruiter_headers,
    )
    assert add_skill.status_code == 201

    auto_matched = await AnalysisService(
        SQLAlchemyAnalysisRepository(db_session)
    ).auto_match_published_jobs(analysis_id)
    await db_session.commit()
    assert auto_matched >= 1

    match = await client.post(
        f"/api/v1/analyses/{analysis_id}/match/{job_id}",
        headers=recruiter_headers,
    )
    assert match.status_code == 200
    assert match.json()["recommendation"] in {"strong_match", "good_match", "potential"}

    persisted = await db_session.scalar(
        sa.select(ResumeJobMatchModel).where(
            ResumeJobMatchModel.analysis_id == analysis_id,
            ResumeJobMatchModel.job_id == UUID(job_id),
        )
    )
    assert persisted is not None
    assert persisted.matched_skills == ["Python"]
    assert persisted.missing_skills == []

    ranking = await client.get(f"/api/v1/jobs/{job_id}/candidates", headers=recruiter_headers)
    assert ranking.status_code == 200
    candidates = ranking.json()["candidates"]
    assert len(candidates) == 1
    assert candidates[0]["candidate_name"] == "Candidate Ranking"
    assert candidates[0]["recommendation"] == match.json()["recommendation"]


@pytest.mark.asyncio
async def test_updating_job_does_not_mix_pipeline_candidates_between_jobs(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-pipeline-isolation@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-pipeline-isolation@test.com", "password123")

    candidate_response = await client.post(
        "/api/v1/candidates",
        json={
            "full_name": "Pipeline Isolation Candidate",
            "email": f"pipeline-isolation-{uuid4().hex[:8]}@test.com",
        },
        headers=headers,
    )
    assert candidate_response.status_code == 201
    candidate_id = candidate_response.json()["id"]

    job_a_response = await client.post(
        "/api/v1/jobs",
        json=_job_payload(title="Job A"),
        headers=headers,
    )
    assert job_a_response.status_code == 201
    job_a_id = job_a_response.json()["id"]

    job_b_response = await client.post(
        "/api/v1/jobs",
        json=_job_payload(title="Job B"),
        headers=headers,
    )
    assert job_b_response.status_code == 201
    job_b_id = job_b_response.json()["id"]

    publish_skill = SkillModel(
        name="Python",
        normalized_name=f"python-publish-{uuid4().hex[:8]}",
        category="backend",
        aliases=[],
        is_verified=True,
    )
    db_session.add(publish_skill)
    await db_session.commit()

    for job_id in (job_a_id, job_b_id):
        add_skill = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={"skill_id": str(publish_skill.id), "is_mandatory": True},
            headers=headers,
        )
        assert add_skill.status_code == 201
        publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=headers)
        assert publish.status_code == 200

    add_to_job = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": job_a_id, "initial_stage": "entry"},
        headers=headers,
    )
    assert add_to_job.status_code == 200

    board_a = await client.get(f"/api/v1/pipeline/{job_a_id}", headers=headers)
    assert board_a.status_code == 200
    candidate_ids_a = {
        candidate["candidate_id"]
        for column in board_a.json()["columns"]
        for candidate in column["candidates"]
    }
    assert candidate_id in candidate_ids_a

    board_b = await client.get(f"/api/v1/pipeline/{job_b_id}", headers=headers)
    assert board_b.status_code == 200
    candidate_ids_b = {
        candidate["candidate_id"]
        for column in board_b.json()["columns"]
        for candidate in column["candidates"]
    }
    assert candidate_id not in candidate_ids_b

    update_job_a = await client.patch(
        f"/api/v1/jobs/{job_a_id}",
        json={"title": "Job A Updated"},
        headers=headers,
    )
    assert update_job_a.status_code == 200
    assert update_job_a.json()["title"] == "Job A Updated"

    board_a_after_update = await client.get(f"/api/v1/pipeline/{job_a_id}", headers=headers)
    assert board_a_after_update.status_code == 200
    candidate_ids_a_after_update = {
        candidate["candidate_id"]
        for column in board_a_after_update.json()["columns"]
        for candidate in column["candidates"]
    }
    assert candidate_id in candidate_ids_a_after_update

    board_b_after_update = await client.get(f"/api/v1/pipeline/{job_b_id}", headers=headers)
    assert board_b_after_update.status_code == 200
    candidate_ids_b_after_update = {
        candidate["candidate_id"]
        for column in board_b_after_update.json()["columns"]
        for candidate in column["candidates"]
    }
    assert candidate_id not in candidate_ids_b_after_update

    overview = await client.get(f"/api/v1/candidates/{candidate_id}/overview", headers=headers)
    assert overview.status_code == 200
    pipeline_entries = overview.json()["pipeline_entries"]
    assert len(pipeline_entries) == 1
    assert pipeline_entries[0]["job_id"] == job_a_id
