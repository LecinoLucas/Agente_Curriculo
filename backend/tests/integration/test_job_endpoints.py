from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.analysis_model import (
    AIModelModel,
    AnalysisModel,
    AnalysisResultModel,
    PromptTemplateModel,
)
from src.infrastructure.database.models.behavioral_template_model import (
    BehavioralAssessmentTemplateModel,
    BehavioralTemplateCompetencyModel,
    BehavioralTemplateQuestionModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.profile_analysis_model import CandidateJobMatchModel
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
        "description": (
            "Build and maintain backend APIs for high-volume hiring workflows, "
            "owning integrations, observability, automated tests, and production reliability."
        ),
        "requirements": (
            "Strong backend experience with Python, FastAPI, PostgreSQL, API design, "
            "testing, and production troubleshooting."
        ),
        "seniority_level": "senior",
        "minimum_education_level": "bachelor",
        "minimum_years_experience": "3.0",
        "work_model": "remote",
        "location": "Brasil",
        "salary_min": "12000.00",
        "salary_max": "18000.00",
        "salary_currency": "brl",
        "job_area": "technology",
        "responsibilities": (
            "Design backend services, maintain integrations, review code, improve observability, "
            "and support production incidents with clear ownership."
        ),
        "experience_context": "Experience delivering backend systems in production environments.",
        "behavioral_requirements": ["Ownership", "Clear communication"],
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

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(selection_flow_type="simple"),
        headers=headers,
    )
    assert create.status_code == 201
    created = create.json()
    assert created["title"] == "Backend Engineer"
    assert created["salary_currency"] == "BRL"

    job_id = created["id"]
    detail = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == job_id

    update = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"title": "Senior Backend Engineer", "salary_max": "20000.00"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["title"] == "Senior Backend Engineer"

    for skill_name in (f"Python CRUD {uuid4().hex[:8]}", f"FastAPI CRUD {uuid4().hex[:8]}"):
        add_skill = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={"skill_name": skill_name, "priority_level": "priority"},
            headers=headers,
        )
        assert add_skill.status_code == 201

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=headers)
    assert publish.status_code == 200
    assert publish.json()["status"] == "published"

    listing = await client.get("/api/v1/jobs", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == job_id for item in listing.json()["data"])

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


@pytest.mark.asyncio
async def test_create_job_persists_behavioral_template_id(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job-template@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job-template@test.com", "password123")

    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Template Persistência {uuid4().hex[:6]}",
        status="active",
        created_by=uuid4(),
    )
    db_session.add(template)
    await db_session.flush()
    competency = BehavioralTemplateCompetencyModel(
        id=uuid4(),
        template_id=template.id,
        name="Comunicação",
        display_order=1,
    )
    db_session.add(competency)
    await db_session.flush()
    db_session.add(
        BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Descreva um conflito complexo que você resolveu.",
            answer_type="text",
            display_order=1,
        )
    )
    await db_session.commit()

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(behavioral_template_id=str(template.id)),
        headers=headers,
    )
    assert create.status_code == 201, create.text
    created = create.json()
    assert created["behavioral_template_id"] == str(template.id)

    detail = await client.get(f"/api/v1/jobs/{created['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["behavioral_template_id"] == str(template.id)


@pytest.mark.asyncio
async def test_publish_job_with_behavioral_required_and_no_template_is_blocked(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job-template-missing@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job-template-missing@test.com", "password123")

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(requires_behavioral_assessment=True),
        headers=headers,
    )
    assert create.status_code == 201, create.text
    job_id = create.json()["id"]

    for skill_name in (f"Python Missing {uuid4().hex[:6]}", f"FastAPI Missing {uuid4().hex[:6]}"):
        add_skill = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={"skill_name": skill_name, "priority_level": "priority"},
            headers=headers,
        )
        assert add_skill.status_code == 201

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=headers)
    assert publish.status_code == 422
    payload = publish.json()
    assert payload["detail"]["error"] == "job_publication_validation_failed"
    assert "behavioral_template_id" in payload["detail"]["missing_fields"]


