from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from src.infrastructure.database.base import Base
from src.infrastructure.database.models import CandidateModel, InterviewScheduleModel, JobModel
from src.infrastructure.repositories.sqlalchemy_interview_schedule_repository import (
    SQLAlchemyInterviewScheduleRepository,
)


@pytest.fixture
async def test_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    yield async_session

    await engine.dispose()


async def seed_candidate_and_job(session: AsyncSession, candidate_name: str = "Candidate Test"):
    candidate = CandidateModel(
        id=uuid4(),
        full_name=candidate_name,
        email=f"{candidate_name.lower().replace(' ', '.')}@example.com",
        created_by=uuid4(),
    )
    job = JobModel(
        id=uuid4(),
        title="Software Engineer",
        description="Job description",
        requirements="Python",
        seniority_level="senior",
        minimum_education_level="bachelor",
        minimum_years_experience=3,
        created_by=uuid4(),
    )
    session.add(candidate)
    session.add(job)
    await session.flush()
    return candidate, job


def build_schedule(
    *,
    candidate_id,
    job_id,
    start,
    end,
    status="scheduled",
    interviewer_name=None,
    interviewer_email=None,
):
    return InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        title="Entrevista técnica",
        scheduled_start=start,
        scheduled_end=end,
        timezone="America/Recife",
        interview_type="technical",
        status=status,
        interviewer_name=interviewer_name,
        interviewer_email=interviewer_email,
    )


class TestInterviewScheduleRepositoryConflicts:
    @pytest.mark.asyncio
    async def test_kpis_work_with_empty_agenda(self, test_db):
        async with test_db() as session:
            repo = SQLAlchemyInterviewScheduleRepository(session)
            kpis = await repo.get_kpis()

            assert kpis["total_scheduled"] == 0
            assert kpis["today_count"] == 0
            assert kpis["upcoming_count"] == 0
            assert kpis["completed_count"] == 0
            assert kpis["cancelled_count"] == 0
            assert kpis["unique_interviewers_count"] == 0

    @pytest.mark.asyncio
    async def test_blocks_overlap_for_same_interviewer_email(self, test_db):
        async with test_db() as session:
            candidate_a, job = await seed_candidate_and_job(session, "Candidate A")
            candidate_b, _ = await seed_candidate_and_job(session, "Candidate B")
            start = datetime.now(timezone.utc) + timedelta(days=1)
            existing = build_schedule(
                candidate_id=candidate_a.id,
                job_id=job.id,
                start=start,
                end=start + timedelta(hours=1),
                interviewer_email="avaliador@empresa.com",
            )
            session.add(existing)
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            conflict = await repo.find_conflicting_schedule(
                candidate_id=candidate_b.id,
                scheduled_start=start + timedelta(minutes=15),
                scheduled_end=start + timedelta(hours=1, minutes=15),
                interviewer_email="avaliador@empresa.com",
            )

            assert conflict is not None
            _, conflict_type = conflict
            assert conflict_type == "interviewer"

    @pytest.mark.asyncio
    async def test_blocks_overlap_for_same_candidate(self, test_db):
        async with test_db() as session:
            candidate, job = await seed_candidate_and_job(session, "Candidate A")
            start = datetime.now(timezone.utc) + timedelta(days=1)
            existing = build_schedule(
                candidate_id=candidate.id,
                job_id=job.id,
                start=start,
                end=start + timedelta(hours=1),
                interviewer_email="um@empresa.com",
            )
            session.add(existing)
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            conflict = await repo.find_conflicting_schedule(
                candidate_id=candidate.id,
                scheduled_start=start + timedelta(minutes=30),
                scheduled_end=start + timedelta(hours=1, minutes=30),
                interviewer_email="outro@empresa.com",
            )

            assert conflict is not None
            _, conflict_type = conflict
            assert conflict_type == "candidate"

    @pytest.mark.asyncio
    async def test_allows_free_slot(self, test_db):
        async with test_db() as session:
            candidate, job = await seed_candidate_and_job(session, "Candidate A")
            start = datetime.now(timezone.utc) + timedelta(days=1)
            existing = build_schedule(
                candidate_id=candidate.id,
                job_id=job.id,
                start=start,
                end=start + timedelta(hours=1),
                interviewer_name="Avaliador Nome",
            )
            session.add(existing)
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            conflict = await repo.find_conflicting_schedule(
                candidate_id=candidate.id,
                scheduled_start=start + timedelta(hours=2),
                scheduled_end=start + timedelta(hours=3),
                interviewer_name="Avaliador Nome",
            )

            assert conflict is None

    @pytest.mark.asyncio
    async def test_ignores_cancelled_interviews(self, test_db):
        async with test_db() as session:
            candidate_a, job = await seed_candidate_and_job(session, "Candidate A")
            candidate_b, _ = await seed_candidate_and_job(session, "Candidate B")
            start = datetime.now(timezone.utc) + timedelta(days=1)
            cancelled = build_schedule(
                candidate_id=candidate_a.id,
                job_id=job.id,
                start=start,
                end=start + timedelta(hours=1),
                status="cancelled",
                interviewer_email="avaliador@empresa.com",
            )
            session.add(cancelled)
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            conflict = await repo.find_conflicting_schedule(
                candidate_id=candidate_b.id,
                scheduled_start=start + timedelta(minutes=15),
                scheduled_end=start + timedelta(hours=1, minutes=15),
                interviewer_email="avaliador@empresa.com",
            )

            assert conflict is None

    @pytest.mark.asyncio
    async def test_ignores_same_schedule_when_editing(self, test_db):
        async with test_db() as session:
            candidate, job = await seed_candidate_and_job(session, "Candidate A")
            start = datetime.now(timezone.utc) + timedelta(days=1)
            existing = build_schedule(
                candidate_id=candidate.id,
                job_id=job.id,
                start=start,
                end=start + timedelta(hours=1),
                interviewer_email="avaliador@empresa.com",
            )
            session.add(existing)
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            conflict = await repo.find_conflicting_schedule(
                candidate_id=candidate.id,
                scheduled_start=start,
                scheduled_end=start + timedelta(hours=1),
                interviewer_email="avaliador@empresa.com",
                exclude_schedule_id=existing.id,
            )

            assert conflict is None

    @pytest.mark.asyncio
    async def test_list_and_kpis_keep_working(self, test_db):
        async with test_db() as session:
            candidate, job = await seed_candidate_and_job(session, "Candidate A")
            start = datetime.now(timezone.utc) + timedelta(days=1)
            session.add_all(
                [
                    build_schedule(
                        candidate_id=candidate.id,
                        job_id=job.id,
                        start=start,
                        end=start + timedelta(hours=1),
                        interviewer_email="um@empresa.com",
                    ),
                    build_schedule(
                        candidate_id=candidate.id,
                        job_id=job.id,
                        start=start + timedelta(days=1),
                        end=start + timedelta(days=1, hours=1),
                        status="cancelled",
                        interviewer_email="dois@empresa.com",
                    ),
                ]
            )
            await session.flush()

            repo = SQLAlchemyInterviewScheduleRepository(session)
            items, total = await repo.list_schedules(page=1, page_size=20)
            kpis = await repo.get_kpis()

            assert total == 2
            assert len(items) == 2
            assert kpis["total_scheduled"] == 2
            assert kpis["cancelled_count"] == 1
