"""Test objective job requirements (education level and years experience).

Validates:
- Create job with education_level and years_experience
- Update job with new values
- List/Get job returns the fields correctly
"""
import pytest
from decimal import Decimal
from httpx import AsyncClient
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


async def _create_recruiter(db: AsyncSession, email: str) -> User:
    repo = SQLAlchemyUserRepository(db)
    user = User.create(
        email=email,
        password_hash=hash_password("password123"),
        full_name="Recruiter",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    await repo.save(user)
    await db.commit()
    return user


async def _login(client: AsyncClient, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_create_job_with_objective_requirements(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Create job with minimum_education_level and minimum_years_experience."""
    recruiter = await _create_recruiter(db_session, "recruiter1@test.com")
    headers = await _login(client, "recruiter1@test.com")

    # Create job with objective requirements
    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Senior Backend Engineer",
            "description": "Build scalable microservices",
            "status": "draft",
            "minimum_education_level": "bachelor",
            "minimum_years_experience": 5.0,
            "seniority_level": "senior",
            "work_model": "remote",
            "location": "São Paulo",
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert job["title"] == "Senior Backend Engineer"
    assert job["minimum_education_level"] == "bachelor"
    assert float(job["minimum_years_experience"]) == 5.0


@pytest.mark.asyncio
async def test_get_job_returns_objective_requirements(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """GET /jobs/:id returns education_level and years_experience."""
    recruiter = await _create_recruiter(db_session, "recruiter2@test.com")
    headers = await _login(client, "recruiter2@test.com")

    # Create job
    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Data Scientist",
            "description": "ML and analytics",
            "status": "draft",
            "minimum_education_level": "master",
            "minimum_years_experience": 3.0,
        },
        headers=headers,
    )
    job_id = create_response.json()["id"]

    # Get job
    get_response = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert get_response.status_code == 200
    job = get_response.json()
    assert job["minimum_education_level"] == "master"
    assert float(job["minimum_years_experience"]) == 3.0


@pytest.mark.asyncio
async def test_list_jobs_includes_objective_requirements(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """GET /jobs returns education_level and years_experience for all jobs."""
    recruiter = await _create_recruiter(db_session, "recruiter3@test.com")
    headers = await _login(client, "recruiter3@test.com")

    # Create job
    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Product Manager",
            "description": "Lead product strategy",
            "status": "draft",
            "minimum_education_level": "bachelor",
            "minimum_years_experience": 4.0,
        },
        headers=headers,
    )
    created_job_id = create_response.json()["id"]

    # List jobs
    list_response = await client.get("/api/v1/jobs", headers=headers)
    assert list_response.status_code == 200
    jobs = list_response.json()["data"]

    job = next((j for j in jobs if j["id"] == created_job_id), None)
    assert job is not None
    assert job["minimum_education_level"] == "bachelor"
    assert float(job["minimum_years_experience"]) == 4.0


@pytest.mark.asyncio
async def test_update_job_objective_requirements(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """PATCH /jobs/:id can update objective requirements."""
    recruiter = await _create_recruiter(db_session, "recruiter4@test.com")
    headers = await _login(client, "recruiter4@test.com")

    # Create job with initial requirements
    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "QA Engineer",
            "description": "Quality assurance",
            "status": "draft",
            "minimum_education_level": "high_school",
            "minimum_years_experience": 1.0,
        },
        headers=headers,
    )
    job_id = create_response.json()["id"]

    # Update requirements
    update_response = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "minimum_education_level": "technical",
            "minimum_years_experience": 2.5,
        },
        headers=headers,
    )

    assert update_response.status_code == 200
    updated_job = update_response.json()
    assert updated_job["minimum_education_level"] == "technical"
    assert float(updated_job["minimum_years_experience"]) == 2.5


@pytest.mark.asyncio
async def test_update_already_published_job_does_not_revalidate_publication_during_edit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_recruiter(db_session, "recruiter-published-edit@test.com")
    headers = await _login(client, "recruiter-published-edit@test.com")

    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Published Job In Draft Edit Flow",
            "description": "Initial description",
            "status": "draft",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["id"]

    job = await db_session.get(JobModel, UUID(job_id))
    assert job is not None
    job.status = "published"
    await db_session.commit()

    update_response = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "title": "Published Job In Draft Edit Flow Updated",
            "description": "Updated while the form is still incomplete",
            "status": "published",
        },
        headers=headers,
    )

    assert update_response.status_code == 200
    updated_job = update_response.json()
    assert updated_job["status"] == "published"
    assert updated_job["title"] == "Published Job In Draft Edit Flow Updated"


@pytest.mark.asyncio
async def test_update_draft_job_to_published_still_validates_publication_requirements(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_recruiter(db_session, "recruiter-draft-publish@test.com")
    headers = await _login(client, "recruiter-draft-publish@test.com")

    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Incomplete Draft Publish Attempt",
            "description": "Incomplete description",
            "status": "draft",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["id"]

    update_response = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "status": "published",
        },
        headers=headers,
    )

    assert update_response.status_code == 422
    assert update_response.json()["detail"]["error"] == "job_publication_validation_failed"


@pytest.mark.asyncio
async def test_patch_job_skill_updates_existing_link_without_delete_recreate(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_recruiter(db_session, "recruiter-skill-patch@test.com")
    headers = await _login(client, "recruiter-skill-patch@test.com")

    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Skill Patch Job",
            "description": "Testing skill priority update",
            "status": "draft",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["id"]

    add_response = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={
            "skill_name": "React",
            "priority_level": "complementary",
            "weight": 1,
        },
        headers=headers,
    )
    assert add_response.status_code == 201
    skill_link = add_response.json()

    patch_response = await client.patch(
        f"/api/v1/jobs/{job_id}/skills/{skill_link['id']}",
        json={
            "priority_level": "priority",
            "weight": 2,
        },
        headers=headers,
    )

    assert patch_response.status_code == 200
    updated_link = patch_response.json()
    assert updated_link["id"] == skill_link["id"]
    assert updated_link["skill_id"] == skill_link["skill_id"]
    assert updated_link["priority_level"] == "priority"
    assert float(updated_link["weight"]) == 2


@pytest.mark.asyncio
async def test_delete_job_skill_accepts_link_id(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_recruiter(db_session, "recruiter-skill-delete-link@test.com")
    headers = await _login(client, "recruiter-skill-delete-link@test.com")

    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Skill Delete Link Job",
            "description": "Testing delete by link id",
            "status": "draft",
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["id"]

    add_response = await client.post(
        f"/api/v1/jobs/{job_id}/skills",
        json={
            "skill_name": "Node.js",
            "priority_level": "priority",
        },
        headers=headers,
    )
    assert add_response.status_code == 201
    skill_link = add_response.json()

    delete_response = await client.delete(
        f"/api/v1/jobs/{job_id}/skills/{skill_link['id']}",
        headers=headers,
    )

    assert delete_response.status_code == 204


@pytest.mark.asyncio
async def test_create_job_persists_deal_breakers(
    client: AsyncClient,
    db_session: AsyncSession,
):
    recruiter = await _create_recruiter(db_session, "recruiter-dealbreakers@test.com")
    headers = await _login(client, "recruiter-dealbreakers@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Platform Engineer",
            "description": "Distributed systems and backend ownership",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "not_equals",
                    "value": "Sao Paulo",
                    "reason": "Localizacao obrigatoria em Sao Paulo",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert len(job["deal_breakers"]) == 1
    db = job["deal_breakers"][0]
    assert db["field"] == "location"
    assert db["operator"] == "not_equals"
    assert db["value"] == "Sao Paulo"
    assert db["reason"] == "Localizacao obrigatoria em Sao Paulo"
    assert db["is_active"] is True


@pytest.mark.asyncio
async def test_optional_objective_requirements(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Creating job without objective requirements should work (optional fields)."""
    recruiter = await _create_recruiter(db_session, "recruiter5@test.com")
    headers = await _login(client, "recruiter5@test.com")

    # Create job WITHOUT objective requirements
    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Freelancer Position",
            "description": "Flexible role",
            "status": "draft",
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert job["minimum_education_level"] is None
    assert job["minimum_years_experience"] is None


@pytest.mark.asyncio
async def test_all_education_levels(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test all valid education level values."""
    recruiter = await _create_recruiter(db_session, "recruiter6@test.com")
    headers = await _login(client, "recruiter6@test.com")

    education_levels = ["none", "high_school", "technical", "bachelor", "postgraduate", "master", "phd"]

    for i, level in enumerate(education_levels):
        response = await client.post(
            "/api/v1/jobs",
            json={
                "title": f"Job {i}",
                "description": f"Description for {level}",
                "status": "draft",
                "minimum_education_level": level,
            },
            headers=headers,
        )
        assert response.status_code == 201
        job = response.json()
        assert job["minimum_education_level"] == level


@pytest.mark.asyncio
async def test_edit_deal_breakers(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """PATCH /jobs/:id can update deal-breakers."""
    recruiter = await _create_recruiter(db_session, "recruiter7@test.com")
    headers = await _login(client, "recruiter7@test.com")

    # Create job with initial deal-breaker
    create_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Senior Developer",
            "description": "Senior role",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "not_equals",
                    "value": "Remote",
                    "reason": "Must be onsite",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )
    job_id = create_response.json()["id"]

    # Update deal-breakers
    update_response = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "deal_breakers": [
                {
                    "field": "experience_years",
                    "operator": ">=",
                    "value": "5",
                    "reason": "Must have 5+ years",
                    "is_active": True,
                }
            ]
        },
        headers=headers,
    )

    assert update_response.status_code == 200
    updated_job = update_response.json()
    assert len(updated_job["deal_breakers"]) == 1
    db = updated_job["deal_breakers"][0]
    assert db["field"] == "experience_years"
    assert db["operator"] == ">="


@pytest.mark.asyncio
async def test_deal_breaker_with_contains_operator(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test deal-breaker with 'contains' operator on location field."""
    recruiter = await _create_recruiter(db_session, "recruiter8@test.com")
    headers = await _login(client, "recruiter8@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Python specialist",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "contains",
                    "value": "office",
                    "reason": "Must be office-based location",
                    "is_active": False,
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert len(job["deal_breakers"]) == 1
    db = job["deal_breakers"][0]
    assert db["operator"] == "contains"
    assert db["is_active"] is False


@pytest.mark.asyncio
async def test_multiple_deal_breakers(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test job with multiple deal-breakers."""
    recruiter = await _create_recruiter(db_session, "recruiter9@test.com")
    headers = await _login(client, "recruiter9@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Specialist",
            "description": "Niche role",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "Remote",
                    "reason": "Location is mandatory",
                    "is_active": True,
                },
                {
                    "field": "experience_years",
                    "operator": ">=",
                    "value": "5",
                    "reason": "Minimum 5 years",
                    "is_active": True,
                },
            ],
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert len(job["deal_breakers"]) == 2
    assert job["deal_breakers"][0]["field"] == "location"
    assert job["deal_breakers"][1]["field"] == "experience_years"


@pytest.mark.asyncio
async def test_invalid_deal_breaker_field(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test that invalid field is rejected."""
    recruiter = await _create_recruiter(db_session, "recruiter10@test.com")
    headers = await _login(client, "recruiter10@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Test Job",
            "description": "Test description",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "invalid_field",
                    "operator": "equals",
                    "value": "test",
                    "reason": "Invalid field should be rejected",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_invalid_operator_for_field(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test that invalid operator for field is rejected."""
    recruiter = await _create_recruiter(db_session, "recruiter11@test.com")
    headers = await _login(client, "recruiter11@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Test Job",
            "description": "Test description",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "experience_years",
                    "operator": "contains",  # Invalid: contains not allowed for experience_years
                    "value": "test",
                    "reason": "Should reject contains operator for years",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_skill_field_with_contains_operator(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test skill field with correct operators."""
    recruiter = await _create_recruiter(db_session, "recruiter12@test.com")
    headers = await _login(client, "recruiter12@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Developer",
            "description": "Must have Python",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "skill",
                    "operator": "not_contains",
                    "value": "Java",
                    "reason": "Java developers not wanted",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert job["deal_breakers"][0]["field"] == "skill"
    assert job["deal_breakers"][0]["operator"] == "not_contains"


@pytest.mark.asyncio
async def test_education_level_with_gte_operator(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Test education_level field with >= operator."""
    recruiter = await _create_recruiter(db_session, "recruiter13@test.com")
    headers = await _login(client, "recruiter13@test.com")

    response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Senior Role",
            "description": "Requires education",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "education_level",
                    "operator": ">=",
                    "value": "bachelor",
                    "reason": "Minimum bachelor degree required",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )

    assert response.status_code == 201
    job = response.json()
    assert job["deal_breakers"][0]["operator"] == ">="
