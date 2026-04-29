"""Integration tests for data quality service."""

import pytest
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import User, UserRole
from src.domain.entities.candidate import Candidate
from src.infrastructure.repositories.sqlalchemy_user_repository import SQLAlchemyUserRepository
from src.infrastructure.repositories.sqlalchemy_candidate_repository import SQLAlchemyCandidateRepository
from src.infrastructure.security.password_service import hash_password
from src.application.services.data_quality_service import DataQualityService
from src.domain.enums.data_quality_status import DataQualityStatus


async def _create_user(db: AsyncSession, email: str) -> User:
    """Create a test user."""
    repo = SQLAlchemyUserRepository(db)
    user = User.create(
        email=email,
        password_hash=hash_password("password123"),
        full_name="Test User",
        role=UserRole.RECRUITER,
    )
    user.verify_email()
    await repo.save(user)
    await db.commit()
    return user


async def _create_candidate(db: AsyncSession, created_by: str) -> str:
    """Create a test candidate."""
    repo = SQLAlchemyCandidateRepository(db)
    candidate = Candidate.create(
        full_name="Test Candidate",
        created_by=created_by,
        email="candidate@test.com",
    )
    await repo.save(candidate)
    await db.commit()
    return str(candidate.id)


@pytest.mark.asyncio
async def test_mark_candidate_with_valid_status(db_session: AsyncSession):
    """Test marking a candidate with a valid status."""
    user = await _create_user(db_session, "user1@test.com")
    candidate_id = await _create_candidate(db_session, str(user.id))

    service = DataQualityService(db_session)
    await service.mark_candidate(
        candidate_id=candidate_id,
        status=DataQualityStatus.VALID,
        reason="Has valid resume",
    )

    # Verify the marking
    from sqlalchemy import select
    from src.infrastructure.database.models.candidate_model import CandidateModel
    stmt = select(CandidateModel).where(CandidateModel.id == candidate_id)
    result = await db_session.execute(stmt)
    candidate = result.scalar_one()

    assert candidate.data_quality_status == "valid"
    assert candidate.data_quality_reason == "Has valid resume"
    assert candidate.data_quality_marked_at is not None


@pytest.mark.asyncio
async def test_mark_invalid_with_audit_trail(db_session: AsyncSession):
    """Test marking candidate as invalid records admin info."""
    user = await _create_user(db_session, "admin@test.com")
    candidate_id = await _create_candidate(db_session, str(user.id))

    service = DataQualityService(db_session)
    await service.mark_invalid(
        candidate_id=candidate_id,
        reason="Resume is corrupted and unreadable",
        marked_by=user.id,
    )

    from sqlalchemy import select
    from src.infrastructure.database.models.candidate_model import CandidateModel
    stmt = select(CandidateModel).where(CandidateModel.id == candidate_id)
    result = await db_session.execute(stmt)
    candidate = result.scalar_one()

    assert candidate.data_quality_status == "invalid_manual"
    assert f"[Manual by {user.id}]" in candidate.data_quality_reason
    assert "Resume is corrupted" in candidate.data_quality_reason


@pytest.mark.asyncio
async def test_mark_invalid_with_short_reason_fails(db_session: AsyncSession):
    """Test that short reasons are rejected."""
    user = await _create_user(db_session, "admin2@test.com")
    candidate_id = await _create_candidate(db_session, str(user.id))

    service = DataQualityService(db_session)
    with pytest.raises(ValueError, match="at least 10 characters"):
        await service.mark_invalid(
            candidate_id=candidate_id,
            reason="Bad",  # Too short
            marked_by=user.id,
        )


@pytest.mark.asyncio
async def test_get_candidates_by_quality_status(db_session: AsyncSession):
    """Test fetching candidates by quality status."""
    user = await _create_user(db_session, "user3@test.com")

    # Create multiple candidates
    candidate_ids = []
    for i in range(5):
        cid = await _create_candidate(db_session, str(user.id))
        candidate_ids.append(cid)

    service = DataQualityService(db_session)

    # Mark first 2 as valid
    await service.mark_candidate(candidate_ids[0], DataQualityStatus.VALID, "Valid resume")
    await service.mark_candidate(candidate_ids[1], DataQualityStatus.VALID, "Valid resume")

    # Mark next 2 as no_resume
    await service.mark_candidate(candidate_ids[2], DataQualityStatus.NO_RESUME, "No resume")
    await service.mark_candidate(candidate_ids[3], DataQualityStatus.NO_RESUME, "No resume")

    # Fetch valid candidates
    valid_candidates = await service.get_candidates_by_quality(
        DataQualityStatus.VALID,
        limit=10,
        offset=0,
    )
    assert len(valid_candidates) >= 2
    assert all(c.data_quality_status == "valid" for c in valid_candidates[:2])

    # Fetch no_resume candidates
    no_resume_candidates = await service.get_candidates_by_quality(
        DataQualityStatus.NO_RESUME,
        limit=10,
        offset=0,
    )
    assert len(no_resume_candidates) >= 2
    assert all(c.data_quality_status == "no_resume" for c in no_resume_candidates[:2])


@pytest.mark.asyncio
async def test_exclude_invalid_from_list(db_session: AsyncSession):
    """Test filtering invalid candidates from a list."""
    user = await _create_user(db_session, "user4@test.com")

    # Create candidates
    candidate_ids = []
    for i in range(4):
        cid = await _create_candidate(db_session, str(user.id))
        candidate_ids.append(cid)

    service = DataQualityService(db_session)

    # Mark some as invalid statuses
    await service.mark_candidate(candidate_ids[0], DataQualityStatus.VALID, "Valid")
    await service.mark_candidate(candidate_ids[1], DataQualityStatus.NO_RESUME, "No resume")
    await service.mark_candidate(candidate_ids[2], DataQualityStatus.EMPTY_RESUME, "Empty")
    await service.mark_candidate(candidate_ids[3], DataQualityStatus.VALID, "Valid")

    # Filter the list
    filtered = await service.exclude_invalid_from_ranking(candidate_ids)

    # Should only return the 2 valid candidates
    assert len(filtered) == 2
    assert candidate_ids[0] in filtered
    assert candidate_ids[3] in filtered
    assert candidate_ids[1] not in filtered
    assert candidate_ids[2] not in filtered
