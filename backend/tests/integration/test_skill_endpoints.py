import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
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


@pytest.mark.asyncio
async def test_recruiter_cannot_create_skill(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "recruiter-skill@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-skill@test.com", "password123")

    response = await client.post(
        "/api/v1/skills",
        json={"name": "FastAPI", "category": "framework"},
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_crud_skill_and_soft_delete(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "admin-skill@test.com",
        "password123",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, "admin-skill@test.com", "password123")

    create = await client.post(
        "/api/v1/skills",
        json={
            "name": "TypeScript Integration",
            "category": "programming_language",
            "aliases": ["TS"],
        },
        headers=headers,
    )
    assert create.status_code == 201
    created = create.json()
    assert created["normalized_name"] == "typescript integration"
    assert created["aliases"] == ["ts"]

    skill_id = created["id"]
    detail = await client.get(f"/api/v1/skills/{skill_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == skill_id

    listing = await client.get("/api/v1/skills?search=typescript", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == skill_id for item in listing.json())

    update = await client.patch(
        f"/api/v1/skills/{skill_id}",
        json={"name": "TypeScript Advanced", "is_verified": True},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["name"] == "TypeScript Advanced"
    assert update.json()["is_verified"] is True

    duplicate = await client.post(
        "/api/v1/skills",
        json={"name": "typescript advanced", "category": "programming_language"},
        headers=headers,
    )
    assert duplicate.status_code == 409

    delete = await client.delete(f"/api/v1/skills/{skill_id}", headers=headers)
    assert delete.status_code == 204

    deleted_detail = await client.get(f"/api/v1/skills/{skill_id}", headers=headers)
    assert deleted_detail.status_code == 404
