from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models.candidate_job_pipeline_model import (
    CandidateJobPipelineEventModel,
    CandidateJobPipelineModel,
)
from src.infrastructure.database.models.candidate_model import CandidateModel
from src.infrastructure.database.models.job_model import JobModel
from src.infrastructure.database.models.profile_analysis_model import (
    CandidateJobMatchModel,
    CandidateProfileAnalysisModel,
    JobProfileAnalysisModel,
)
from src.infrastructure.database.models.resume_model import ResumeModel, ResumeVersionModel
from src.infrastructure.database.models.user_model import UserModel


async def _enable_sqlite_foreign_keys(session: AsyncSession) -> None:
    await session.execute(sa.text("PRAGMA foreign_keys=ON"))


async def _seed_core_entities(session: AsyncSession) -> tuple[UUID, UUID, UUID, UUID]:
    now = datetime.now(timezone.utc)
    recruiter_id = uuid4()
    candidate_id = uuid4()
    resume_id = uuid4()
    resume_version_id = uuid4()
    job_id = uuid4()

    recruiter = UserModel(
        id=recruiter_id,
        email=f"recruiter-{uuid4()}@test.com",
        password_hash="hash",
        role="recruiter",
        status="active",
        full_name="Recruiter",
        created_at=now,
        updated_at=now,
    )
    session.add(recruiter)
    await session.flush()

    candidate = CandidateModel(
        id=candidate_id,
        full_name="Candidate",
        email=f"candidate-{uuid4()}@test.com",
        created_by=recruiter.id,
        created_at=now,
        updated_at=now,
    )
    session.add(candidate)
    await session.flush()

    resume = ResumeModel(
        id=resume_id,
        candidate_id=candidate.id,
        title="Resume",
        status="active",
        current_version=1,
        created_by=recruiter.id,
        created_at=now,
        updated_at=now,
    )
    session.add(resume)
    await session.flush()

    resume_version = ResumeVersionModel(
        id=resume_version_id,
        resume_id=resume.id,
        version_number=1,
        s3_bucket="bucket",
        s3_key="key",
        original_file_name="resume.pdf",
        file_size_bytes=100,
        file_hash_sha256="a" * 64,
        mime_type="application/pdf",
        extraction_status="completed",
        uploaded_by=recruiter.id,
        uploaded_at=now,
    )
    session.add(resume_version)

    job = JobModel(
        id=job_id,
        title="Backend Engineer",
        description="Build APIs",
        status="published",
        created_by=recruiter.id,
        created_at=now,
        updated_at=now,
    )
    session.add(job)

    await session.flush()

    return recruiter.id, candidate.id, resume_version.id, job.id


