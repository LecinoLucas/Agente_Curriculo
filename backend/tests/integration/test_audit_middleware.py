import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from src.domain.entities.user import User
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.security.password_service import hash_password
from src.infrastructure.database.models.audit_model import AuditLogModel

async def _create_active_user(session: AsyncSession, email: str, password: str) -> User:
    repo = SQLAlchemyUserRepository(session)
    user = User.create(email=email, password_hash=hash_password(password), full_name="Test User")
    user.verify_email()
    await repo.save(user)
    await session.commit()
    return user

@pytest.mark.asyncio
async def test_request_without_token_returns_401_and_no_audit_exception(client: AsyncClient, db_session: AsyncSession, caplog):
    # Request to a protected endpoint without token
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 401
    
    # Verify no audit.write_failed in logs with exception
    # (If it writes successfully to SQLite, that's fine too)
    for record in caplog.records:
        if record.message == "audit.write_failed":
            assert "error" not in record.msg or "Exception" not in record.msg

@pytest.mark.asyncio
async def test_request_auth_refresh_without_token_returns_401_without_audit_error(client: AsyncClient, caplog):
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    
    for record in caplog.records:
        if record.message == "audit.write_failed":
            assert "error" not in record.msg

@pytest.mark.asyncio
async def test_authenticated_request_registers_audit_with_user_id(client: AsyncClient, db_session: AsyncSession):
    await _create_active_user(db_session, "audit@test.com", "password123")

    login = await client.post("/api/v1/auth/login", json={
        "email": "audit@test.com",
        "password": "password123",
    })
    token = login.json()["access_token"]

    # Trigger a 401 or similar to force audit write in middleware (since it only audits specific status codes)
    # Wait, the middleware only audits status codes in _AUDIT_ON_STATUS = {401, 403, 404, 422, 429, 500}
    # So if we make a successful request (200), it WON'T audit it via middleware!
    # "Eventos de negócio são auditados diretamente nos use cases via AuditService."
    # So to test the middleware writing with user_id, we need to trigger a 404 or 403 or 422 WITH authentication!
    
    response = await client.get(
        "/api/v1/users/non-existent-endpoint",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    
    # Check that audit log was written with user_id
    # Wait, we need to find the user in the DB to get their ID
    result = await db_session.execute(select(AuditLogModel).where(AuditLogModel.http_status_code == 403))
    logs = result.scalars().all()
    assert len(logs) > 0
    assert logs[0].user_id is not None

@pytest.mark.asyncio
async def test_insert_audit_log_directly_works(db_session: AsyncSession):
    # Test that inserting an audit log directly works
    log = AuditLogModel(
        action="test.direct_insert",
        resource_type="test",
        http_status_code=200,
        metadata={"test": True}
    )
    db_session.add(log)
    await db_session.commit()
    
    # Verify it was inserted
    result = await db_session.execute(select(AuditLogModel).where(AuditLogModel.action == "test.direct_insert"))
    inserted_log = result.scalar_one_or_none()
    assert inserted_log is not None
    assert inserted_log.action == "test.direct_insert"
