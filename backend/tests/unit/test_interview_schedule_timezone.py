"""
Test that today_count respects America/Recife timezone.

Scenario: When it's 23:30 in America/Recife (still today), it might be 02:30 UTC (next day).
The today_count should reflect the Recife day, not UTC day.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.infrastructure.database.base import Base
from src.infrastructure.database.models import InterviewScheduleModel, CandidateModel, JobModel
from src.infrastructure.repositories.sqlalchemy_interview_schedule_repository import (
    SQLAlchemyInterviewScheduleRepository,
)


@pytest.fixture
async def test_db():
    """Create in-memory SQLite database for testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    yield async_session

    await engine.dispose()


class TestTimezoneTodayCount:
    @pytest.mark.asyncio
    async def test_today_count_respects_recife_timezone(self, test_db):
        """
        Test that today_count is calculated in America/Recife timezone.

        Scenario:
        - Create a schedule at 23:00 America/Recife (which is 02:00 UTC next day)
        - today_count should still count it as "today" in Recife timezone
        """
        async with test_db() as session:
            # Create test data
            candidate = CandidateModel(
                id=uuid4(),
                full_name="Test Candidate",
                created_by=uuid4(),
            )
            job = JobModel(
                id=uuid4(),
                title="Test Job",
                description="Test Description",
                requirements="None",
                seniority_level="senior",
                minimum_education_level="bachelor",
                minimum_years_experience=3,
                created_by=uuid4(),
            )
            session.add(candidate)
            session.add(job)
            await session.flush()

            # Get current time in Recife timezone
            recife_tz = ZoneInfo("America/Recife")
            now_recife = datetime.now(recife_tz)

            # Create an interview at 23:00 Recife time (which is 02:00 UTC next day)
            evening_time_recife = now_recife.replace(hour=23, minute=0, second=0, microsecond=0)
            evening_time_utc = evening_time_recife.astimezone(timezone.utc)

            interview_evening = InterviewScheduleModel(
                id=uuid4(),
                candidate_id=candidate.id,
                job_id=job.id,
                title="Evening Interview",
                scheduled_start=evening_time_utc,
                scheduled_end=evening_time_utc + timedelta(hours=1),
                interview_type="technical",
                status="scheduled",
            )
            session.add(interview_evening)

            # Create an interview tomorrow (in Recife time)
            tomorrow_recife = now_recife + timedelta(days=1)
            tomorrow_time_recife = tomorrow_recife.replace(hour=10, minute=0, second=0, microsecond=0)
            tomorrow_time_utc = tomorrow_time_recife.astimezone(timezone.utc)

            interview_tomorrow = InterviewScheduleModel(
                id=uuid4(),
                candidate_id=candidate.id,
                job_id=job.id,
                title="Tomorrow Interview",
                scheduled_start=tomorrow_time_utc,
                scheduled_end=tomorrow_time_utc + timedelta(hours=1),
                interview_type="technical",
                status="scheduled",
            )
            session.add(interview_tomorrow)
            await session.flush()

            # Get KPIs
            repo = SQLAlchemyInterviewScheduleRepository(session)
            kpis = await repo.get_kpis()

            # Assertions
            assert kpis["total_scheduled"] == 2, f"Expected 2 scheduled, got {kpis['total_scheduled']}"
            assert kpis["today_count"] == 1, (
                f"Expected today_count=1 (evening interview at 23:00 Recife), "
                f"got {kpis['today_count']}"
            )
            assert kpis["upcoming_count"] == 2, f"Expected 2 upcoming, got {kpis['upcoming_count']}"

    @pytest.mark.asyncio
    async def test_today_count_midnight_boundary(self, test_db):
        """Test that interviews exactly at midnight Recife time are handled correctly."""
        async with test_db() as session:
            candidate = CandidateModel(
                id=uuid4(),
                full_name="Test Candidate",
                created_by=uuid4(),
            )
            job = JobModel(
                id=uuid4(),
                title="Test Job",
                description="Test Description",
                requirements="None",
                seniority_level="senior",
                minimum_education_level="bachelor",
                minimum_years_experience=3,
                created_by=uuid4(),
            )
            session.add(candidate)
            session.add(job)
            await session.flush()

            recife_tz = ZoneInfo("America/Recife")
            now_recife = datetime.now(recife_tz)

            # Interview at exactly 00:00 (midnight) Recife time today
            midnight_recife = now_recife.replace(hour=0, minute=0, second=0, microsecond=0)
            midnight_utc = midnight_recife.astimezone(timezone.utc)

            interview_midnight = InterviewScheduleModel(
                id=uuid4(),
                candidate_id=candidate.id,
                job_id=job.id,
                title="Midnight Interview",
                scheduled_start=midnight_utc,
                scheduled_end=midnight_utc + timedelta(hours=1),
                interview_type="technical",
                status="scheduled",
            )
            session.add(interview_midnight)
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            kpis = await repo.get_kpis()

            # Interview at midnight should be counted as today
            assert kpis["today_count"] == 1, f"Expected midnight interview to count as today, got {kpis['today_count']}"