@pytest.mark.asyncio
async def test_publish_job_with_draft_behavioral_template_is_blocked(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _create_active_user(
        db_session,
        "recruiter-job-template-draft@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-job-template-draft@test.com", "password123")

    template = BehavioralAssessmentTemplateModel(
        id=uuid4(),
        name=f"Template Draft {uuid4().hex[:6]}",
        status="draft",
        created_by=uuid4(),
    )
    db_session.add(template)
    await db_session.flush()
    competency = BehavioralTemplateCompetencyModel(
        id=uuid4(),
        template_id=template.id,
        name="Liderança",
        display_order=1,
    )
    db_session.add(competency)
    await db_session.flush()
    db_session.add(
        BehavioralTemplateQuestionModel(
            id=uuid4(),
            competency_id=competency.id,
            question_text="Como você conduz decisões difíceis?",
            answer_type="text",
            display_order=1,
        )
    )
    await db_session.commit()

    create = await client.post(
        "/api/v1/jobs",
        json=_job_payload(behavioral_template_id=str(template.id)),
        headers=headers,
    )
    assert create.status_code == 201, create.text
    job_id = create.json()["id"]

    for skill_name in (f"Python Draft {uuid4().hex[:6]}", f"FastAPI Draft {uuid4().hex[:6]}"):
        add_skill = await client.post(
            f"/api/v1/jobs/{job_id}/skills",
            json={"skill_name": skill_name, "priority_level": "priority"},
            headers=headers,
        )
        assert add_skill.status_code == 201

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=headers)
    assert publish.status_code == 422
    payload = publish.json()
    assert payload["detail"]["error"] == "job_publication_validation_failed"
    assert "behavioral_template_status" in payload["detail"]["missing_fields"]


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

    skill_name = f"Python Skill {uuid4().hex[:8]}"

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
        json={"skill_name": skill_name, "priority_level": "priority"},
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


@pytest.mark.asyncio
async def test_match_endpoint_persists_candidate_job_match(
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
    recruiter_headers = await _auth_headers(client, "recruiter-ranking@test.com", "password123")

    candidate_profile = CandidateModel(
        user_id=candidate.id,
        full_name="Candidate Ranking",
        email="candidate-ranking@test.com",
        created_by=candidate.id,
    )
    db_session.add(candidate_profile)
    await db_session.commit()

    resume_upload = await client.post(
        "/api/v1/resumes",
        headers=recruiter_headers,
        json={"candidate_id": str(candidate_profile.id)},
    )
    assert resume_upload.status_code == 202
    resume_version_id = UUID(resume_upload.json()["version_id"])

    skill_name = f"Python Ranking Match {uuid4().hex[:8]}"
    secondary_skill_name = f"FastAPI Ranking Match {uuid4().hex[:8]}"

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
        candidate_summary="Perfil backend forte.",
        seniority_level="senior",
        total_experience_years="6.0",
        strengths=[skill_name, secondary_skill_name],
        weaknesses=[],
        recommendations=[],
        keywords=["python", "fastapi"],
        extracted_data={"skills": [{"name": skill_name}, {"name": secondary_skill_name}]},
        created_at=now,
    )
    db_session.add_all([analysis, result])
    await db_session.commit()

    job = await client.post(
        "/api/v1/jobs",
        json=_job_payload(selection_flow_type="simple"),
        headers=recruiter_headers,
    )
    assert job.status_code == 201
    job_id = job.json()["id"]

    add_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_name": skill_name, "priority_level": "priority"},
        headers=recruiter_headers,
    )
    assert add_skill.status_code == 201
    add_secondary_skill = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={"skill_name": secondary_skill_name, "priority_level": "priority"},
        headers=recruiter_headers,
    )
    assert add_secondary_skill.status_code == 201

    publish = await client.patch(f"/api/v1/jobs/{job_id}/publish", headers=recruiter_headers)
    assert publish.status_code == 200

    match = await client.post(
        f"/api/v1/analyses/{analysis_id}/match/{job_id}",
        headers=recruiter_headers,
    )
    assert match.status_code == 200
    assert match.json()["recommendation"] in {"strong_match", "good_match", "review_manually"}

    persisted = await db_session.scalar(
        sa.select(CandidateJobMatchModel).where(
            CandidateJobMatchModel.resume_version_id == resume_version_id,
            CandidateJobMatchModel.job_id == UUID(job_id),
        )
    )
    assert persisted is not None
    assert set(persisted.matched_skills_json) == {skill_name, secondary_skill_name}
    assert persisted.missing_skills_json == []


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
        json=_job_payload(title="Job A", selection_flow_type="simple"),
        headers=headers,
    )
    assert job_a_response.status_code == 201
    job_a_id = job_a_response.json()["id"]

    job_b_response = await client.post(
        "/api/v1/jobs",
        json=_job_payload(title="Job B", selection_flow_type="simple"),
        headers=headers,
    )
    assert job_b_response.status_code == 201
    job_b_id = job_b_response.json()["id"]

    for job_id in (job_a_id, job_b_id):
        for skill_name in (
            f"Pipeline Isolation Python {job_id[:8]}",
            f"Pipeline Isolation FastAPI {job_id[:8]}",
        ):
            add_skill = await client.post(
                f"/api/v1/jobs/{job_id}/skills",
                json={"skill_name": skill_name, "priority_level": "priority"},
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
