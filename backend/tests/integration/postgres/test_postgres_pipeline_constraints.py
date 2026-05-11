from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.services.pipeline_service import PipelineService
from src.domain.entities.user import UserRole
from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository
from src.interface.api.schemas.pipeline_schemas import TransferCandidateJobRequest
from tests.integration.helpers import _auth_headers, _create_active_user


pytestmark = [pytest.mark.asyncio, pytest.mark.postgres]


async def _seed_candidate_and_jobs(
    db_session: AsyncSession,
    *,
    created_by: UUID,
) -> tuple[CandidateModel, JobModel, JobModel]:
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidate Postgres",
        email=f"postgres-candidate-{uuid4().hex[:6]}@example.com",
        created_by=created_by,
        location_country="BR",
        tags=[],
    )
    job_a = JobModel(
        id=uuid4(),
        title="Postgres Job A",
        description="Published job A for pipeline constraint checks.",
        status="published",
        created_by=created_by,
    )
    job_b = JobModel(
        id=uuid4(),
        title="Postgres Job B",
        description="Published job B for pipeline constraint checks.",
        status="published",
        created_by=created_by,
    )
    db_session.add_all([candidate, job_a, job_b])
    await db_session.commit()
    return candidate, job_a, job_b


@pytest.mark.postgres
async def test_postgres_partial_unique_index_blocks_second_active_pipeline(
    db_session: AsyncSession,
) -> None:
    user = UserModel(
        id=uuid4(),
        email=f"postgres-owner-{uuid4().hex[:6]}@example.com",
        password_hash="hash",
        role="recruiter",
        status="active",
        full_name="Recruiter",
    )
    db_session.add(user)
    await db_session.commit()

    candidate, job_a, job_b = await _seed_candidate_and_jobs(db_session, created_by=user.id)

    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=job_a.id,
            link_status="active",
            relationship_status="active",
            is_terminal=False,
            terminated_at=None,
            pipeline_stage="entry",
            pipeline_status="active",
            source="manual",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    await db_session.commit()

    db_session.add(
        CandidateJobPipelineModel(
            candidate_id=candidate.id,
            job_id=job_b.id,
            link_status="active",
            relationship_status="active",
            is_terminal=False,
            terminated_at=None,
            pipeline_stage="entry",
            pipeline_status="active",
            source="manual",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.postgres
async def test_postgres_pipeline_api_returns_409_and_transfer_keeps_single_active(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    recruiter = await _create_active_user(
        db_session,
        f"postgres-recruiter-{uuid4().hex[:6]}@test.com",
        "password123",
        UserRole.RECRUITER,
    )
    headers = await _auth_headers(client, recruiter.email, "password123")

    candidate, job_a, job_b = await _seed_candidate_and_jobs(db_session, created_by=recruiter.id)
    candidate_id = candidate.id
    job_a_id = job_a.id
    job_b_id = job_b.id

    add_a = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_a_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_a.status_code == 200, add_a.text

    add_b = await client.post(
        f"/api/v1/pipeline/{candidate_id}/add-to-job",
        json={"job_id": str(job_b_id), "initial_stage": "entry"},
        headers=headers,
    )
    assert add_b.status_code == 409

    service = PipelineService(SQLAlchemyPipelineRepository(db_session), db_session)
    await service.transfer_candidate_job(
        candidate_id=candidate_id,
        body=TransferCandidateJobRequest(
            from_job_id=job_a_id,
            to_job_id=job_b_id,
            reason="better_fit",
        ),
        moved_by=recruiter.id,
    )
    await db_session.commit()

    active_count = await db_session.scalar(
        sa.select(sa.func.count())
        .select_from(CandidateJobPipelineModel)
        .where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.relationship_status == "active",
            CandidateJobPipelineModel.is_terminal.is_(False),
            CandidateJobPipelineModel.terminated_at.is_(None),
        )
    )
    assert active_count == 1

    source = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_a_id,
        )
    )
    destination = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate_id,
            CandidateJobPipelineModel.job_id == job_b_id,
        )
    )
    assert source is not None
    assert destination is not None
    assert source.relationship_status == "archived"
    assert source.link_status == "transferred"
    assert destination.relationship_status == "active"
    assert destination.link_status == "active"
