import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


async def _create_active_user(session: AsyncSession, email: str, password: str) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(email=email, password_hash=hash_password(password), full_name="Test User")
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user


@pytest.mark.asyncio
async def test_login_returns_access_token(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "login@test.com", "password123")

    response = await client.post("/api/v1/auth/login", json={
        "email": "login@test.com",
        "password": "password123",
    })

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "refresh_token" in response.cookies


@pytest.mark.asyncio
async def test_login_with_wrong_password_returns_401(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "wrong@test.com", "correct_password")

    response = await client.post("/api/v1/auth/login", json={
        "email": "wrong@test.com",
        "password": "wrong_password",
    })

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_requires_auth(client: AsyncClient):
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me_returns_current_user(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "me@test.com", "password123")

    login = await client.post("/api/v1/auth/login", json={
        "email": "me@test.com",
        "password": "password123",
    })
    token = login.json()["access_token"]

    response = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "me@test.com"
