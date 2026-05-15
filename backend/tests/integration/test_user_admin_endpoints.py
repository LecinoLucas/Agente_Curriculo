import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole, UserStatus
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
async def test_user_stats_returns_accurate_counts(client: AsyncClient, db_session: AsyncSession):
    """GET /users/stats deve retornar contagens reais do banco em uma única query."""
    # Cria usuários com papéis e status variados
    admin = await _create_active_user(db_session, "stats-admin@test.com", "password123", UserRole.ADMIN)
    recruiter = await _create_active_user(db_session, "stats-recruiter@test.com", "password123", UserRole.RECRUITER)
    viewer = await _create_active_user(db_session, "stats-viewer@test.com", "password123", UserRole.VIEWER)
    headers = await _auth_headers(client, "stats-admin@test.com", "password123")

    # Snapshot antes da criação dos usuários de teste já inclui os 3 acima
    r = await client.get("/api/v1/users/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()

    # Campos obrigatórios presentes
    required = {
        "total_users", "active_users", "inactive_users",
        "suspended_users", "pending_users",
        "admins", "recruiters", "viewers", "candidates",
    }
    assert required.issubset(data.keys())

    # Todos os valores são inteiros não-negativos
    for field in required:
        assert isinstance(data[field], int), f"{field} deve ser int"
        assert data[field] >= 0, f"{field} não pode ser negativo"

    # Os 3 usuários criados acima devem estar refletidos
    assert data["total_users"] >= 3
    assert data["active_users"] >= 3
    assert data["admins"] >= 1
    assert data["recruiters"] >= 1
    assert data["viewers"] >= 1

    # Consistência: soma dos papéis não supera o total (usuários deletados são excluídos)
    role_sum = data["admins"] + data["recruiters"] + data["viewers"] + data["candidates"]
    assert role_sum <= data["total_users"]

    # Consistência: soma dos status == total_users
    status_sum = (
        data["active_users"]
        + data["inactive_users"]
        + data["suspended_users"]
        + data["pending_users"]
    )
    assert status_sum == data["total_users"]

    _ = admin, recruiter, viewer  # evita aviso de variável não usada


@pytest.mark.asyncio
async def test_user_stats_requires_admin(client: AsyncClient, db_session: AsyncSession):
    """Recrutador não deve acessar /users/stats."""
    await _create_active_user(db_session, "stats-nonadmin@test.com", "password123", UserRole.RECRUITER)
    headers = await _auth_headers(client, "stats-nonadmin@test.com", "password123")

    r = await client.get("/api/v1/users/stats", headers=headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_cannot_create_user(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(
        db_session,
        "recruiter-user@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, "recruiter-user@test.com", "password123")

    response = await client.post(
        "/api/v1/users",
        json={
            "email": "new-user@test.com",
            "temporary_password": "password123",
            "full_name": "New User",
            "role": "viewer",
        },
        headers=headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_recruiter_can_list_active_managers(client: AsyncClient, db_session: AsyncSession):
    recruiter = await _create_active_user(
        db_session,
        "manager-list-recruiter@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    active_manager = await _create_active_user(
        db_session,
        "manager-list-active@test.com",
        "password123",
        UserRole.MANAGER,
    )
    inactive_manager = await _create_active_user(
        db_session,
        "manager-list-inactive@test.com",
        "password123",
        UserRole.MANAGER,
    )
    repo = SQLAlchemyUserRepository(db_session)
    inactive_manager.status = UserStatus.INACTIVE
    await repo.save(inactive_manager)
    await db_session.commit()
    await _create_active_user(
        db_session,
        "manager-list-viewer@test.com",
        "password123",
        UserRole.VIEWER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    response = await client.get("/api/v1/users/managers", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert "managers" in payload
    assert payload["managers"] == [
        {
            "id": str(active_manager.id),
            "name": active_manager.full_name,
            "email": active_manager.email,
            "role": "manager",
        }
    ]


@pytest.mark.asyncio
async def test_admin_can_list_active_managers(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(
        db_session,
        "manager-list-admin@test.com",
        "password123",
        UserRole.ADMIN,
    )
    manager = await _create_active_user(
        db_session,
        "manager-list-admin-target@test.com",
        "password123",
        UserRole.MANAGER,
    )
    headers = await _auth_headers(client, admin.email, "password123")

    response = await client.get("/api/v1/users/managers", headers=headers)

    assert response.status_code == 200
    assert any(item["id"] == str(manager.id) for item in response.json()["managers"])


@pytest.mark.asyncio
async def test_candidate_and_viewer_cannot_list_managers(client: AsyncClient, db_session: AsyncSession):
    viewer = await _create_active_user(
        db_session,
        "manager-list-viewer-only@test.com",
        "password123",
        UserRole.VIEWER,
    )
    candidate = await _create_active_user(
        db_session,
        "manager-list-candidate@test.com",
        "password123",
        UserRole.CANDIDATE,
    )
    viewer_headers = await _auth_headers(client, viewer.email, "password123")
    candidate_headers = await _auth_headers(client, candidate.email, "password123")

    viewer_response = await client.get("/api/v1/users/managers", headers=viewer_headers)
    candidate_response = await client.get("/api/v1/users/managers", headers=candidate_headers)

    assert viewer_response.status_code == 403
    assert candidate_response.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_manage_user_lifecycle(client: AsyncClient, db_session: AsyncSession):
    admin = await _create_active_user(
        db_session,
        "admin-user@test.com",
        "password123",
        UserRole.ADMIN,
    )
    headers = await _auth_headers(client, "admin-user@test.com", "password123")

    create = await client.post(
        "/api/v1/users",
        json={
            "email": "MANAGED.USER@TEST.COM",
            "temporary_password": "password123",
            "full_name": "Managed User",
            "role": "viewer",
        },
        headers=headers,
    )
    assert create.status_code == 201
    created = create.json()
    assert created["email"] == "managed.user@test.com"
    assert created["status"] == "active"

    user_id = created["id"]
    duplicate = await client.post(
        "/api/v1/users",
        json={
            "email": "managed.user@test.com",
            "temporary_password": "password123",
            "full_name": "Duplicate User",
            "role": "viewer",
        },
        headers=headers,
    )
    assert duplicate.status_code == 409

    detail = await client.get(f"/api/v1/users/{user_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["id"] == user_id

    listing = await client.get("/api/v1/users?search=managed", headers=headers)
    assert listing.status_code == 200
    assert any(item["id"] == user_id for item in listing.json()["data"])

    update = await client.patch(
        f"/api/v1/users/{user_id}",
        json={"full_name": "Managed Viewer", "role": "viewer"},
        headers=headers,
    )
    assert update.status_code == 200
    assert update.json()["full_name"] == "Managed Viewer"
    assert update.json()["role"] == "viewer"

    activate = await client.patch(f"/api/v1/users/{user_id}/activate", headers=headers)
    assert activate.status_code == 200
    assert activate.json()["status"] == "active"

    self_deactivate = await client.patch(f"/api/v1/users/{admin.id}/deactivate", headers=headers)
    assert self_deactivate.status_code == 422

    deactivate = await client.patch(f"/api/v1/users/{user_id}/deactivate", headers=headers)
    assert deactivate.status_code == 200
    assert deactivate.json()["status"] == "inactive"

    delete = await client.delete(f"/api/v1/users/{user_id}", headers=headers)
    assert delete.status_code == 204

    deleted_detail = await client.get(f"/api/v1/users/{user_id}", headers=headers)
    assert deleted_detail.status_code == 404
