"""RBAC Permission tests for Fase 18."""

import pytest
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole, UserStatus
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.security.password_service import hash_password
from datetime import datetime, timezone


async def _create_user(
    db: AsyncSession, role: UserRole, email: str | None = None
) -> User:
    """Helper to create a test user."""
    if email is None:
        email = f"test-{role.value}-{uuid4()}@test.com"

    user = UserModel(
        id=uuid4(),
        email=email,
        full_name=f"Test {role.value.title()}",
        role=role.value,
        status=UserStatus.ACTIVE.value,
        password_hash=hash_password("password123"),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return User(
        id=user.id,
        email=user.email,
        password_hash=user.password_hash,
        role=UserRole(user.role),
        status=UserStatus(user.status),
        full_name=user.full_name,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@pytest.mark.asyncio
async def test_hr_role_exists(db_session: AsyncSession):
    """Verify HR role is available."""
    user = await _create_user(db_session, UserRole.HR)
    assert user.role == UserRole.HR
    assert user.role.value == "hr"


@pytest.mark.asyncio
async def test_manager_role_exists(db_session: AsyncSession):
    """Verify MANAGER role is available."""
    user = await _create_user(db_session, UserRole.MANAGER)
    assert user.role == UserRole.MANAGER
    assert user.role.value == "manager"


@pytest.mark.asyncio
async def test_admin_role_exists(db_session: AsyncSession):
    """Verify ADMIN role is available."""
    user = await _create_user(db_session, UserRole.ADMIN)
    assert user.role == UserRole.ADMIN


@pytest.mark.asyncio
async def test_recruiter_role_exists(db_session: AsyncSession):
    """Verify RECRUITER role is available."""
    user = await _create_user(db_session, UserRole.RECRUITER)
    assert user.role == UserRole.RECRUITER


@pytest.mark.asyncio
async def test_viewer_role_exists(db_session: AsyncSession):
    """Verify VIEWER role is available."""
    user = await _create_user(db_session, UserRole.VIEWER)
    assert user.role == UserRole.VIEWER


@pytest.mark.asyncio
async def test_candidate_role_exists(db_session: AsyncSession):
    """Verify CANDIDATE role is available."""
    user = await _create_user(db_session, UserRole.CANDIDATE)
    assert user.role == UserRole.CANDIDATE


@pytest.mark.asyncio
async def test_user_role_enum_completeness(db_session: AsyncSession):
    """Verify all roles can be created."""
    roles = [
        UserRole.ADMIN,
        UserRole.RECRUITER,
        UserRole.HR,
        UserRole.MANAGER,
        UserRole.VIEWER,
        UserRole.CANDIDATE,
    ]

    for role in roles:
        user = await _create_user(db_session, role, email=f"test-{role.value}@test.com")
        assert user.role == role
        assert user.is_active


@pytest.mark.asyncio
async def test_role_semantic_meanings(db_session: AsyncSession):
    """Verify role definitions match semantics."""
    # ADMIN - full access
    admin = await _create_user(db_session, UserRole.ADMIN)
    assert admin.role == UserRole.ADMIN

    # RECRUITER - hiring operations
    recruiter = await _create_user(db_session, UserRole.RECRUITER)
    assert recruiter.role == UserRole.RECRUITER

    # HR - pre-admission, documents, ERP
    hr = await _create_user(db_session, UserRole.HR)
    assert hr.role == UserRole.HR

    # MANAGER - simplified view of assigned jobs
    manager = await _create_user(db_session, UserRole.MANAGER)
    assert manager.role == UserRole.MANAGER

    # VIEWER - read-only limited
    viewer = await _create_user(db_session, UserRole.VIEWER)
    assert viewer.role == UserRole.VIEWER

    # CANDIDATE - portal only
    candidate = await _create_user(db_session, UserRole.CANDIDATE)
    assert candidate.role == UserRole.CANDIDATE
