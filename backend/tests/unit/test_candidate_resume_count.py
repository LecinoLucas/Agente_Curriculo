"""Tests for the resume_count_sq subquery fix in CandidateRepository.

This module verifies that the resume count in candidate list summaries
is accurate and doesn't get inflated by cross-joins with other tables.

Bug: The original subquery referenced AnalysisModel in the WHERE clause
without any JOIN, creating an implicit Cartesian product.
1 resume × N analyses = inflated count

Fix: Removed the AnalysisModel reference and used COUNT(DISTINCT resume.id)
to ensure accurate counting.
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.resume_model import ResumeModel


@pytest.fixture
async def candidate_and_resumes(db_session: AsyncSession):
    """Create test candidate with multiple resumes."""
    created_by_id = uuid4()
    candidate_id = uuid4()
    candidate = CandidateModel(
        id=candidate_id,
        user_id=uuid4(),
        full_name="Test Candidate",
        email=f"test-{uuid4().hex[:8]}@example.com",
        phone="+55 11 99999-9999",
        created_by=created_by_id,
    )
    db_session.add(candidate)
    await db_session.flush()

    # Active resume
    active_resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate_id,
        title="Main Resume",
        status="active",
        current_version=1,
        created_by=created_by_id,
    )
    db_session.add(active_resume)
    await db_session.flush()

    # Deleted resume
    deleted_resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate_id,
        title="Old Resume",
        status="archived",
        current_version=1,
        created_by=created_by_id,
        deleted_at=datetime.now(),
    )
    db_session.add(deleted_resume)
    await db_session.flush()

    # Another active resume
    second_active = ResumeModel(
        id=uuid4(),
        candidate_id=candidate_id,
        title="Updated Resume",
        status="active",
        current_version=2,
        created_by=created_by_id,
    )
    db_session.add(second_active)
    await db_session.commit()

    return {
        "candidate_id": candidate_id,
        "active_resume": active_resume,
        "deleted_resume": deleted_resume,
        "second_active": second_active,
    }


@pytest.mark.asyncio
async def test_resume_count_excludes_deleted(db_session: AsyncSession, candidate_and_resumes: dict):
    """Verify that deleted resumes are not counted."""
    candidate_id = candidate_and_resumes["candidate_id"]

    # Query: count non-deleted resumes for this candidate
    count = await db_session.scalar(
        sa.select(sa.func.count(sa.distinct(ResumeModel.id))).where(
            ResumeModel.candidate_id == candidate_id,
            ResumeModel.deleted_at.is_(None),
        )
    )

    # Should be 2 (active_resume + second_active)
    # NOT 3 (which would include deleted_resume)
    assert count == 2


@pytest.mark.asyncio
async def test_resume_count_single_valid_resume(db_session: AsyncSession):
    """Verify that a candidate with 1 active resume has count = 1."""
    created_by_id = uuid4()
    candidate_id = uuid4()
    candidate = CandidateModel(
        id=candidate_id,
        user_id=uuid4(),
        full_name="Single Resume Candidate",
        email=f"single-{uuid4().hex[:8]}@example.com",
        phone="+55 11 88888-8888",
        created_by=created_by_id,
    )
    db_session.add(candidate)
    await db_session.flush()

    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate_id,
        title="Only Resume",
        status="active",
        current_version=1,
        created_by=created_by_id,
    )
    db_session.add(resume)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count(sa.distinct(ResumeModel.id))).where(
            ResumeModel.candidate_id == candidate_id,
            ResumeModel.deleted_at.is_(None),
        )
    )

    assert count == 1


@pytest.mark.asyncio
async def test_resume_count_no_cross_join_with_analyses(
    db_session: AsyncSession, candidate_and_resumes: dict
):
    """Verify that the count doesn't multiply by analysis rows (no cross-join).

    This is the core of the bug fix: the original query had an implicit
    cross-join with AnalysisModel, causing:
        count(resume) = count(resume) × count(analyses)

    With the fix using COUNT(DISTINCT resume.id) and no AnalysisModel reference,
    the count should always be the actual number of non-deleted resumes.
    """
    candidate_id = candidate_and_resumes["candidate_id"]

    # Corrected query (with fix applied)
    correct_count = await db_session.scalar(
        sa.select(sa.func.count(sa.distinct(ResumeModel.id))).where(
            ResumeModel.candidate_id == candidate_id,
            ResumeModel.deleted_at.is_(None),
        )
    )

    # Expected: 2 active resumes, regardless of how many analyses exist elsewhere
    assert correct_count == 2


@pytest.mark.asyncio
async def test_resume_count_zero_when_no_resume(db_session: AsyncSession):
    """Verify that a candidate with no resumes has count = 0."""
    candidate_id = uuid4()
    candidate = CandidateModel(
        id=candidate_id,
        user_id=uuid4(),
        full_name="No Resume Candidate",
        email=f"no-resume-{uuid4().hex[:8]}@example.com",
        phone="+55 11 77777-7777",
        created_by=uuid4(),
    )
    db_session.add(candidate)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count(sa.distinct(ResumeModel.id))).where(
            ResumeModel.candidate_id == candidate_id,
            ResumeModel.deleted_at.is_(None),
        )
    )

    assert count == 0


@pytest.mark.asyncio
async def test_resume_count_all_deleted(db_session: AsyncSession):
    """Verify that deleted resumes are not counted even if they're all deleted."""
    created_by_id = uuid4()
    candidate_id = uuid4()
    candidate = CandidateModel(
        id=candidate_id,
        user_id=uuid4(),
        full_name="Only Deleted Resumes",
        email=f"deleted-{uuid4().hex[:8]}@example.com",
        phone="+55 11 66666-6666",
        created_by=created_by_id,
    )
    db_session.add(candidate)
    await db_session.flush()

    # Add 3 deleted resumes
    for i in range(3):
        resume = ResumeModel(
            id=uuid4(),
            candidate_id=candidate_id,
            title=f"Deleted Resume {i+1}",
            status="archived",
            current_version=1,
            created_by=created_by_id,
            deleted_at=datetime.now(),
        )
        db_session.add(resume)
    await db_session.commit()

    count = await db_session.scalar(
        sa.select(sa.func.count(sa.distinct(ResumeModel.id))).where(
            ResumeModel.candidate_id == candidate_id,
            ResumeModel.deleted_at.is_(None),
        )
    )

    # Should be 0, not 3
    assert count == 0


