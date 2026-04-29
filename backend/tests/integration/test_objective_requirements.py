"""Test objective job requirements (education level and years experience).

Validates:
- Create job with education_level and years_experience
- Update job with new values
- List/Get job returns the fields correctly
"""
import pytest
from decimal import Decimal
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
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
    assert job["deal_breakers"] == [
        {
            "field": "location",
            "operator": "not_equals",
            "value": "Sao Paulo",
            "reason": "Localizacao obrigatoria em Sao Paulo",
            "is_active": True,
        }
    ]


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
