import io

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
async def test_user_can_upload_avatar(client: AsyncClient, db_session: AsyncSession):
    user = await _create_active_user(db_session, "avatar@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "avatar@test.com", "password123")

    png_data = b'\x89PNG\r\n\x1a\n' + b'x' * 2000
    files = {"file": ("avatar.png", io.BytesIO(png_data), "image/png")}

    response = await client.post("/api/v1/users/me/avatar", files=files, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["avatar_url"] is not None
    assert body["avatar_url"].startswith("/uploads/avatars/")
    assert "?v=" in body["avatar_url"]


@pytest.mark.asyncio
async def test_avatar_upload_rejects_non_image(client: AsyncClient, db_session: AsyncSession):
    user = await _create_active_user(db_session, "avatar-invalid@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "avatar-invalid@test.com", "password123")

    txt_data = b"This is not an image"
    files = {"file": ("fake.jpg", io.BytesIO(txt_data), "image/jpeg")}

    response = await client.post("/api/v1/users/me/avatar", files=files, headers=headers)
    assert response.status_code == 400
    assert "Apenas JPEG e PNG" in response.json()["detail"]


@pytest.mark.asyncio
async def test_avatar_upload_rejects_oversized_file(client: AsyncClient, db_session: AsyncSession):
    user = await _create_active_user(db_session, "avatar-oversized@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "avatar-oversized@test.com", "password123")

    png_header = b'\x89PNG\r\n\x1a\n'
    oversized = png_header + (b'x' * (3 * 1024 * 1024))
    files = {"file": ("avatar.png", io.BytesIO(oversized), "image/png")}

    response = await client.post("/api/v1/users/me/avatar", files=files, headers=headers)
    assert response.status_code == 400
    assert "muito grande" in response.json()["detail"]


@pytest.mark.asyncio
async def test_avatar_upload_detects_real_type(client: AsyncClient, db_session: AsyncSession):
    """Test that backend detects real file type regardless of MIME type sent by client."""
    user = await _create_active_user(db_session, "avatar-realtype@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "avatar-realtype@test.com", "password123")

    # Send PNG file but claim it's JPEG
    png_data = b'\x89PNG\r\n\x1a\n' + b'x' * 2000
    files = {"file": ("avatar.jpg", io.BytesIO(png_data), "image/jpeg")}

    response = await client.post("/api/v1/users/me/avatar", files=files, headers=headers)
    assert response.status_code == 200
    body = response.json()
    # Backend should have detected it's PNG and saved as .png
    assert ".png" in body["avatar_url"]


@pytest.mark.asyncio
async def test_avatar_url_includes_cache_busting(client: AsyncClient, db_session: AsyncSession):
    """Test that avatar_url includes timestamp for cache busting."""
    user = await _create_active_user(db_session, "avatar-cache@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "avatar-cache@test.com", "password123")

    png_data = b'\x89PNG\r\n\x1a\n' + b'x' * 2000
    files = {"file": ("avatar.png", io.BytesIO(png_data), "image/png")}

    response = await client.post("/api/v1/users/me/avatar", files=files, headers=headers)
    assert response.status_code == 200
    body = response.json()

    # Check cache busting timestamp
    assert "?v=" in body["avatar_url"]
    url_parts = body["avatar_url"].split("?v=")
    assert len(url_parts) == 2
    timestamp = url_parts[1]
    assert timestamp.isdigit()
    assert int(timestamp) > 1000000000  # Valid Unix timestamp


@pytest.mark.asyncio
async def test_avatar_upload_requires_auth(client: AsyncClient):
    """Test that avatar upload requires authentication."""
    png_data = b'\x89PNG\r\n\x1a\n' + b'x' * 2000
    files = {"file": ("avatar.png", io.BytesIO(png_data), "image/png")}

    response = await client.post("/api/v1/users/me/avatar", files=files)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_user_can_delete_avatar(client: AsyncClient, db_session: AsyncSession):
    """Test that user can delete their avatar."""
    user = await _create_active_user(db_session, "avatar-delete@test.com", "password123", UserRole.CANDIDATE)
    headers = await _auth_headers(client, "avatar-delete@test.com", "password123")

    # Upload avatar first
    png_data = b'\x89PNG\r\n\x1a\n' + b'x' * 2000
    files = {"file": ("avatar.png", io.BytesIO(png_data), "image/png")}
    upload = await client.post("/api/v1/users/me/avatar", files=files, headers=headers)
    assert upload.status_code == 200
    assert upload.json()["avatar_url"] is not None

    # Delete avatar
    delete = await client.delete("/api/v1/users/me/avatar", headers=headers)
    assert delete.status_code == 200
    assert delete.json()["avatar_url"] is None
