from datetime import UTC, datetime
from uuid import uuid4

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import CandidateJobPipelineModel
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.user_model import UserModel
from src.infrastructure.repositories.sqlalchemy_pipeline_repository import SQLAlchemyPipelineRepository


@pytest.mark.asyncio
async def test_attach_analysis_to_entry_updates_only_active_pipeline_row(
    db_session: AsyncSession,
) -> None:
    now = datetime.now(UTC)

    user = UserModel(
        id=uuid4(),
        email=f"pipeline-guard-{uuid4().hex[:8]}@test.com",
        password_hash="hash",
        role="recruiter",
        status="active",
        full_name="Pipeline Guard",
    )
    candidate = CandidateModel(
        id=uuid4(),
        full_name="Candidate Guard",
        created_by=user.id,
    )
    job = JobModel(
        id=uuid4(),
        title="Guard Job",
        description="Guard job description",
        status="published",
        created_by=user.id,
    )
    db_session.add_all([user, candidate, job])
    await db_session.flush()

    active_row = CandidateJobPipelineModel(
        candidate_id=candidate.id,
        job_id=job.id,
        candidate_job_pipeline_id=uuid4(),
        pipeline_stage="entry",
        link_status="active",
        relationship_status="active",
        pipeline_status="active",
        is_terminal=False,
        terminated_at=None,
        created_at=now,
        updated_at=now,
    )
    db_session.add(active_row)
    await db_session.commit()

    repo = SQLAlchemyPipelineRepository(db_session)
    analysis_id = uuid4()
    resume_version_id = uuid4()

    updated = await repo.attach_analysis_to_entry(
        candidate_id=candidate.id,
        job_id=job.id,
        resume_version_id=resume_version_id,
        analysis_id=analysis_id,
        updated_at=now,
    )
    await db_session.commit()

    assert updated is not None

    fresh_active = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert fresh_active is not None
    assert fresh_active.current_analysis_id == analysis_id
    assert fresh_active.resume_version_id == resume_version_id

    archived_at = datetime.now(UTC)
    fresh_active.relationship_status = "archived"
    fresh_active.link_status = "transferred"
    fresh_active.pipeline_status = "terminal"
    fresh_active.is_terminal = True
    fresh_active.terminated_at = archived_at
    fresh_active.termination_reason = "candidate_transferred"
    await db_session.commit()

    second = await repo.attach_analysis_to_entry(
        candidate_id=candidate.id,
        job_id=job.id,
        resume_version_id=uuid4(),
        analysis_id=uuid4(),
        updated_at=datetime.now(UTC),
    )
    await db_session.commit()

    assert second is None

    unchanged = await db_session.scalar(
        sa.select(CandidateJobPipelineModel).where(
            CandidateJobPipelineModel.candidate_id == candidate.id,
            CandidateJobPipelineModel.job_id == job.id,
        )
    )
    assert unchanged is not None
    assert unchanged.current_analysis_id == analysis_id
    assert unchanged.resume_version_id == resume_version_id
