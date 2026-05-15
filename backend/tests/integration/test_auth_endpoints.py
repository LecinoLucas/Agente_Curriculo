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


@pytest.mark.asyncio
async def test_refresh_with_valid_token_returns_new_tokens(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "refresh@test.com", "password123")

    # Login para obter refresh token
    login_response = await client.post("/api/v1/auth/login", json={
        "email": "refresh@test.com",
        "password": "password123",
    })
    assert login_response.status_code == 200

    # Refresh deve retornar novo access token
    refresh_response = await client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 200
    data = refresh_response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "refresh_token" in refresh_response.cookies


@pytest.mark.asyncio
async def test_refresh_with_invalid_token_returns_401(client: AsyncClient):
    # Refresh sem valid refresh token no cookie
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    assert "inválido" in response.json()["detail"].lower() or "ausente" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_with_malformed_uuid_in_redis_returns_401(client: AsyncClient, db_session: AsyncSession, fake_redis):
    """Simula token com user_id inválido (não UUID) armazenado no Redis"""
    import hashlib

    # Cria um token inválido
    invalid_token = "invalid_refresh_token_xyz"
    token_hash = hashlib.sha256(invalid_token.encode()).hexdigest()
    redis_key = f"session:refresh:{token_hash}"

    # Armazena um user_id inválido (não UUID) no Redis
    await fake_redis.setex(redis_key, 3600, "not_a_valid_uuid_email@example.com")

    # Tenta refresh com esse token inválido
    response = await client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": invalid_token}
    )

    # Deve retornar 401, não 500
    assert response.status_code == 401
    assert "inválido" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_refresh_with_nonexistent_user_returns_401(client: AsyncClient, db_session: AsyncSession, fake_redis):
    """Simula token com user_id válido (UUID) mas usuário inexistente"""
    import hashlib
    from uuid import uuid4

    # Cria um token com UUID válido mas usuário inexistente
    invalid_token = "nonexistent_user_token"
    token_hash = hashlib.sha256(invalid_token.encode()).hexdigest()
    redis_key = f"session:refresh:{token_hash}"

    # Armazena um UUID válido mas inexistente
    nonexistent_uuid = str(uuid4())
    await fake_redis.setex(redis_key, 3600, nonexistent_uuid)

    # Tenta refresh
    response = await client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": invalid_token}
    )

    # Deve retornar 401
    assert response.status_code == 401
    assert "não encontrado" in response.json()["detail"].lower() or "inativo" in response.json()["detail"].lower()
