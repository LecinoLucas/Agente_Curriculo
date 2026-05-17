from uuid import uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserPreferredTheme, UserRole
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password


async def _create_user(
    db_session: AsyncSession,
    email: str,
    password: str = "password123",
    role: UserRole = UserRole.RECRUITER,
    preferred_theme: str | None = "theme_4",
) -> User:
    repo = SQLAlchemyUserRepository(db_session)
    user = User.create(
        email=email,
        password_hash=hash_password(password),
        full_name="Theme User",
        role=role,
        is_active=True,
    )
    if preferred_theme is None:
        user.preferred_theme = None
    else:
        user.preferred_theme = UserPreferredTheme(preferred_theme)
    await repo.save(user)
    await db_session.commit()
    return user


async def _login(client: AsyncClient, email: str, password: str = "password123") -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.mark.asyncio
async def test_me_returns_preferred_theme(client: AsyncClient, db_session: AsyncSession) -> None:
    await _create_user(db_session, "theme-me@example.com", preferred_theme="theme_3")
    headers = await _login(client, "theme-me@example.com")

    response = await client.get("/api/v1/users/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["preferred_theme"] == "theme_3"


@pytest.mark.asyncio
async def test_me_returns_theme_4_when_preferred_theme_is_null(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    user = UserModel(
        id=uuid4(),
        email="theme-null@example.com",
        full_name="Null Theme User",
        role="recruiter",
        status="active",
        password_hash=hash_password("password123"),
        preferred_theme=None,
    )
    db_session.add(user)
    await db_session.commit()
    headers = await _login(client, "theme-null@example.com")

    response = await client.get("/api/v1/users/me", headers=headers)

    assert response.status_code == 200
    assert response.json()["preferred_theme"] == "theme_4"


@pytest.mark.asyncio
async def test_update_preferred_theme_saves_only_current_user(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    current = await _create_user(db_session, "theme-current@example.com", preferred_theme="theme_1")
    other = await _create_user(db_session, "theme-other@example.com", preferred_theme="theme_3")
    headers = await _login(client, "theme-current@example.com")

    response = await client.patch(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={"preferred_theme": "theme_2"},
    )

    assert response.status_code == 200
    assert response.json() == {"preferred_theme": "theme_2"}

    rows = await db_session.execute(
        sa.select(UserModel.id, UserModel.preferred_theme).where(
            UserModel.id.in_([current.id, other.id])
        )
    )
    themes = {row.id: row.preferred_theme for row in rows}
    assert themes[current.id] == "theme_2"
    assert themes[other.id] == "theme_3"


@pytest.mark.asyncio
async def test_update_preferred_theme_rejects_invalid_value(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_user(db_session, "theme-invalid@example.com")
    headers = await _login(client, "theme-invalid@example.com")

    response = await client.patch(
        "/api/v1/users/me/preferences",
        headers=headers,
        json={"preferred_theme": "theme_99"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_preferences_endpoint_does_not_update_another_user(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    await _create_user(db_session, "theme-admin@example.com", role=UserRole.ADMIN)
    other = await _create_user(db_session, "theme-target@example.com", preferred_theme="theme_1")
    headers = await _login(client, "theme-admin@example.com")

    response = await client.patch(
        f"/api/v1/users/{other.id}/preferences",
        headers=headers,
        json={"preferred_theme": "theme_4"},
    )

    assert response.status_code == 404
    refreshed = await db_session.get(UserModel, other.id)
    assert refreshed is not None
    assert refreshed.preferred_theme == "theme_1"