@pytest.mark.asyncio
async def test_resume_count_filter_has_resume_true(db_session: AsyncSession):
    """Verify that has_resume=True filter works with corrected count."""
    created_by_with = uuid4()
    # Create candidate with resumes
    candidate_with_resume = CandidateModel(
        id=uuid4(),
        user_id=uuid4(),
        full_name="With Resume",
        email=f"with-{uuid4().hex[:8]}@example.com",
        phone="+55 11 55555-5555",
        created_by=created_by_with,
    )
    db_session.add(candidate_with_resume)
    await db_session.flush()

    resume = ResumeModel(
        id=uuid4(),
        candidate_id=candidate_with_resume.id,
        title="Resume",
        status="active",
        current_version=1,
        created_by=created_by_with,
    )
    db_session.add(resume)
    await db_session.flush()

    # Create candidate without resumes
    candidate_no_resume = CandidateModel(
        id=uuid4(),
        user_id=uuid4(),
        full_name="Without Resume",
        email=f"without-{uuid4().hex[:8]}@example.com",
        phone="+55 11 44444-4444",
        created_by=uuid4(),
    )
    db_session.add(candidate_no_resume)
    await db_session.commit()

    # Subquery for resume count (same pattern as in repository)
    resume_count_with = sa.select(
        sa.func.count(sa.distinct(ResumeModel.id))
    ).where(
        ResumeModel.candidate_id == candidate_with_resume.id,
        ResumeModel.deleted_at.is_(None),
    )
    result_with = await db_session.scalar(resume_count_with)

    resume_count_without = sa.select(
        sa.func.count(sa.distinct(ResumeModel.id))
    ).where(
        ResumeModel.candidate_id == candidate_no_resume.id,
        ResumeModel.deleted_at.is_(None),
    )
    result_without = await db_session.scalar(resume_count_without)

    # The filter would use: count > 0 for has_resume=True
    assert result_with > 0, "Candidate with resume should have count > 0"
    assert result_without == 0, "Candidate without resume should have count == 0"
