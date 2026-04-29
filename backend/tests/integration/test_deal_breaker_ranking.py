"""Integration tests for deal-breaker application in ranking.

Tests that deal-breakers properly eliminate candidates in the ranking system.
"""

import pytest
from decimal import Decimal
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from src.domain.entities.user import User, UserRole
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password
from src.application.services.candidate_ranking_service import CandidateRankingService


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


async def _login(client, email: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "password123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_deal_breaker_eliminates_candidate(
    client,
    db_session: AsyncSession,
):
    """Deal-breaker violation should result in zero score."""
    recruiter = await _create_recruiter(db_session, "recruiter@test.com")
    headers = await _login(client, "recruiter@test.com")

    # Create job with deal-breaker that requires São Paulo
    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Senior Backend Engineer",
            "description": "Build scalable microservices",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "São Paulo",
                    "reason": "Team is based in São Paulo",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )
    assert job_response.status_code == 201
    job_id = job_response.json()["id"]

    # Verify deal-breaker was persisted
    job_get = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert job_get.status_code == 200
    job_data = job_get.json()
    assert len(job_data["deal_breakers"]) == 1
    assert job_data["deal_breakers"][0]["field"] == "location"
    assert job_data["deal_breakers"][0]["value"] == "São Paulo"


@pytest.mark.asyncio
async def test_inactive_deal_breaker_not_applied(
    client,
    db_session: AsyncSession,
):
    """Inactive deal-breaker should not affect ranking."""
    recruiter = await _create_recruiter(db_session, "recruiter2@test.com")
    headers = await _login(client, "recruiter2@test.com")

    # Create job with INACTIVE deal-breaker
    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Backend Engineer",
            "description": "Build services",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "São Paulo",
                    "reason": "Location preference",
                    "is_active": False,
                }
            ],
        },
        headers=headers,
    )
    assert job_response.status_code == 201
    job_data = job_response.json()

    # Inactive deal-breaker should be persisted but not applied during ranking
    assert job_data["deal_breakers"][0]["is_active"] is False


@pytest.mark.asyncio
async def test_multiple_deal_breakers(
    client,
    db_session: AsyncSession,
):
    """Job with multiple deal-breakers."""
    recruiter = await _create_recruiter(db_session, "recruiter3@test.com")
    headers = await _login(client, "recruiter3@test.com")

    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Senior Developer",
            "description": "Senior position",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "São Paulo",
                    "reason": "Location requirement",
                    "is_active": True,
                },
                {
                    "field": "experience_years",
                    "operator": ">=",
                    "value": "8",
                    "reason": "Need 8+ years experience",
                    "is_active": True,
                },
                {
                    "field": "skill",
                    "operator": "contains",
                    "value": "Python",
                    "reason": "Python is mandatory",
                    "is_active": True,
                },
            ],
        },
        headers=headers,
    )
    assert job_response.status_code == 201
    job_data = job_response.json()

    # All 3 active deal-breakers should be persisted
    assert len(job_data["deal_breakers"]) == 3
    active_count = sum(1 for db in job_data["deal_breakers"] if db["is_active"])
    assert active_count == 3


@pytest.mark.asyncio
async def test_deal_breaker_with_education_level(
    client,
    db_session: AsyncSession,
):
    """Deal-breaker with education_level field."""
    recruiter = await _create_recruiter(db_session, "recruiter4@test.com")
    headers = await _login(client, "recruiter4@test.com")

    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Manager",
            "description": "Management role",
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
    assert job_response.status_code == 201
    job_data = job_response.json()

    assert len(job_data["deal_breakers"]) == 1
    assert job_data["deal_breakers"][0]["field"] == "education_level"
    assert job_data["deal_breakers"][0]["operator"] == ">="


@pytest.mark.asyncio
async def test_deal_breaker_update(
    client,
    db_session: AsyncSession,
):
    """Update deal-breaker in existing job."""
    recruiter = await _create_recruiter(db_session, "recruiter5@test.com")
    headers = await _login(client, "recruiter5@test.com")

    # Create job with one deal-breaker
    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Developer",
            "description": "Development role",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "Rio de Janeiro",
                    "reason": "Initial location",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )
    assert job_response.status_code == 201
    job_id = job_response.json()["id"]

    # Update deal-breaker
    update_response = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "equals",
                    "value": "São Paulo",
                    "reason": "Updated location",
                    "is_active": True,
                }
            ]
        },
        headers=headers,
    )
    assert update_response.status_code == 200
    updated = update_response.json()

    assert len(updated["deal_breakers"]) == 1
    assert updated["deal_breakers"][0]["value"] == "São Paulo"


@pytest.mark.asyncio
async def test_deal_breaker_in_operator(
    client,
    db_session: AsyncSession,
):
    """Deal-breaker with 'in' operator for location."""
    recruiter = await _create_recruiter(db_session, "recruiter6@test.com")
    headers = await _login(client, "recruiter6@test.com")

    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "Remote Developer",
            "description": "Work from any location",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "location",
                    "operator": "in",
                    "values": ["São Paulo", "Rio de Janeiro", "Belo Horizonte"],
                    "reason": "Candidate must be in these cities",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )
    assert job_response.status_code == 201
    job_data = job_response.json()

    assert len(job_data["deal_breakers"]) == 1
    assert job_data["deal_breakers"][0]["operator"] == "in"


@pytest.mark.asyncio
async def test_deal_breaker_not_equals_operator(
    client,
    db_session: AsyncSession,
):
    """Deal-breaker with 'not_equals' operator."""
    recruiter = await _create_recruiter(db_session, "recruiter7@test.com")
    headers = await _login(client, "recruiter7@test.com")

    job_response = await client.post(
        "/api/v1/jobs",
        json={
            "title": "On-site Developer",
            "description": "Must be on-site",
            "status": "draft",
            "deal_breakers": [
                {
                    "field": "work_model",
                    "operator": "not_equals",
                    "value": "remote",
                    "reason": "Cannot be remote",
                    "is_active": True,
                }
            ],
        },
        headers=headers,
    )
    assert job_response.status_code == 201
    job_data = job_response.json()

    assert len(job_data["deal_breakers"]) == 1
    assert job_data["deal_breakers"][0]["operator"] == "not_equals"