@pytest.mark.asyncio
async def test_candidate_profile_analysis_unique_constraint(db_session: AsyncSession) -> None:
    await _enable_sqlite_foreign_keys(db_session)
    _, candidate_id, resume_version_id, _ = await _seed_core_entities(db_session)

    first = CandidateProfileAnalysisModel(
        candidate_id=candidate_id,
        resume_version_id=resume_version_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="v1",
        experience_years=Decimal("5.0"),
    )
    db_session.add(first)
    await db_session.flush()

    duplicate = CandidateProfileAnalysisModel(
        candidate_id=candidate_id,
        resume_version_id=resume_version_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="v1",
        experience_years=Decimal("6.0"),
    )
    db_session.add(duplicate)

    with pytest.raises(sa.exc.IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_job_profile_analysis_unique_constraint(db_session: AsyncSession) -> None:
    await _enable_sqlite_foreign_keys(db_session)
    _, _, _, job_id = await _seed_core_entities(db_session)

    first = JobProfileAnalysisModel(
        job_id=job_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="job_profiler_v1",
        job_signature_hash="abc123",
    )
    db_session.add(first)
    await db_session.flush()

    duplicate = JobProfileAnalysisModel(
        job_id=job_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="job_profiler_v1",
        job_signature_hash="abc123",
    )
    db_session.add(duplicate)

    with pytest.raises(sa.exc.IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_candidate_job_match_unique_constraint(db_session: AsyncSession) -> None:
    await _enable_sqlite_foreign_keys(db_session)
    _, candidate_id, resume_version_id, job_id = await _seed_core_entities(db_session)

    profile = CandidateProfileAnalysisModel(
        candidate_id=candidate_id,
        resume_version_id=resume_version_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="v1",
    )
    job_profile = JobProfileAnalysisModel(
        job_id=job_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="job_profiler_v1",
        job_signature_hash="hash-1",
    )
    db_session.add_all([profile, job_profile])
    await db_session.flush()

    pipeline_id = uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=pipeline_id,
            candidate_id=candidate_id,
            job_id=job_id,
            resume_version_id=resume_version_id,
            link_status="active",
            pipeline_stage="entry",
            pipeline_status="active",
            source="manual",
        )
    )
    await db_session.flush()

    first = CandidateJobMatchModel(
        candidate_id=candidate_id,
        job_id=job_id,
        resume_version_id=resume_version_id,
        candidate_profile_analysis_id=profile.id,
        job_profile_analysis_id=job_profile.id,
        candidate_job_pipeline_id=pipeline_id,
        match_score=Decimal("88.0"),
    )
    db_session.add(first)
    await db_session.flush()

    duplicate = CandidateJobMatchModel(
        candidate_id=candidate_id,
        job_id=job_id,
        resume_version_id=resume_version_id,
        candidate_profile_analysis_id=profile.id,
        job_profile_analysis_id=job_profile.id,
        candidate_job_pipeline_id=pipeline_id,
        match_score=Decimal("90.0"),
    )
    db_session.add(duplicate)

    with pytest.raises(sa.exc.IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_pipeline_event_idempotency_key_unique_constraint(db_session: AsyncSession) -> None:
    await _enable_sqlite_foreign_keys(db_session)
    recruiter_id, candidate_id, resume_version_id, job_id = await _seed_core_entities(db_session)

    pipeline_id = uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=pipeline_id,
            candidate_id=candidate_id,
            job_id=job_id,
            resume_version_id=resume_version_id,
            link_status="active",
            pipeline_stage="entry",
            pipeline_status="active",
            source="manual",
        )
    )
    await db_session.flush()

    first = CandidateJobPipelineEventModel(
        candidate_id=candidate_id,
        job_id=job_id,
        event_type="stage_moved",
        from_stage="entry",
        to_stage="screening",
        actor_id=recruiter_id,
        idempotency_key="evt:1",
    )
    db_session.add(first)
    await db_session.flush()

    duplicate = CandidateJobPipelineEventModel(
        candidate_id=candidate_id,
        job_id=job_id,
        event_type="stage_moved",
        from_stage="screening",
        to_stage="final",
        actor_id=recruiter_id,
        idempotency_key="evt:1",
    )
    db_session.add(duplicate)

    with pytest.raises(sa.exc.IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_candidate_job_match_pipeline_fk_enforced(db_session: AsyncSession) -> None:
    await _enable_sqlite_foreign_keys(db_session)
    _, candidate_id, resume_version_id, job_id = await _seed_core_entities(db_session)

    profile = CandidateProfileAnalysisModel(
        candidate_id=candidate_id,
        resume_version_id=resume_version_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="v1",
    )
    job_profile = JobProfileAnalysisModel(
        job_id=job_id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="job_profiler_v1",
        job_signature_hash="hash-2",
    )
    db_session.add_all([profile, job_profile])
    await db_session.flush()

    valid_pipeline_id = uuid5(NAMESPACE_URL, f"{candidate_id}:{job_id}")
    db_session.add(
        CandidateJobPipelineModel(
            candidate_job_pipeline_id=valid_pipeline_id,
            candidate_id=candidate_id,
            job_id=job_id,
            resume_version_id=resume_version_id,
            link_status="active",
            pipeline_stage="entry",
            pipeline_status="active",
            source="manual",
        )
    )
    await db_session.flush()

    valid_match = CandidateJobMatchModel(
        candidate_id=candidate_id,
        job_id=job_id,
        resume_version_id=resume_version_id,
        candidate_profile_analysis_id=profile.id,
        job_profile_analysis_id=job_profile.id,
        candidate_job_pipeline_id=valid_pipeline_id,
    )
    db_session.add(valid_match)
    await db_session.flush()

    another_job = JobModel(
        id=uuid4(),
        title="Data Engineer",
        description="Build pipelines",
        status="published",
        created_by=(await db_session.scalar(sa.select(UserModel.id).limit(1))),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(another_job)
    await db_session.flush()

    second_job_profile = JobProfileAnalysisModel(
        job_id=another_job.id,
        provider="anthropic",
        model_id="claude-3-5-sonnet",
        prompt_version="job_profiler_v1",
        job_signature_hash="hash-3",
    )
    db_session.add(second_job_profile)
    await db_session.flush()

    invalid_match = CandidateJobMatchModel(
        candidate_id=candidate_id,
        job_id=another_job.id,
        resume_version_id=resume_version_id,
        candidate_profile_analysis_id=profile.id,
        job_profile_analysis_id=second_job_profile.id,
        candidate_job_pipeline_id=uuid4(),
    )
    db_session.add(invalid_match)

    with pytest.raises(sa.exc.IntegrityError):
        await db_session.flush()
