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
async def test_recruiter_cannot_manage_ai_models(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "recruiter-ai@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-ai@test.com", "password123")

    response = await client.post(
        "/api/v1/ai-models",
        json={
            "provider": "openai",
            "model_id": "gpt-test-model",
            "model_name": "GPT Test Model",
            "context_window": 128000,
        },
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_manage_ai_model_lifecycle(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "admin-ai-model@test.com",
        "password123",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, "admin-ai-model@test.com", "password123")

    create = await client.post(
        "/api/v1/ai-models",
        json={
            "provider": "openai",
            "model_id": "gpt-integration-test",
            "model_name": "GPT Integration Test",
            "context_window": 128000,
        },
        headers=headers,
    )
    assert create.status_code == 201
    created = create.json()
    assert created["model_id"] == "gpt-integration-test"
    assert created["is_active"] is True

    model_pk = created["id"]
    duplicate = await client.post(
        "/api/v1/ai-models",
        json={
            "provider": "openai",
            "model_id": "gpt-integration-test",
            "model_name": "Duplicate Model",
        },
        headers=headers,
    )
    assert duplicate.status_code == 409

    listing = await client.get("/api/v1/ai-models", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == model_pk for item in listing.json())

    detail = await client.get(f"/api/v1/ai-models/{model_pk}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == model_pk

    patch = await client.patch(
        f"/api/v1/ai-models/{model_pk}",
        json={"model_name": "GPT Integration Test Updated", "is_active": False},
        headers=headers,
    )
    assert patch.status_code == 200
    assert patch.json()["model_name"] == "GPT Integration Test Updated"
    assert patch.json()["is_active"] is False
    assert patch.json()["deprecated_at"] is not None

    reactivate = await client.patch(
        f"/api/v1/ai-models/{model_pk}",
        json={"is_active": True},
        headers=headers,
    )
    assert reactivate.status_code == 200
    assert reactivate.json()["is_active"] is True
    assert reactivate.json()["deprecated_at"] is None


@pytest.mark.asyncio
async def test_admin_can_manage_prompt_template_lifecycle(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "admin-prompt@test.com",
        "password123",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, "admin-prompt@test.com", "password123")

    create = await client.post(
        "/api/v1/prompt-templates",
        json={
            "name": "resume_analysis_test",
            "version": 1,
            "description": "Initial test template",
            "template_type": "full_analysis",
            "system_prompt": "You are a resume analyzer.",
            "user_prompt_template": "Analyze this resume content carefully.",
            "output_schema": {"type": "object"},
            "max_tokens": 1024,
            "temperature": "0.2",
        },
        headers=headers,
    )
    assert create.status_code == 201
    created = create.json()
    assert created["name"] == "resume_analysis_test"
    assert created["is_active"] is False

    template_id = created["id"]
    duplicate = await client.post(
        "/api/v1/prompt-templates",
        json={
            "name": "resume_analysis_test",
            "version": 1,
            "template_type": "full_analysis",
            "user_prompt_template": "Analyze this resume content carefully.",
        },
        headers=headers,
    )
    assert duplicate.status_code == 409

    listing = await client.get("/api/v1/prompt-templates", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == template_id for item in listing.json())

    detail = await client.get(f"/api/v1/prompt-templates/{template_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == template_id

    patch = await client.patch(
        f"/api/v1/prompt-templates/{template_id}",
        json={
            "description": "Updated test template",
            "user_prompt_template": "Analyze this resume content and return structured JSON.",
            "max_tokens": 2048,
        },
        headers=headers,
    )
    assert patch.status_code == 200
    assert patch.json()["description"] == "Updated test template"
    assert patch.json()["max_tokens"] == 2048

    activate = await client.patch(f"/api/v1/prompt-templates/{template_id}/activate", headers=headers)
    assert activate.status_code == 200
    assert activate.json()["is_active"] is True
    assert activate.json()["activated_at"] is not None

    deactivate = await client.patch(f"/api/v1/prompt-templates/{template_id}/deactivate", headers=headers)
    assert deactivate.status_code == 200
    assert deactivate.json()["is_active"] is False
    assert deactivate.json()["deactivated_at"] is not None
