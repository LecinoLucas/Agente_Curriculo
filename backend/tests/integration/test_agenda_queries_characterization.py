from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.interview_schedule_model import InterviewScheduleModel
from src.infrastructure.database.models.job_model import JobModel
from tests.integration.helpers import _auth_headers, _create_active_user

pytestmark = pytest.mark.asyncio


async def _recruiter_context(
    client: AsyncClient,
    db_session: AsyncSession,
) -> tuple[UUID, dict[str, str]]:
    user = await _create_active_user(
        db_session,
        f"agenda-recruiter-{uuid4().hex}@example.com",
        "Senha123!",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, user.email, "Senha123!")
    return user.id, headers


async def _seed_candidate(
    db_session: AsyncSession,
    *,
    full_name: str,
    created_by: UUID,
) -> CandidateModel:
    candidate = CandidateModel(
        id=uuid4(),
        full_name=full_name,
        email=f"{full_name.lower().replace(' ', '.')}@example.com",
        created_by=created_by,
    )
    db_session.add(candidate)
    await db_session.flush()
    return candidate


async def _seed_job(
    db_session: AsyncSession,
    *,
    title: str,
    created_by: UUID,
) -> JobModel:
    job = JobModel(
        id=uuid4(),
        title=title,
        description=f"Descricao {title}",
        requirements="Python",
        seniority_level="senior",
        minimum_education_level="bachelor",
        minimum_years_experience=3,
        created_by=created_by,
    )
    db_session.add(job)
    await db_session.flush()
    return job


def _schedule(
    *,
    candidate_id: UUID,
    job_id: UUID,
    start: datetime,
    status: str = "scheduled",
    interviewer_name: str | None = None,
    interviewer_email: str | None = None,
    title: str = "Entrevista técnica",
) -> InterviewScheduleModel:
    return InterviewScheduleModel(
        id=uuid4(),
        candidate_id=candidate_id,
        job_id=job_id,
        title=title,
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=1),
        timezone="America/Recife",
        interview_type="technical",
        interview_format="online",
        status=status,
        interviewer_name=interviewer_name,
        interviewer_email=interviewer_email,
    )


async def test_agenda_list_and_kpis_match_with_common_filters(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter_id, headers = await _recruiter_context(client, db_session)
    target_candidate = await _seed_candidate(
        db_session,
        full_name="Ana Agenda",
        created_by=recruiter_id,
    )
    other_candidate = await _seed_candidate(
        db_session,
        full_name="Bruno Agenda",
        created_by=recruiter_id,
    )
    target_job = await _seed_job(
        db_session,
        title="Platform Lead",
        created_by=recruiter_id,
    )
    other_job = await _seed_job(
        db_session,
        title="Data Analyst",
        created_by=recruiter_id,
    )

    start = datetime.now(UTC) + timedelta(days=3)
    db_session.add_all(
        [
            _schedule(
                candidate_id=target_candidate.id,
                job_id=target_job.id,
                start=start,
                interviewer_name="Maria RH",
                interviewer_email="maria.rh@example.com",
                title="Painel Backend",
            ),
            _schedule(
                candidate_id=other_candidate.id,
                job_id=target_job.id,
                start=start,
                status="completed",
                interviewer_name="Maria RH",
                interviewer_email="maria.rh@example.com",
                title="Painel Backend",
            ),
            _schedule(
                candidate_id=other_candidate.id,
                job_id=other_job.id,
                start=start,
                interviewer_name="Outro RH",
                interviewer_email="outro.rh@example.com",
                title="Painel Dados",
            ),
        ]
    )
    await db_session.commit()

    params = {
        "date_from": (start - timedelta(minutes=15)).isoformat(),
        "date_to": (start + timedelta(minutes=15)).isoformat(),
        "status": "scheduled",
        "job_id": str(target_job.id),
        "interviewer": "maria",
        "search": "ana",
    }

    listing = await client.get("/api/v1/agenda/interviews", headers=headers, params=params)
    kpis = await client.get("/api/v1/agenda/kpis", headers=headers, params=params)

    assert listing.status_code == 200, listing.text
    assert kpis.status_code == 200, kpis.text
    assert listing.json()["total"] == 1
    assert listing.json()["total"] == kpis.json()["total_scheduled"]


async def test_agenda_kpis_filter_by_candidate_id(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    created_by, headers = await _recruiter_context(client, db_session)
    first_candidate = await _seed_candidate(
        db_session,
        full_name="Alice Divergence",
        created_by=created_by,
    )
    second_candidate = await _seed_candidate(
        db_session,
        full_name="Bianca Divergence",
        created_by=created_by,
    )
    job = await _seed_job(
        db_session,
        title="Agenda Divergence",
        created_by=created_by,
    )
    start = datetime.now(UTC) + timedelta(days=5)
    db_session.add_all(
        [
            _schedule(candidate_id=first_candidate.id, job_id=job.id, start=start, title="Entrevista A"),
            _schedule(
                candidate_id=second_candidate.id,
                job_id=job.id,
                start=start + timedelta(hours=2),
                title="Entrevista B",
            ),
        ]
    )
    await db_session.commit()

    params = {"candidate_id": str(first_candidate.id)}
    listing = await client.get("/api/v1/agenda/interviews", headers=headers, params=params)
    kpis = await client.get("/api/v1/agenda/kpis", headers=headers, params=params)
    kpis_without_candidate = await client.get("/api/v1/agenda/kpis", headers=headers)

    assert listing.status_code == 200, listing.text
    assert kpis.status_code == 200, kpis.text
    assert kpis_without_candidate.status_code == 200, kpis_without_candidate.text
    assert listing.json()["total"] == 1
    assert kpis.json()["total_scheduled"] == 1
    assert kpis_without_candidate.json()["total_scheduled"] == 2
